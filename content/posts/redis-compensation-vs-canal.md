---
title: "技术手记｜Redis 与数据库事务不在一个世界：afterCommit、显式补偿还是 Canal？"
slug: "redis-compensation-vs-canal"
date: "2026-02-08T21:24:50+08:00"
updated: "2026-09-25T10:55:47+08:00"
description: "从一次 Redis → DB → Redis 流程踩到的两颗雷出发：事务没生效、DB 回滚 Redis 不回滚；区分业务前置态与缓存态 Redis，比较 afterCommit、显式补偿和 Canal 的适用边界与失败窗口。"
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

为了好理解，下面用领券场景举例：

1. 先在 Redis 里预扣券库存，同时记录用户已领，防止重复领取；
2. 再把领券记录写入数据库；
3. 最后删除券详情缓存，让下次查询拿到最新数据。

这里埋了两颗雷。

# 2. 第一颗雷：数据库事务本身可能没有生效

`private` 方法上加 `@Transactional`，**在 Spring 默认的代理模式下不会生效**。

Spring 事务通常基于 AOP 代理实现，只有经过代理对象的调用，才会被事务拦截器拦下来。`private` 方法不能作为代理入口；同理，同一个类里用 `this.xxx()` 直接调用另一个带事务注解的方法，也绕过了代理，注解同样不生效。

改法：

1. **默认方案：拆到独立的 Bean。** 把需要事务的 DB 操作挪到另一个 `@Service` 的 `public` 方法里，通过注入调用，事务边界一眼就能看清楚。
2. **或者把 `@Transactional` 加到外层的 `public` 方法上。** 但要想清楚两点：一是事务会把前后的 Redis 操作也“包”进去，虽然 Redis 并不会因此回滚，边界容易被误解；二是外层事务边界会变长，一旦数据库连接或锁已经被获取，它们可能一直持有到方法结束。
3. AspectJ 编译期或加载期织入可以绕过 Spring AOP 的代理限制，但比较重，一般项目没必要只为这个引入。

更多事务失效场景，见 [几个关于事务的思考](/posts/transaction-notes)。

# 3. 第二颗雷：DB 回滚不会带着 Redis 回滚

就算事务生效了，还有第二个问题：**DB 和 Redis 不在一个本地事务里。** DB 回滚了，第 1 步写进 Redis 的东西还在，数据就不一致了。放到领券场景里就是：库存扣了、用户也被标记为已领，但数据库里根本没有这条领券记录。

最直觉的想法是 `afterCommit`：事务提交之后再写 Redis。但我的流程里，第 1 步 Redis 必须在 DB 之前执行，因为它是业务前置条件，流程不能拆，所以没法全部挪到提交之后。

那就得先把 Redis 里的数据分清楚。

# 4. 先区分三种 Redis 数据

| 类型 | 例子 | 与 DB 的关系 | 主要兜底手段 |
|---|---|---|---|
| 业务预占态 | 库存预占、资格占用、次数扣减、请求幂等状态 | 无法天然受本地 DB 事务保护，要随业务结果收敛 | 带 `requestId` 的条件补偿、TTL、对账 |
| 协调态 | 分布式锁、限流令牌、短期互斥标记 | 负责协调并发，通常不代表最终业务事实 | lease / TTL、自行失效；一般不与 DB 对账 |
| DB 派生缓存 | 详情缓存、聚合结果 | 以 DB 为事实源 | `afterCommit` 删缓存；需要可靠投递时用 Outbox / CDC |

我的流程里，第 1 步是业务预占态，第 3 步是 DB 派生缓存。两者要用不同的办法处理。

# 5. 三种处理方式

## 5.1 `afterCommit`：处理缓存态

DB 提交成功之后，才去动缓存。DB 回滚了，缓存删除就不会执行。

另外，`afterCommit` 里如果还要继续执行新的 DB 写操作，不要把它当成原事务的一部分；Spring 官方建议为这类后续事务操作显式使用 `REQUIRES_NEW`。本文的回调只删 Redis，因此不存在新的 DB 事务问题。

这里还有两个容易踩的细节：

1. `registerSynchronization` 要在事务同步已激活的上下文里调用。在常规 `@Transactional` 事务中，Spring 的事务管理器会负责激活它；如果放在完全没有事务同步的外层调用，会抛 `IllegalStateException`。
2. `afterCommit` 里的运行时异常会继续向外传播。此时 DB 已经提交，调用方却可能收到异常；如果外层恰好有补偿逻辑，就可能把本该保留的业务预占态回滚掉。对“删缓存”这种不应该改变主业务结果的操作，通常应在回调内部捕获异常，记录日志或指标，再靠 TTL、重试或对账兜底。

