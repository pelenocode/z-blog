---
title: "技术手记｜Redis 与数据库事务不在一个世界：afterCommit、显式补偿还是 Canal？"
slug: "redis-compensation-vs-canal"
date: "2026-02-08T21:24:50+08:00"
updated: "2026-09-23T12:00:00+08:00"
description: "从一次 Redis → DB → Redis 流程踩到的两颗雷出发：事务没生效、DB 回滚 Redis 不回滚；区分业务态与缓存态 Redis，比较 afterCommit、显式补偿和 Canal 的适用边界与失败窗口。"
categories:
  - "技术手记"
tags:
  - "Redis"
  - "事务"
  - "Spring"
  - "Canal"
  - "数据库"
draft: false
---
Redis 和事务的雷，我又踩上了（笑）。

# 1. 原始流程：Redis → DB → Redis

我的一个方法流程是：

1. Redis 读写（业务状态）
2. DB 读写（封装在一个 `private` 方法里，加了 `@Transactional`）
3. Redis 读写（缓存态）

这里埋了两颗雷。

# 2. 第一颗雷：数据库事务本身可能没有生效

`private` 方法上加 `@Transactional`，**无效**。

Spring 事务是基于 AOP 代理实现的，只有经过代理对象的调用才会被事务拦截器拦下来。`private` 方法不会被代理拦截；同理，**同一个类里 `this.xxx()` 直接调用**另一个带事务注解的方法，也绕过了代理，注解同样不生效。

改法：

1. **默认方案：拆到独立的 Bean**。把需要事务的 DB 操作挪到另一个 `@Service` 的 `public` 方法里，通过注入调用，事务边界一眼就能看清楚。
2. 或者把 `@Transactional` 加到外层调用它的 `public` 方法上——但要想清楚，这样事务会把前后的 Redis 操作也“包”进去（虽然 Redis 并不会因此回滚），边界容易被误解。
3. AspectJ 编译期 / 加载期织入可以绕过 Spring AOP 的代理限制，但偏重，一般项目没必要为这个引入。

更多事务失效场景，见 [几个关于事务的思考](/posts/transaction-notes)。

# 3. 第二颗雷：DB 回滚不会带着 Redis 回滚

就算事务生效了，还有第二个问题：**DB 和 Redis 不在一个事务里**。DB 回滚了，第 1 步写进 Redis 的东西还在，数据就不一致了。

最直觉的想法是 `afterCommit`：提交事务之后再写 Redis。但我的流程第 1 步 Redis 必须在 DB 之前执行（它是业务前置条件），流程不能拆，所以不能全部挪到提交之后。

那就得先把 Redis 里的数据分清楚。

# 4. 先区分两种 Redis 数据

| 类型 | 例子 | 一致性要求 | 出问题怎么办 |
|---|---|---|---|
| 业务态 Redis | 预占、次数扣减、去重、幂等、限流、工作流 / 状态机 step、分布式锁 | 不进 DB 事务，不追求强一致 | 靠 TTL / 显式补偿 / 对账 |
| 缓存态 Redis（DB 派生） | 详情缓存、聚合结果 | 以 DB 为准 | 严格 `afterCommit`，删缓存 / 重建 |

我的流程里，第 1 步是业务态，第 3 步是缓存态。两者要用不同的办法处理。

# 5. 三种处理方式

## 5.1 `afterCommit`：处理缓存态

```java
TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
    @Override
    public void afterCommit() {
        redisWrite2(); // 删除缓存或重建缓存
    }
});
```

DB 提交成功之后，才去动缓存。DB 回滚了，缓存就不会被写进脏数据。

## 5.2 显式补偿：处理业务态

```java
boolean redisOk = false;

try {
    redisWrite1();       // 业务态：预占 / 扣次数
    redisOk = true;

    dbService.dbWrite(); // 独立 Bean，@Transactional

    redisWrite2();       // 缓存态，最好放到 afterCommit
} catch (Exception e) {
    if (redisOk) {
        redisRollback1(); // 补偿
    }
    throw e;
}
```

这不是强一致，而是“尽力回滚 + 兜底”。适合：状态机、次数扣减、workflow。

## 5.3 Canal / binlog 同步：处理缓存态的另一种方式

- 第 1 步 Redis，业务代码自己写；
- 第 3 步 Redis，交给 Canal。

Canal 监听 DB binlog，在 DB commit 之后异步更新 Redis / ES / MQ。它解决的是「**DB → Redis 的单向同步**」，不能帮你回滚业务态 Redis。

适用场景：

1. 多表、多服务共享 Redis
2. 读多写少
3. 强烈不想在业务代码里碰缓存
4. 接受秒级延迟
5. 有运维精力

所以回到标题的问题：**当 Redis 可以显式补偿的时候，需要上 Canal 吗？** 一般不需要。补偿管业务态，`afterCommit` 管缓存态，已经够用；Canal 是在缓存同步规模上来之后才值得的基础设施。

# 6. 每种方式仍然存在的失败窗口

没有一种方式是完美的，得清楚它们各自会漏在哪里：

| 方式 | 失败窗口 | 兜底 |
|---|---|---|
| `afterCommit` | DB 已提交，但 `afterCommit` 里写 Redis 失败 / 进程挂了 → 缓存是旧的 | 缓存设 TTL；删缓存优于更新缓存 |
| 显式补偿 | 补偿本身失败；DB 提交成功但之后的步骤抛异常，补偿把本该保留的 Redis 状态回滚了；进程在 catch 之前就挂了 | 补偿要幂等；定时对账（以 DB 为准修正 Redis）；业务态加 TTL |
| Canal | 有同步延迟；Canal 挂了会积压；消费失败需要重试 | 监控延迟；消费幂等；必要时全量校准 |

特别注意显式补偿那段代码：如果 `dbWrite()` 已经提交，`redisWrite2()` 才抛异常，catch 里的补偿会把业务态回滚，但 DB 已经改了——这正是为什么缓存态最好挪到 `afterCommit`，别和业务态放在同一个 try 里。

# 7. 场景决策表与回归测试

## 决策表

| 场景 | 推荐 |
|---|---|
| DB 派生的详情缓存，单服务 | `afterCommit` 删缓存 + TTL |
| 次数扣减、预占、状态机 step | 显式补偿 + 对账 + TTL |
| 多服务共享缓存、读多写少、接受秒级延迟 | Canal |
| 要求写后立刻强一致 | 别指望 Redis 和 DB 一起提交，重新设计：以 DB 为唯一事实源 |

## 回归测试

1. **事务生效测试**：DB 写到一半抛异常，断言 DB 确实回滚了（顺便验证不是 `private` / 自调用）。
2. **DB 回滚测试**：`dbWrite()` 抛异常，断言业务态 Redis 被补偿回原值、缓存态没有被写入。
3. **补偿失败测试**：让补偿也失败，断言有日志 / 告警，且对账任务能修回来。
4. **afterCommit 测试**：事务回滚时，断言 `afterCommit` 回调没有执行。
