---
title: "SQL查询啥时候用ResultMap？"
slug: "mybatis-resultmap-usage"
date: "2026-01-02T19:49:19+08:00"
updated: "2026-01-02T19:49:19+08:00"
description: "结合字段映射、单位转换和冗余展示字段，说明 MyBatis 查询中 ResultMap、SQL 转换与 Service 组装的边界。"
categories:
  - "技术手记"
tags:
  - "SQL"
draft: false
---
# 前情提要
我写`shop.getById(shopId)`接口的时候，VO里有一个冗余字段`typeName`，我数据库存的字段只有`typeId`。
数据库的`avg_price`单位是分，类型是`bigint unsigned` VO的`avgPrice`单位是元，类型是`BigDecimal`。
数据库的`score`数据类型是`int(2) unsigned zerofill`，VO的`score`是数据库`score/10.0`，数据类型是`BigDecimal`。
另，为了方便前端展示，VO还多了几个数据库没有的字段`open`，`openTime`，`closeTime`，`imageList `。

那问题来了，我这情况，需要resultMap吗？

# 问题分析
要不要上ResultMap，实际问的是VO, Entity, DB之间功能的分野
- VO：为前端服务，允许冗余，计算，展示友好
- DB：存储最小，最稳定的数据
- Entity：贴DB

# 解决
目前这个情况，数据库的查询结果不能「直接」自动映射成`ShopVO`。

但是也不需要ResultMap。

直接用：SQL+ 别名 + SQL计算 + 少量Java处理。

## 逐字段分析
### `imageList`VO字段，`List<String>`
不可以自动映射，原因是
- DB返回的是`VARCHAR`
- VO要的是`List<String>`
- Mybatis不会自动split字符串

正确做法：SQL查`images` --> Java转换
```java
shopVO.setImagesList(Arrays.asList(shopVO.getImages().split(",")));
```
这是业务逻辑，不属于 resultMap的职责

### `typeName`（VO冗余字段）
可以自动映射（JOIN + 别名）
```sql
t.name AS typeName
```
### `avgPrice`
```java
// entity / DB
private Long avgPrice; // 单位：分
// VO
private BigDecimal avgPrice; // 单位：元
```
这两个字段，不可自动映射。因为字段的类型+语义都不一样。

Mybatis不会：
- Long --> BigDecimal
- 分 --> 元

推荐做法：SQL里算法
```sql
s.avg_price / 100.0 AS avgPrice
```
- Mybatis：`DECIMAL --> BigDecimal` ✅
- 展示口径 = SQL决定，非常清晰

### `score`评分（int --> BigDecimal）
```java
// Entity / DB
private Integer score; // 实际是评分 * 10

// VO
private BigDecimal score; // 2 位小数
```
- 不能自动映射，原因是
  - int --> BigDecimal
  - 有业务语义（/10）

推荐做法：SQL里算
```sql
s.score / 10.0 AS score
```

### `distance`
可以自动映射，前提是：
- SQL里算好了
- 别名叫`distance`

### 不能自动映射的字段
- open
- openTime
- closeTime
怎么填充呢？在Service层计算