```java
@Service
public class CouponRecordService {

    @Transactional
    public void dbWrite(Long couponId, Long userId, String requestId) {
        // DB 读写：写入领券记录（requestId 作为唯一键）……

        TransactionSynchronizationManager.registerSynchronization(
            new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    try {
                        redisWrite2(couponId); // 删除券详情缓存
                    } catch (Exception e) {
                        // DB 已提交，这里失败不能再回滚 DB，靠监控、TTL 或重试兜底
                        log.warn("afterCommit 删除缓存失败, couponId={}", couponId, e);
                    }
                }
            }
        );
    }
}
```

也可以用 `@TransactionalEventListener` 做同一件事：在事务里发布事件，在提交后监听处理。它是一种声明式替代方案，不改变失败边界；监听方法内部同样建议自己处理异常。默认 `fallbackExecution = false`，因此没有活动事务时发布事件，监听器不会执行。

```java
// 事务方法内
eventPublisher.publishEvent(new CouponCacheEvictEvent(couponId));

// 监听器
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
public void onCommitted(CouponCacheEvictEvent event) {
    try {
        redisWrite2(event.couponId());
    } catch (Exception e) {
        log.warn("提交后删除缓存失败, couponId={}", event.couponId(), e);
    }
}
```

## 5.2 显式补偿：处理业务预占态

显式补偿最危险的地方，不是“补偿失败”，而是**在根本不知道 DB 是否提交成功时贸然补偿**。

更稳妥的模型不是一个 `dbDone` 布尔值，而是明确区分三种 DB 结果：

```java
redisReserve(requestId); // 原子预占，并留下与 requestId 绑定的预占标记

try {
    couponRecordService.dbWrite(couponId, userId, requestId);
    // 前提：外层没有事务，dbWrite() 自己开启并结束本地事务；正常返回即提交完成
} catch (RuntimeException e) {
    DbOutcome outcome = resolveDbOutcome(requestId, e);

    switch (outcome) {
        case COMMITTED -> {
            // DB 已确认提交，保留 Redis 业务预占态
        }
        case ROLLED_BACK -> {
            // 只有明确确认回滚后，才立即补偿
            compensateIdempotently(requestId);
        }
        case UNKNOWN -> {
            // 不凭“一次查无记录”判定回滚，交给后续对账继续确认
            reconcileQueue.markPending(requestId);
        }
    }

    throw e;
}
```

这段示例有一个重要前提：外层编排方法本身没有事务，`dbWrite()` 才真正拥有完整的事务边界。如果它只是加入外层已有事务，那么方法返回时外层事务还没有提交，不能据此判定 `COMMITTED`；这时应该把结果判断和提交后动作放回事务边界内统一设计。

这里的 `ROLLED_BACK` 必须来自能够确认事务已经回滚的证据；如果异常发生在提交阶段，或者连接在提交响应前后断开，就应归入 `UNKNOWN`。极端情况下，数据库已经完成 commit，客户端却没收到成功响应，应用层看到的仍然是异常。此时一次查无记录，也可能只是主从延迟或短暂不可见，不能直接当作“肯定没提交”。

这不是强一致，而是“条件补偿 + 持续对账”，适合预占、次数扣减、工作流临时状态等场景。落地时还有四个关键点：

1. **缓存态不放进这个 `try`。** 它已经在事务里注册为提交后动作，而且回调内部自己处理异常，不会误触发业务补偿。
2. **用业务唯一键确认结果。** `requestId` 要在 DB 中有唯一约束，也要和 Redis 预占标记绑定，才能可靠识别“这一次”请求。
3. **补偿做反向操作，不恢复旧快照。** 比如扣了 1 就 `INCRBY 1` 加回去，而不是把 key 设成预扣前读到的值；后者会覆盖并发请求的修改。
4. **补偿必须原子且幂等。** 可以用 Lua 一次完成“校验预占标记属于该 `requestId`、确认尚未补偿、释放资源、记录补偿结果”，避免重复执行把库存加多。

进程可能在进入 `catch` 前就崩掉，所以 Redis 预占态还要有合理 TTL，并由定时对账扫描长期未收敛的请求。TTL 是最后保险，不是唯一的正确性机制。

## 5.3 Canal / binlog 同步：处理缓存态的另一种方式

- 第 1 步 Redis 业务预占，由业务代码自己处理；
- 第 3 步 DB 派生缓存，可以交给 Canal。

Canal 订阅并解析 MySQL 的 binlog，再由 client、adapter 或下游消费者把变更同步到 Redis、ES、MQ 等系统。它解决的是“DB 提交后的变更如何异步送出去”，不能回滚 DB 之前发生的 Redis 业务操作。

适用场景：

1. 多表、多服务共享缓存；
2. 读多写少；
3. 不希望每条业务链路都手写缓存同步；
4. 能接受异步延迟和最终一致；
5. 有监控、重试、积压处理和全量校准能力。

