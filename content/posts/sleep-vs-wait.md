---
title: "sleep和wait的区别？"
slug: "sleep-vs-wait"
date: "2026-01-05T15:01:04+08:00"
description: "从缓存重建失败后的线程等待场景出发，解释 sleep、wait、monitor 与跨进程 Redis 锁之间的区别。"
categories:
  - "技术手记"
tags:
  - "wait"
  - "sleep"
  - "Java"
legacyUrl: "https://sajlle.github.io/2026/01/05/sleep和wait的区别？/"
draft: false
---
# 问
为啥缓存miss，重建缓存的时候，没有抢到锁，线程要sleep而不是wait？
# 答
## 为啥不用wait？
### `wait`不是简单休眠，而是条件队列等待。
- wait必须在`synchronized(obj)`持有同一个对象的monitor锁时调用，否则直接爆炸：`IlleagalMonitorStateException`
- `wait`调用后会：
    1. 释放monitor锁
    2. 把线程放到这个对象的wait里
    3. 必须等别人`notify/notifyAll`才会醒（超时/中断）
而我们的场景是：
- 抢的是Redis分布式锁，不是JVM里某个对象的`monitor`锁
- 也没有任何地方会对某个`obj`去`notify()`
- 我们只想“别太着急，过50ms再去看redis缓存有没有被重建，不是要等某个条件被通知。

所以`wait()`会让代码逻辑变得非常尴尬：
- 我们得额外造一个本地对象锁，再设计一个notify机制，但notify的时机又跨JVM（因为重建者可能在另外一台机器/另一个进程），让人根本没法正确notify

所以我们的场景是：要短暂退避 + 重试（backoff + retry)，不是条件同步等待（wait/notify）

`sleep`不释放锁，`wait`会释放锁，在我们这个场景里：
- `Thread.sleep(50)`：只是让出CPU的时间片，不释放任何monitor锁
- `Object.wait(...)`：释放该对象的monitor锁
问题是：我们本来没在`synchronized`里，也没有持有任何monitor锁，我们持有的是“Redis 锁”，实际是一个Key的租约，跟JVM的monitor是两码事。

所以：不是因为Sleep不释放对象锁而选择sleep，而是因为没有可以wait的对象，也没有可以notify的人。

### `Thread.sleep(50)`了，后续需要`catch(InterruptedException e)`，这个`InterruptedException`是干嘛的？
这个catch抓的是：线程在sleep或者wait/join期间被中断时抛出的异常。

#### 那这个InterruptedException是啥？
它不是普通异常，而是让线程：
> 别睡了，别等了，有人要求你尽快停止当前等待并响应中断

谁会中断线程？
- 线程池要关闭（shutdownNow)
- 服务器要停机
- 上层业务要主动取消任务
- 某些框架在超时/取消时会发interrupt

#### 它跟业务异常/运行时异常的区别？
`InterruptedException`是**checked exception**，属于并发控制协议的一部分，Java强制要求显式处理它。

#### 那catch里为啥要`Thread.currentThread().interrupt()`？
这就是并发编程的一个规矩：
> 当你catch了`InterruptedException`，Java会把当前线程的interrupt 标记清除。
> 
> 如果你吞了它，上层就不知道线程曾经被要求中断，取消信号就丢了

所以正确姿势通常是：
1. `Thread.currentThread().interrupt();`把被中断这个信号还给线程。
2. 然后要么：
   - 直接返回/退出
   - 或者降级处理（比如直接查库）

#### 那能不能更工程化地替代sleep？
有办法，而且更优雅。

##### 自旋锁（带退避），比如重试3次
- 50ms --> 100ms --> 200ms 这种指数级退避
- 仍未命中再查库（或者直接返回空）

##### 用锁的等待队列
分布式场景一般不搞wait/notify，而是：
- 轮询缓存
- 或者用消息通知（MQ/pubsub)

# 总结
1. `wait/notify`：同JVM，同对象monitor，线程间条件协调
2. `sleep`：单纯退避，让出CPU，不涉及协调
3. 分布式缓存重建：绝大多数是sleep/退避 + 重试，不是wait/notify
