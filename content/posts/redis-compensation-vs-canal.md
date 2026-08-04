---
title: "技术手记｜当redis可以显式补偿的时候，需要上Canal吗？"
slug: "redis-compensation-vs-canal"
date: "2026-02-08T21:24:50+08:00"
description: "围绕 Redis、数据库事务与缓存态的跨存储一致性，比较显式补偿、afterCommit 和 Canal 的适用边界。"
categories:
  - "技术手记"
tags:
  - "Canal"
  - "Redis"
  - "事务"
  - "数据库"
  - "DB"
legacyUrl: "https://sajlle.github.io/2026/02/08/技术手记｜当redis可以显式补偿的时候，需要上Canal吗？/"
draft: false
---
前情回顾：
我的一个方法流程是：
1. redis读写（业务状态）
2. DB读写
3. redis读写（缓存态）

我纠结的问题点：
1. 目前情况会导致事务回滚DB数据，而redis数据没有同步回滚
2. 考虑afterCommit，提交事务之后再读写redis，但因为流程不可拆，所以该方案不行。

我考虑的解决方案：
1. 显示补偿，不是强一致。
2. Canal

方案1如何操作：
```java
boolean redisOk = false;

try{
    redisWrite1();
    redisOk = true;
    
    dbWrite(); // 这一步 @Transactional

    redisWrite2();
}catch(Exception e){
    if(redisOk){
        redisRollback1(); // 补偿
    }
    throw e;
}
```
该方案适合：
1. 状态机
2. 次数扣减
3. workflow

方案2Canal
1. 第一步redis，自己写
2. 第三步redis，交给Canal

Canal能做的：
1. 监听DB binlog
2. DB commit之后，异步更新redis/es/mq

Canal解决的问题是：「DB -> Redis的单向同步」

Canal使用场景：
1. 多表多服务共享redis 
2. 读多写少
3. 强烈不想在业务代码里碰缓存
4. 接受秒级延迟
5. 有运维精力

另，redis的状态如何区分？
- 业务态Redis（不需要强一致，出问题靠TTL/补偿，不需要进事务）
  - 限流
  - 去重
  - 幂等
  - 状态机 step
  - 分布式锁
- 缓存态Redis（DB派生）（严格afterCommit，删除缓存/重建）
  - 详情缓存
  - 聚合结果
