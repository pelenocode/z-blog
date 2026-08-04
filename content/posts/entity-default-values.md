---
title: "技术手记｜实体类设置默认参数值的注意事项"
slug: "entity-default-values"
date: "2026-02-08T21:12:21+08:00"
description: "比较字段初始化、构造方法、JPA 注解与数据库默认值，说明实体类默认参数的可靠设置方式。"
categories:
  - "技术手记"
tags:
  - "实体类"
  - "注解"
legacyUrl: "https://sajlle.github.io/2026/02/08/技术手记｜实体类设置默认参数值的注意事项/"
draft: false
---
实体类加注解注意事项
1. 数据库是最终兜底，实体类是前置判断
2. 最简单直观的方式是：直接给默认值，类似：`private Integer status = 1`
3. 构造方法里默认赋值：风险：如果全参构造/Builder，容易被覆盖，不如直接初始化字段稳定
```java
public class User{
    private Integer status;
    
    public User(){
        this.status = 1;
    }
}
```
4. JPA/ Hibernate注解（只对JPA有效，对MyBatis没用）
```java
@Column(nullable = false, columnDefinition = "tinyint default 1")
private Integer status;
```
这个只在
- Hibernate自动建表或者生成DDL才有用，new User()的时候，status还是null

```java
@PrePersist
public void prePersist(){
    if(status == null){
        status = 1;
    }
}
```
这个只在save()前兜底一次，MyBatis用不了

5. Mybatis需要特别注意的坑点：
```sql
INSERT INTO user (status) VALUES (#{status})
```
如果`status = null`，实际执行的是：`status = null`，DB默认不会生效，直接报错。
解决办法，用动态SQL
```sql
<if test="status != null">
    status,
</if>

<if test="status != null">
    #{status},
</if>
```