所以回到标题的问题：**当 Redis 可以显式补偿的时候，需要上 Canal 吗？一般不需要。** 补偿管业务预占态，`afterCommit` 管缓存态，已经能覆盖不少单体或单服务场景；Canal 是缓存同步规模和跨服务需求上来之后，才值得引入的基础设施。

# 6. 每种方式仍然存在的失败窗口

没有一种方式是完美的，得清楚它们各自会漏在哪里：

| 方式 | 失败窗口 | 兜底 |
|---|---|---|
| `afterCommit` | DB 已提交，但删 Redis 失败或进程挂了，缓存仍是旧的 | TTL、监控与重试；删缓存通常比直接更新缓存更稳妥 |
| `afterCommit`（并发） | 读请求在提交前从 DB 读到旧值，又在删缓存之后把旧值写回缓存 | TTL、版本号或读路径校验；延迟双删只能降低概率，不能提供强一致 |
| 显式补偿 | 补偿本身失败；进程在 `catch` 前挂掉；把提交结果未知误判为回滚 | 条件补偿、TTL、待对账状态；以 DB 最终事实修正 Redis |
| Canal | 存在同步延迟；Canal 或消费者故障会积压；消息可能重复 | 延迟监控、幂等消费、重试与必要的全量校准 |

特别注意“误补偿”有两个常见来源：

1. `afterCommit` 抛出的异常：DB 已经提交，异常却传到了外层 `catch`。所以缓存回调要内部处理失败，外层也不能把任意异常都解释成“事务已回滚”。
2. 提交结果未知：DB 已经提交，客户端却因为连接异常等原因收到了异常。所以要把结果分成 `COMMITTED`、`ROLLED_BACK`、`UNKNOWN`，确认不了就进入待对账。

延迟双删也要摆正位置：它依靠时间窗口再删一次，只能降低“旧值回填”的概率，不是强一致方案。如果提交后的缓存失效动作不能丢，应该使用可重试的 Outbox / CDC、版本校验，或者重新设计读路径，而不是只把延迟时间调得更长。

## 6.1 Outbox 能解决什么，不能解决什么

事务 Outbox 适合解决的是：**DB 已经提交后，某个动作或事件不能丢。** 业务数据和 outbox 记录写进同一个 DB 事务，后台任务再可靠投递、重试，并由消费者幂等地删除缓存或处理事件。

但它不能单独解决“DB 之前已经做了 Redis 预占，而 DB 最终回滚”的问题：DB 回滚时，outbox 记录也会一起回滚，后台根本看不到一条“需要释放 Redis”的消息。这个方向仍然需要与 `requestId` 绑定的预占标记、原子幂等补偿、TTL 和对账。

如果涉及资金等不能接受 Redis 暂态成为最终事实的场景，应让数据库或账本成为事实源，再围绕它设计状态机、事件投递和对账，而不是把 Redis 预扣当作最终扣款结果。

# 7. 场景决策表与回归测试

## 决策表

| 场景 | 推荐 |
|---|---|
| DB 派生的详情缓存，单服务 | `afterCommit` 删缓存 + TTL |
| DB 已提交，提交后动作不能丢 | Outbox / CDC + 幂等消费与重试 |
| Redis 预占在 DB 回滚后不能残留 | 带 `requestId` 的条件补偿 + TTL + 对账 |
| 分布式锁、限流 | lease / TTL 自行失效，通常不与 DB 对账 |
| 多服务共享缓存、变更链路多、接受异步延迟 | Canal / CDC |
| 资金或高价值最终状态 | DB / 账本作为事实源，状态机与对账兜底 |
| 要求写后立刻强一致 | 不要指望 Redis 和 DB 一起提交，重新设计数据边界和读写路径 |

## 回归测试

1. **事务生效测试**：在 DB 写入过程中、commit 之前注入业务异常，断言事务确实回滚，顺便验证事务方法不是 `private` 方法，也不是同类自调用。
2. **明确回滚补偿测试**：确认事务已回滚且 DB 中没有记录后，断言 Redis 预占被原子、幂等地释放，缓存态没有被改动。
3. **补偿失败测试**：让补偿也失败，断言请求进入待对账状态、有日志或告警，而且对账任务最终能修回来。
4. **提交结果未知测试**：模拟 DB 已提交、但客户端仍收到异常，断言系统没有直接补偿，而是先按唯一键确认；仍无法确认时进入待对账。
5. **`afterCommit` 不执行测试**：事务回滚时，断言回调没有执行。
6. **`afterCommit` 失败测试**：让回调里的 Redis 操作抛异常，断言 DB 已提交、业务预占态没有被补偿，并且产生了日志或指标。
7. **并发补偿测试**：补偿期间另一个请求也修改同一个 key，断言最终值正确，没有被“恢复原值”覆盖。
8. **Outbox 原子性测试**：业务事务回滚时，业务记录与 outbox 记录一起消失；提交成功后，即使投递进程重启，消息仍可重试并被幂等消费。
