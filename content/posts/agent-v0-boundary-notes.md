---
title: "BugFix｜Agent V0 边界设计札记：重试所有权、证据时间线与拒绝无依据判断"
slug: "agent-v0-boundary-notes"
date: "2026-09-23T12:00:00+08:00"
updated: "2026-09-23T12:00:00+08:00"
description: "合并 Agent V0 的三个小 Bug：SDK retry 套娃、Timeline 差点被当成状态迁移历史、没有证据就不判定 USED 冲突，归结为“谁有权定义事实”，并给出对应的测试方式。"
categories:
  - "BugFix"
tags:
  - "Agent"
  - "SDK integration"
  - "Agent证据建模"
  - "工程判断"
draft: false
---
Agent V0 做到后面，陆续记了几个小 Bug：OpenAI SDK 的 retry 可能套娃、Timeline 差点被当成状态迁移历史、`REFUND_INSTANCE_USED_CONFLICT` 很诱人但没证据。

单看像三件不相干的事，放在一起才发现它们是同一个问题：**谁有权定义事实？**

- 请求到底发了几次——应用层说了算，还是 SDK 说了算？
- 状态什么时候变的——数据库记录说了算，还是 Agent 编的时间线说了算？
- 券是什么时候被用的——证据说了算，还是一条“看起来很聪明”的规则说了算？

# 1. 重试所有权

## 问题

一开始我们定义：最多 retry 1 次。但查了官方 SDK 之后发现，**SDK 自己有默认的 retry**。

如果应用层 `retry 1`，SDK 又 `retry 2`，实际的 HTTP attempts 可能是两者相乘，而不是我们以为的“最多 2 次”。超时、限流的时候，请求量会被悄悄放大。

## 修法

明确**唯一的 retry owner**，并且把几个数字写清楚：

```markdown
SDK 是唯一的 retry owner
configured retries = 1
max HTTP attempts = 2
timeout = 8s per attempt
```

测试的时候，用 **Fake HTTP Provider 真的去数请求次数**，而不是看接口能跑完就算完。

> 第三方 SDK 不能只看接口能跑完就算完。

# 2. 时间线的语义边界

## 问题

实际数据库里只有这几个时间字段：

```markdown
createdAt
updatedAt
refundTime
notifyTime
```

很容易顺手生成这样一条“状态迁移历史”：

```markdown
10:00:01 APPLYING
10:00:02 PROCESSING
```

但这是**编的**。`updatedAt` 只说明“最后一次被更新是在这个时间”，不能证明中间经历过哪些状态、每个状态是什么时候进入的。

## 修法

- `createdAt`、`updatedAt` 只是**观测证据**，不能据此虚构完整的状态迁移。
- 把它叫做 **`Evidence Timeline`**，而不是“状态历史”。
- `updatedAt` 标记为 `approximate`。

这不是传统意义上的 Bug，更接近**防止 Agent 编故事的 bug prevention**。

# 3. 诊断的证据边界

## 问题

有一条规则很诱人：`REFUND_INSTANCE_USED_CONFLICT`——退款了，但券实例已经是 `USED`，判定为冲突。

问题是：DB 持久化的数据**不足以证明** `USED` 究竟发生在退款冻结之前，还是退款之后。前者是正常的“先用后退”，后者才是冲突。

## 修法

没有为了让 Agent 显得很牛而硬判。主动删除了这条看起来很亮、但没办法被证据确定支持的规则。证据不足时：

- 输出 `UNKNOWN` / evidence gap
- 交给人工复核
- **不为了让 Agent 显得聪明而增加分类**

同样的思路，在 [NOT_FOUND 和 REFERENCE_UNAVAILABLE 的语义分歧](/posts/missing-reference-semantics) 里也出现过：缺失和不可用，不能混成一个结论。

# 4. 统一原则

1. **重试必须有唯一所有者**：写清 configured retries、最大 attempts、单次 timeout。
2. **时间字段必须标明语义**：观测到的时间 ≠ 状态迁移的时间；近似值要标 `approximate`。
3. **`Facts → Assessment → Permission`**：事实层只陈述有证据的东西，判断层基于事实推理，权限层决定能做什么。三层不能互相越界。
4. **无证据，不判定；无授权，不执行。**

整体分层的思路，见 [确定性 Agent 架构](/posts/deterministic-agent-architecture)；真实联调时这些边界的表现，见 [Agent V0 联调复盘](/posts/agent-v0-integration-review)。

# 5. 对应的测试方式

| 原则 | 测试 |
|---|---|
| 重试所有权 | 请求次数测试：Fake HTTP Provider 让每次都超时 / 返回 5xx，断言实际请求次数 = max HTTP attempts |
| 时间线语义 | 时间线完整性测试：输入只有 `createdAt` / `updatedAt` 的数据，断言输出里没有凭空生成的中间状态，`updatedAt` 带 `approximate` 标记 |
| 证据边界 | 缺失证据测试：构造无法区分先后顺序的 `USED` 数据，断言诊断为 `UNKNOWN` / evidence gap，且 `allowedActions` 里没有自动执行的动作 |
