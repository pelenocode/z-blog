---
title: "为啥遇到错误分支不直接return，而是throw？"
slug: "throw-vs-return-error-branches"
date: "2025-12-14T21:31:27+08:00"
description: "分析业务错误分支中直接 return 与抛异常的差异，以及它们对事务回滚、调用链和统一异常处理的影响。"
categories:
  - "技术手记"
tags:
  - "bugFix"
  - "Java踩坑日常"
legacyUrl: "https://sajlle.github.io/2025/12/14/为啥遇到错误分支不直接return，而是throw？/"
draft: false
---
最近写项目，有点纠结，接口里走不通的分支，到底是return一个Result返回错误码，还是throw错误码回去？

后续还是选择throw，好处有几个：
- return 错误码回去，后续别的service调用当前service，会需要不停写`if(!res.success) return res`这类代码，后续会变成嵌套地狱
- 如果接口加了`@Transactional`注解，
  - 直接`return Result.fail(...)`，Spring认为这是正常返回，默认不会回滚。这会导致表1更新数据成功，表2更新失败，但还是返回成功，会导致表1记录已经写入，但表2数据没有同步更新，导致脏数据。像这类必须一致的操作，应该throw，配合事务回滚
  - `throw BizException`默认触发回滚。

最终做法：
- 走不通的分支，throw BizException，传错误码，这样失败的分支可以直接冒泡，上层不接锅，统一由`GlobalExceptionHandler`兜底转换成`Result.fail(...)`。这样写一次handler可以少写无数个fail-return
