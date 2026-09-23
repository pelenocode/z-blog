---
title: "技术手记｜改createUser存在性校验挡不住并发重复注册怎么改？"
slug: "concurrent-user-registration"
date: "2026-02-06T21:34:07+08:00"
updated: "2026-02-06T21:34:07+08:00"
description: "为什么先查再插挡不住并发重复注册，以及如何用数据库唯一索引和异常处理完成最终兜底。"
categories:
  - "技术手记"
tags:
  - "Java"
draft: false
---
改之前的流程：
1. 构造user
2. 通过phone和userId查user是否存在，存在throw ErrorCode
3. 插入user

改之前的问题：
1. userId是刚生成的，不会重复
2. 真正重复的只有phone
3. 并发场景下：
   - 两个请求同时查询
   - 都查询不到
   - 都insert
   - 都注册【重复注册】

所以这种「先查再插」在并发下必挂。

改后思路：
1. user.phone唯一索引【已有】
2. createUser不做exists查询
3. 直接insert，靠捕获DuplicateKeyException防并发

改完之后的思维模型是：
1. 参数校验
2. 构造user
3. 直接insert user
    - 成功：继续
    - DuplicateKeyException: 查已有user，直接用
4. 确保 role 存在（insert + 忽略重复）
5. 确保 userRole 存在（insert + 忽略重复）
6. return user

另，存在性校验是干嘛的？
> 存在性校验不是业务逻辑，而是数据完整性

而且必须由DB唯一约束兜底。
