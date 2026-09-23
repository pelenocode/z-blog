---
title: "BugFix｜AgentV0Bug：RabbitMQ测试「队列空了」，但事务还没提交～"
slug: "rabbitmq-test-transaction-completion"
date: "2026-09-13T17:50:11+08:00"
updated: "2026-09-13T17:50:11+08:00"
description: "复盘 RabbitMQ 集成测试把队列为空误判为事务完成的偶发失败，并改用提交与 afterCommit 完成信号作为观测点。"
categories:
  - "BugFix"
tags:
  - "RabbitMQ"
  - "集成测试"
  - "异步队列"
draft: false
---
原测试的等待条件是：
```markdown
attemps == 1 && RabbitMQ management API 显示队列为空，测试认为处理结束
```

但实际上可能处在：
```markdown
listener 已经消费 -> 队列暂时空 -> transaction还没commit -> afterCommit还没执行
```

所以测试会在18ms，26ms就冲出去assert：
```markdown
commitCount expected 1
actual 0
```

不是生产逻辑错了，是测试的观测点错了。

最后把完成条件改成：
```markdown
commitCount == 1
afterCommitExecutions == 1
```
而且计数是在callback真正执行完成以后才增加。

也就是：异步系统里，消息不在队列里，不等于业务事务已经完成。

总结一下就是：
> 一条 RabbitMQ集成测试偶发失败，最开始看起来像是消费事务问题，但后来发现测试把broker queue empty当成业务完成，但listener transaction commit和afterCommit可能还没结束，后续我把测试完成条件改成显式观察commit和afterCommit completion，而不是固定sleep或者仅看队列状态，之后连续跑就稳定通过了。
