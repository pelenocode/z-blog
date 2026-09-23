---
title: "try catch为啥要写到锁外面？"
slug: "try-finally-around-lock"
date: "2026-01-05T15:58:45+08:00"
updated: "2026-01-05T15:58:45+08:00"
description: "解释缓存重建与锁场景中，为什么必须让 try/finally 覆盖拿锁后的完整流程，避免异常或提前返回造成锁泄漏。"
categories:
  - "技术手记"
tags:
  - "Java"
  - "异常处理"
  - "锁"
draft: false
---
简略答案：
> try/catch准确来说是try/finally要把可能提前return/抛异常的整段流程罩住，才能保证只要拿到锁，就一定会释放锁。

# 锁的场景里，真正需要的是try/finally
锁的场景里，最关键的是：
- 代码途中return 
- JSON解析/查库/Redis任何一步抛异常
- 甚至自己写错导致NPE

都不能让人把锁带走，否则就死锁（分布式锁就是锁key一直挂着直到过期）

所以标准结构是：
```java
boolean locked = tryLock();

try{
    // 不管里面怎么 return / throw
    } finally {
    if(locked) unlock();
}
```

finally是兜底：return 也会执行finally

# 为什么try要写在锁外面那层，而不是塞进locked分支？
如果把try写进`if(locked){...}`里，会发生什么？

## 问题A：你会很难保证所有路径都释放锁
代码很多return
- 命中缓存return
- double-check 命中 return
- 查库后 return

如果try/finally只包住locked分支内部，一旦在外面某条路径return，就得自己记得释放锁。但人很容易忘记。

把try/finally放到外层：怎么return都跑不掉finally

## 问题B：你会被迫写多份儿try结构（长/乱/易错）
锁逻辑一般是：
- 没拿到锁：sleep + retry
- 拿到锁：double-check + rebuild
这两段都可能抛异常，都可能return

如果try只写在locked分支里，那没拿到锁的分支要不要try？也要。

结果：要复制一堆try/catch/finally，代码更长，bug概率更高。

外层一个try/finally，把所有分支统一罩住最省心。

## 问题C：异常不只会发生在锁内部
很多异常点其实发生在locked之外，比如：
- `Thread.sleep(...)`抛`InterruptedException`（通常在没有拿到锁那条分支）
- 在else分支里重试读缓存，解析JSON
- 甚至unlock本身，也可能出问题（例如 Redis 短暂不可用）

所以try放外面是为了：所有路径异常都能被统一处理

# 锁代码骨架模板
```java
boolean locked = tryLock(lockKey);

try{
    if(!locked){
        // 退避重试读缓存（可能sleep，可能解析）
        // 这里也可能return
        return ...
    }
    // locked == true : double check + rebuild（可能查库/写缓存）
        return ...
    }catch(InterrruptedException e){
    Thread.currentThread().interrupt();
    // 降级策略
    return ...
    }finally{
    if(locked) {
        unlock(lockKey);
    }
}
```

# 总结
1. try/finally一定包住所有return的地方
2. unlock只放finally
3. 只有locked == true才unlock
