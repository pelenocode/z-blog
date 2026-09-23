---
title: "今日踩到Java老坑，Long比较报错"
slug: "java-long-comparison"
date: "2025-12-14T21:12:39+08:00"
updated: "2025-12-14T21:12:39+08:00"
description: "复盘 Java Long 使用 != 比较造成的身份校验错误，解释缓存区间、拆箱与 Objects.equals 的正确用法。"
categories:
  - "技术手记"
tags:
  - "Java"
  - "BugFix"
  - "踩坑日常"
draft: false
---
# 前情提要
我写好了根据commentId修改评论的接口。

这个接口其中有个流程，比较当前用户ID和评论里保存的用户ID是否一致，如果不一致，返回错误码。
userId我用的Long，于是我写成：
```java
if(commentUserId != userId){
    log.warn("用户与评论不匹配, commentUserId={}, userId={}", commentUserId, userId);
    throw new BizException(ErrorCode.USER_COMMENT_NOT_MATCH);
}
```
结果我测试的时候，不管换什么数据，死活报错`USER_COMMENT_NOT_MATCH`，于是我问了万能的ChatGPT，它跟我解释： `commentUserId`和`userId`是`Long`对象，不是`long`基本类型。

在Java里：`!=`比较的是对象引用地址值。而不是数值。

所以，虽然两个Long打印出来的值一样，但是他们不是同个对象，所以就`!=`为true

当然，这个写法本身也有问题，如果`userId`或者`commentUserId`任意一个为null，上面这句直接NPE

后续这段改成了
```java
if (!Objects.equals(commentUserId, userId)) {
    log.warn("用户与评论不匹配, commentUserId={}, userId={}", commentUserId, userId);
    throw new BizException(ErrorCode.USER_COMMENT_NOT_MATCH);
}
```

这个写法的优点是：
- 自动处理null
- 语义清晰

## 简单总结防止下次再犯的小提议
凡是ID，一律
- 用Long
- 比较一律`Objects.equals(a,b)`
- 禁止`==`/`!=`
