---
title: "BugFix｜AgentV0Bug：Redis集成测试出现1ms flaky，最后发现是跨域时钟比较"
slug: "redis-cross-clock-flaky-test"
date: "2026-09-13T17:41:40+08:00"
description: "定位 Redis Lua 与 JVM 使用不同时间源造成的 1ms 偶发失败，并用同一时钟域和有界轮询稳定验证。"
categories:
  - "BugFix"
tags:
  - "Redis"
  - "集成测试"
  - "跨域时钟断言"
legacyUrl: "https://sajlle.github.io/2026/09/13/BugFix｜AgentV0Bug：Redis集成测试出现1ms-flaky，最后发现是跨域时钟比较/"
draft: false
---
原始测试是：
```markdown
LUA：
Redis TIME -> 生成ZSET score

测试：
System.currentTimeMills() -> 拿JVM时间做上下界
```

失败的时候只差1ms。

一开始被当成CI慢了，scheduler抖了，加了点tolerance。
后续排查发现，是拿两个不同的clock source做精确时间断言。

后来修成：
```markdown
执行前：Redis TIME
Lua内：Redis TIME
执行后：Redis TIME
```
在同一个时钟域里比较。
再用bounded eventual assertion验证TTL最终过期。

总结一下就是：
> 遇到了一个Redis Lua集成测试偶发差1ms。我这边没有扩大sleep，而是发现Lua用的是Redis TIME，测试却拿JVM System.currentMills() 比较，属于是跨域时钟断言。后来统一用Redis时间验证score，并单独用bounded polling验证TTL最终过期，连续多次稳定通过。
