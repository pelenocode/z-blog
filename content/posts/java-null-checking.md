---
title: "Java里的几个判空方法使用范围"
slug: "java-null-checking"
date: "2026-01-03T13:50:21+08:00"
description: "结合数据库列表、Redis 空值与字符串内容，梳理 Java 中 null、空集合、空字符串等判空方式的适用边界。"
categories:
  - "技术手记"
tags:
  - "Java"
  - "NPE"
  - "判空方法"
legacyUrl: "https://sajlle.github.io/2026/01/03/Java里的几个判空方法使用范围/"
draft: false
---
# 起因
写店铺缓存查询的时候，用shopTypes == null判空，漏判了shopsMapper.getTypes()返回的是List，如果查不到值，返回的是[]，而不是null。

只判断null，会导致
- 数据库真空时会写入[]，但SHOP_TYPE_NOT_FOUND只在null触发

另，redis取出json，直接判断`json == null` 未命中缓存，`json != null`命中缓存，忽略了之前存的空值。
空值存的是`""`，判断应该写`json != null && StrUtil.isBlank(json)`

所以，我被搞烦了，这次把遇到的所有常见判空逻辑，整理一下。
# 常见判空方法的使用范围
## `StrUtil.isEmpty()`
- true：null 或者 ""
- false: " "
注意：空格不算Empty

## `StringUtils.isEmpty()`
- true: null 或者 ""
- false： " "
注意：空格不算Empty
## `StrUtil.isBlank(str)/ StringUtils.isBlank(str)`
true
- null
- ""
- " "
- "\n\t"
- unicode空白

总而言之，trim之后长度为0的都算Blank

## `Objects.isNull(obj)`
它等价于 `obj == null`

它存在的意义时：
- 写Stream/Predicate的时候好看一点，比如`filter(Objects::nonNull)`

## `obj == null`
最快最直接

# 常见判空方法的使用场景
## Redis/HTTP入参/用户输入 —— 用Blank
1. 这些地方最容易出现`" "`这类看似有值实际没有值，判空推荐
   - isBlank
   - hasText
## 想区分「空字符串」和「全空格字符串」—— 用Empty
比如某些协议里`" "`有意义，那才用`isEmpty`
## 判断对象是否存在——`obj == null`

# 简而言之
1. Blank系，trim之后长度为0的字符串
2. Empty系，长度为0的字符串
3. Null系，没对象
