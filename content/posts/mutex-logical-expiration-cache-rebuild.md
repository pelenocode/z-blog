---
title: "缓存重建怎么选：互斥锁、逻辑过期与一套安全查询模板"
slug: "mutex-logical-expiration-cache-rebuild"
date: "2026-01-05T14:22:17+08:00"
updated: "2026-09-23T12:00:00+08:00"
description: "比较互斥锁、逻辑过期与异步缓存重建的目标、流程和取舍，并给出一套区分空值、有界等待、双重检查和安全解锁的互斥锁查询模板。"
categories:
  - "技术手记"
tags:
  - "互斥锁"
  - "逻辑过期"
  - "缓存重建"
draft: false
---
# 问
什么时候用逻辑过期，什么时候要加互斥锁，什么时候做缓存重建？

# 答
先看「业务目标」，再看用什么。

先理清楚概念，看看互斥锁，逻辑过期，缓存重建分别解决了什么问题？
## 互斥锁(mutex Lock)
解决的是：缓存刚失效的时候，大量请求同时查库（击穿）

本质：用锁把缓存重建这件事变成一次只让一个人干

## 逻辑过期(logical expire)
解决的是：不让用户请求等待重建（保证读接口稳定延迟）

本质：数据表面没有过期（Key还在），但Value里带一个expireTime。

过期了也先返回旧值，然后后台重建。

## 异步重建 vs 直接重建
- 直接重建：这次请求miss/过期了，我就查库写缓存再返回（用户多等一会儿）
- 异步重建：这次请求不等，先返回旧值/默认值，重建交给线程池或者MQ

## 什么时候用逻辑过期，什么时候用互斥锁，重建要异步还是直接？
### 互斥锁适用场景（最常用）
#### 条件：
- 你能接受miss那一次请求稍微慢一点，但要保证DB不被打爆

#### 典型
- 店铺详情
- 商品详情
- 用户信息
- 任何“可以等几十毫秒～几百毫秒”的读接口

#### 组合
- TTL（物理过期）
- 互斥锁
- 直接重建

##### 流程
- key真过期了 --> miss
- 抢锁的线程查库写回
- 其他线程等待/重试读缓存

#### 优点
实现简单，数据相对新，不会长期返回旧数据

#### 缺点
在过期瞬间，少数读请求会慢

### 逻辑过期适用场景（你追求“读永远不抖”）
#### 条件：
你不能接受用户请求因为重建而变慢，宁愿短时间，返回旧数据。

#### 典型
- 首页热门榜单
- 探店Feed流
- TopN/排行榜
- 任何“读非常高频 + 不那么要求强一致”的接口


#### 组合：逻辑过期 + 异步重建 + 锁
- 缓存里一直有值
- 过期了：返回旧值（用户无感）
- 后台线程去查库重建


#### 优点
读接口延迟稳定
#### 缺点
可能返回旧数据一段时间，实现更复杂，需要线程池 + 防重建风暴

### 到底异步重建还是直接重建？
一句话判断：这个接口能不能让用户等？
- 能等：直接重建
- 不能等：异步重建
再补充一条：
- 如果这个接口极高并发且热点极少，更偏向逻辑过期（例如首页榜单一个key顶全站）
### 异步重建需要加锁吗？
需要，而且几乎总是需要。

否则你会得到几乎经典的灾难：过期瞬间，1000个请求同时判断逻辑过期 --> 1000个线程池同时提交异步任务--> 线程池/DB爆炸

所以异步重建一般是：
- 读到Value
- 判断逻辑过期
- 尝试抢一个重建锁
  - 抢到：提交异步任务
  - 没抢到：说明别人已经在重建了
- 直接返回旧值

总结：逻辑过期 + 异步重建 = 必须配合“重建锁”防止重复重建

# 一张表总结如何选择场景
| 目标/场景           | 推荐方案                    | 用户体验  | DB 压力 | 一致性 |
|-----------------|-------------------------|-------|-------|-----|
| 读多写少，允许偶尔慢一下    | TTL + 互斥锁 + 直接重建        | 偶发慢   | 低     | 较新  |
| 读超高频，不能慢（首页/榜单） | 逻辑过期 + 异步重建 + 重建锁       | 稳定快   | 很低    | 可能旧 |
| 强一致（写后立刻读到新）    | 别指望纯缓存；用删缓存+延迟双删/消息一致性等 | 取决于设计 | 中     | 强   |

# 模板一：TTL + 互斥锁 + 直接重建（安全查询模板）

用于：大部分详情接口（店铺、商品、用户信息）。

最早我给查询店铺缓存写的模板只有几行：命中返回；未命中加锁；加锁失败 sleep 重查；加锁成功再查一次缓存、查库、处理空值、写缓存。后来在 [把缓存当锁用的事故](/posts/cache-as-lock-incident) 里踩了坑，才发现每一步都有细节，干脆把它扩成一个完整的状态机。

## 状态流转

1. **查缓存**，区分三种结果：
   - 正常值 → 直接返回
   - 空值标记（例如 `""`）→ 直接返回“不存在”，不回源
   - 未命中（`null`）→ 进入第 2 步
