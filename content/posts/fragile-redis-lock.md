---
title: "如何写一个纸糊的锁？"
slug: "fragile-redis-lock"
date: "2026-01-05T16:22:02+08:00"
description: "用一个典型误删锁案例说明 Redis 分布式锁为何需要所有权校验、原子释放和合理的过期策略。"
categories:
  - "技术手记"
tags:
  - "锁"
  - "Redis"
  - "Java"
legacyUrl: "https://sajlle.github.io/2026/01/05/如何写一个纸糊的锁？/"
draft: false
---
# `unlock()`无条件delete——会误删别人的锁
比如：
```java
private void unlock(String lockKey) {
    stringRedisTemplate.delete(lockKey);
}

```

在分布式里会出现经典事故：
1. 线程A抢到锁（10秒过期）
2. A业务执行慢（比如查库慢，GC，断点调试），超过10秒
3. 锁过期
4. 线程B抢到同一个锁key
5. A执行完，finally里delete(lockKey)，把B的锁删了。
6. 线程C又抢到锁，于是B和C同时重建缓存/同时写数据库

> 这就是为啥分布式锁一定要有「锁拥有者标志（token）」，解锁必须校验。

# tryLock缺乏token（唯一标志）
比如：
```java
setIfAbsent(lockKey, "1", expire, SECONDS);
```

这样不知道锁是不是自己加的，所以解锁时没法校验，只能盲删——于是必然有误删除的风险。

# 锁过期不续期——别人抢锁，误删别人的锁
如果不做watch dog，而`LOCK_EXPIRE < 最坏情况下的缓存重建时间（查库 + 序列化 + 写Redis + 抖动）

那么会出现：
> 锁过期 --> 别人抢到 --> 误删别人锁



# 如何改？
思路很简单：加token + Lua脚本原子校验删除
- tryLock：value存一个随机token（比如UUID）
- unlock：只有当Redis里value == 我当初的token才delete
  - 这一步必须原子（Lua），否则也会有竞态

要不要加watch dog？
- 一般不要，因为缓存重建通常很快（几十毫秒～几百毫秒），但如果有
  - 慢SQL（秒级）
  - 网络抖动
  - 调试时打断点
那锁过期就会频繁发生，工程上：要么把锁TTL拉长，要么做watch dog
