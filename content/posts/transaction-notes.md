---
title: "技术手记｜几个关于事务的思考"
slug: "transaction-notes"
date: "2026-03-29T10:24:05+08:00"
updated: "2026-03-29T10:24:05+08:00"
description: "从事务状态、传播行为、失效场景到消息队列边界，梳理 Spring 事务在真实业务中的使用方式与常见误区。"
categories:
  - "技术手记"
tags:
  - "事务"
  - "数据库"
  - "ACID"
draft: false
---
# 关于事务的状态
1. 执行状态
    - ACTIVE：事务正在执行中，还没提交
    - ROLLBACK-ONLY：事务正在执行中，但已经标记为只能回滚了
    - COMITTED/ROLLED BACK：事务已经提交或者回滚了
2. 事务传播行为
   - 就是一个带事务的方法，调用另一个带事务的方法时，怎么相处。

# 关于事务传播行为 + 事务的使用场景
1. REQUIRED:
    - 有事务就加入，没事务就新建
    - 适用场景：
      - 一个service下调用多个service子步骤
      - 这些子步骤必须作为一个整体提交或者回滚
    - 例子：
      - closeTimeoutOrder()里一起改订单状态，预定状态，库存，用户次数等。
    - 坑：如果内层REQUIRED方法把事务标记成了`rollback-only`，外层还想提交，就会报错`UnexpectedRollbackException`
2. REQUIRES_NEW:
    - 不管有没有事务，都新建一个事务
    - 适用场景：
      - 需要独立提交或者回滚的操作
      - 例如：日志记录，审计等
      - 独立状态的留痕
    - 例子：
      - saveMqExceptionLog()，记录日志的事务不受业务事务的影响
      - savePaymentCallbackRawBody()，记录回调原始数据的事务不受业务事务的影响
      - 定时任务跑批失败时的明细记录
    - 坑：多占一个数据库连接，高并发下，外层事务还绑着连接，内层又再拿一个，连接池小了之后，可能会耗尽或者卡死。
3. NESTED:
    - 外层有事务，就在同一个事务里savepoint，内层失败可以回滚到savepoint，不影响外层事务，外层没有事务，就新建一个事务。
    - 开箱即用：`DataSourceTransactionManager`默认支持嵌套事务
    - 适用场景：
      - 需要局部失败不拖死整体
      - 确认底层事务管理器支持savepoint
      - 例子：
        - 不常见。
    - 坑：底层事务管理器不支持savepoint，就退化成REQUIRED了，内层失败了，整个事务都失败了。
4. SUPPORTS:
    - 有事务就加入，没事务就不用事务
    - 适用场景：
      - 查询类方法
      - 工具型读取逻辑
      - 不要求强事务语义，但如果上层已有事务，也愿意跟着走
    - 例子：
      - `loadVoucherConfig()`
      - `queryReservationForDisplay()`
    - 注意：它不是只读事务的同义词，只是可跟可不跟，跟只读的区别是，只读里面还有个read-Only。
5. NOT_SUPPORTED:
    - 外面有事务，先挂起，自己非事务运行。
    - 适用场景：
      - 明确不想让某段代码被事务拖住
      - 大量纯查询，报表，非关键读取
      - 一些你不想继承上层锁范围/事务时长的逻辑
    - 例子
      - 大批量报表查询
      - 纯展示性聚合查询
6. MANDATORY:
    - 外面必须有事务，没事务就抛异常
    - 适用场景：
      - 某个方法只能作为更大事务的一部分存在
      - 想强调约束方，防止别人单独乱调
    - 例子：
      - 某个只能在「统一结算事务」里调用库存调整步骤
7. NEVER:
    - 外面有事务就抛异常，自己非事务运行
    - 适用场景：
      - 明确不想让某段代码被事务拖住
# 关于事务的坑
1. 同类内部调用，事务注解可能失效，因为Spring的事务是基于AOP实现的，只有通过代理对象调用的方法才会被事务管理器拦截到。如果在同一个类内部直接调用另一个带有事务注解的方法，这个调用不会经过代理对象，因此事务注解不会生效。
- 例子：
```java
public void a() {
    this.saveLogError(); // 以为 REQUIRES_NEW 生效，结果根本没生效
}
```
解决办法：
- 通过AOP代理对象调用方法，可以使用`AopContext.currentProxy()`获取当前代理对象，然后调用方法。
```java
public void a() {
    ((YourServiceClass) AopContext.currentProxy()).saveLogError(); // 通过代理对象调用，事务注解生效
}
```
- 将需要事务的方法提取到另一个类中，通过Spring注入调用。
```java
@Service
public class LogService {
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void saveLogError() {
        // 记录日志的逻辑
    }
}       
@Service
public class YourServiceClass {
    @Autowired
    private LogService logService;
    public void a() {
        logService.saveLogError(); // 通过注入的LogService调用，事务注解生效
    }
}
```
2. 以为catch住异常就万事大吉
- 事务默认只对RuntimeException及其子类进行回滚，如果catch住了异常，事务管理器就认为操作成功了，不会回滚。
- 解决办法：
- 在catch块里手动标记事务回滚，可以使用`TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();`来标记当前事务为回滚状态。
```java
try {
    // 可能抛出异常的代码
} catch (Exception e) {
    // 处理异常
    TransactionAspectSupport.currentTransactionStatus().setRollbackOnly(); // 标记事务回滚
}
```
- 或者在@Transactional注解上指定回滚的异常类型，例如`@Transactional(rollbackFor = Exception.class)`，这样即使catch住了异常，事务也会回滚。
```java
@Transactional(rollbackFor = Exception.class)
public void yourMethod() {
    try {
        // 可能抛出异常的代码        
    } catch (Exception e) {
        // 处理异常
        // 不需要手动标记事务回滚，因为rollbackFor已经指定了回滚
    }
}
```

# 一些简单实践
1. 业务逻辑中，尽量让事务边界清晰，避免过长的事务，减少锁竞争和资源占用。
2. 对于需要独立提交的操作，使用REQUIRES_NEW，确保它们不受外层事务的影响。
3. 对于查询类方法，使用SUPPORTS，既可以在事务中执行，也可以在非事务中执行，灵活适应不同场景。
4. 注意事务传播行为的选择，确保它们符合业务需求，避免不必要的事务嵌套和资源浪费。
5. 定期检查和优化事务的使用，确保它们的性能和可靠性，避免潜在的死锁和性能问题。

# 项目中的使用逻辑
## 主事务（`REUQIRED`）
- 校验订单是否超时，状态是否关闭
- 条件更新订单状态
- 条件更新预定状态
- 回滚库存
- 回滚用户已抢购次数
- 写一条关单成功明细
注意：这些步骤放在主事务里，可以确保它们作为一个整体提交或者回滚，如果其中任何一步失败了，整个事务都会回滚，保证了数据的一致性和完整性。

## 独立事务（`REQUIRES_NEW`）
- 异常日志
- poision message/ 原始消息体
- 审计失败明细
- 定时任务失败记录
注意：这些步骤放到独立事务里，可以确保它们不受主事务的影响，无论主事务成功还是失败，这些日志和记录都能独立提交，保证了数据的完整性和可靠性。

## 不需要进入事务
- 查询候选超时订单列表
- 打印日志
- 组装返回对象
- 非关键查询
注意：这些步骤不需要进入事务，可以避免不必要的事务开销，提高性能和响应速度，同时也减少了锁竞争和资源占用。

## 简单总结
- 失败必须撤销主流程的步骤，放在主事务里
- 失败不需要撤销主流程的步骤，放在独立事务里
- 不需要事务的步骤，直接执行，不进入事务