2. **未命中，尝试加锁**。锁 Key 必须和缓存 Key 分开：`lock:shop:{id}` vs `cache:shop:{id}`。
3. **加锁失败**：
   - 有界等待：sleep 一小段（例如 50ms）
   - 重读缓存，命中就返回
   - 超过最大次数后，降级（返回错误码 / 默认值）或失败
   - **绝不能因为没抢到锁就写空值**——没抢到锁不代表数据不存在，写了就是假 404
4. **加锁成功，再查一次缓存**（双重检查）：可能别人刚刚已经重建好了。
5. **查数据库**。
6. **数据不存在** → 写短 TTL 的空值标记（分钟级），防穿透。
7. **数据存在** → 写正常缓存，TTL 加随机抖动，避免一批 Key 同时过期。
8. **`finally` 中按持有者身份安全解锁**：只删自己加的锁，而且只删锁 Key，不碰缓存 Key。
9. **用并发测试证明 DB 回源次数受控**。

## 代码模板

```java
private static final String CACHE_KEY_PREFIX = "cache:shop:";
private static final String LOCK_KEY_PREFIX = "lock:shop:";
private static final String NULL_MARK = "";
private static final int MAX_RETRY = 10;

private static final DefaultRedisScript<Long> UNLOCK_SCRIPT = new DefaultRedisScript<>(
        "if redis.call('get', KEYS[1]) == ARGV[1] then " +
        "  return redis.call('del', KEYS[1]) " +
        "else " +
        "  return 0 " +
        "end",
        Long.class);

public Shop queryShop(Long id) throws InterruptedException {
    String cacheKey = CACHE_KEY_PREFIX + id;
    String lockKey = LOCK_KEY_PREFIX + id;

    for (int i = 0; i < MAX_RETRY; i++) {
        // 1. 查缓存：正常值 / 空值标记 / 未命中
        String json = stringRedisTemplate.opsForValue().get(cacheKey);
        if (json != null) {
            return NULL_MARK.equals(json) ? null : JSONUtil.toBean(json, Shop.class);
        }

        // 2. 未命中，尝试加锁（锁的值是持有者身份）
        String owner = UUID.randomUUID().toString();
        Boolean locked = stringRedisTemplate.opsForValue()
                .setIfAbsent(lockKey, owner, 10, TimeUnit.SECONDS);

        if (!Boolean.TRUE.equals(locked)) {
            // 3. 加锁失败：有界等待后重读缓存，不写任何缓存
            Thread.sleep(50);
            continue;
        }

        try {
            // 4. 双重检查
            json = stringRedisTemplate.opsForValue().get(cacheKey);
            if (json != null) {
                return NULL_MARK.equals(json) ? null : JSONUtil.toBean(json, Shop.class);
            }

            // 5. 查库
            Shop shop = getById(id);

            // 6. 不存在：短 TTL 空值
            if (shop == null) {
                stringRedisTemplate.opsForValue().set(cacheKey, NULL_MARK, 2, TimeUnit.MINUTES);
                return null;
            }

            // 7. 存在：正常缓存 + TTL 抖动
            long ttl = 30 + ThreadLocalRandom.current().nextLong(0, 6);
            stringRedisTemplate.opsForValue().set(cacheKey, JSONUtil.toJsonStr(shop), ttl, TimeUnit.MINUTES);
            return shop;
        } finally {
            // 8. 只删自己持有的锁，不碰缓存 Key
            stringRedisTemplate.execute(UNLOCK_SCRIPT, List.of(lockKey), owner);
        }
    }

    // 3'. 超过次数：降级或失败，而不是写空值
    throw new BusinessException("店铺查询繁忙，请稍后重试");
}
```

几个容易写错的地方：

- 空值标记和“未命中”必须区分开：`""` 表示确定不存在，`null` 表示缓存里没有。
- 查库本身抛异常时，**不要**把异常当成“不存在”写空值，否则会把一次故障固化成长时间 404（见 [空值缓存什么时候使用](/posts/null-cache-usage)）。
- 解锁要用“比较持有者再删除”的原子操作，否则锁过期后被别人拿到，你的 `finally` 会把别人的锁删掉。
- 锁的过期时间要大于一次正常回源的耗时。

## 并发测试：证明回源次数受控

1. **热点 Key 击穿**：删除缓存 Key → 用 `CountDownLatch` 让 100 个线程**同时**请求同一个存在的 id → 断言 DB 查询次数 ≈ 1，所有线程拿到的都是真实数据。
2. **不存在的 id 穿透**：并发请求不存在的 id → 断言 DB 查询次数 ≈ 1，后续命中空值标记。
3. **没抢到锁不写空值**：让持锁线程的查库变慢 → 断言等待线程最终拿到真实数据，缓存里没有出现空值标记。
4. **锁与缓存隔离**：请求结束后，断言 `lock:shop:{id}` 不存在、`cache:shop:{id}` 仍然存在。

# 模板二：逻辑过期 + 异步重建

用于：首页榜单 / 热点聚合。

1. 查缓存（必须提前预热，保证 Key 存在；首次建缓存要单独处理）
2. 如果逻辑过期：
   - 尝试抢重建锁
   - 抢到：提交异步重建任务
   - 没抢到：说明别人在重建
3. 立即返回旧值
