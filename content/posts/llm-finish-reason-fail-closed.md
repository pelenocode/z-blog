---
title: "BugFix｜AgentV0Bug：多供应商LLM SDK接入的时候，结束状态采用黑名单，仍可能接收未正常完成的响应"
slug: "llm-finish-reason-fail-closed"
date: "2026-09-14T16:10:08+08:00"
updated: "2026-09-14T16:10:08+08:00"
description: "从 finish_reason 黑名单的漏判出发，说明多供应商 LLM 协议边界为何应当采用成功状态白名单并默认失败关闭。"
categories:
  - "BugFix"
tags:
  - "SDK integration"
  - "Provider semantic normalization"
draft: false
---
如题～
多模型SDK兼容层，最初用黑名单判断`finish reason`，只拒绝几个已知异常状态。但测试的时候发现tool_call，中间暂停，以及未知供应商状态可能同时携带可解析JSON，从而被错误接受为完整结果。
我把协议判断改成白名单，只有明确终止状态才能进入structured-output解析，截断和内容过滤保留专用错误，其余未知或者中间状态全部fail-closed，这样新供应商增加状态的时候不会因为兼容层不认识而自动当作成功。

再，这bug是典型的协议边界/fail-open -> fail-closed问题。
核心不是漏判了几个finish_reason，而是原先的判断模型错了：
```markdown
旧逻辑：
只要我不明确知道的坏状态 -> 就当成功

新逻辑：
只有我明确知道的成功状态 -> 才当成功
```

此Bug的几个看点：
1. JSON可解析 ≠ 本轮模型调用成功完成，比如：finish_reason = tool_calls，模型还可能刚好输出了一段合法JSON，但它真正表达的是：我还没结束，我还准备调用工具。如果兼容层只看`JSON parse success`，那就是把中间态误认为是终态。
2. 黑名单对多供应商兼容尤其危险。OpenAI，Anthropic，兼容厂商的结束状态并不完全同构。而且以后还可能增加新的状态。于是黑名单天然就会出现：`新状态出现 -> 旧代码不认识 -> 但又不在bad list -> 自动放行`，这就是典型的`unknown = success`。
3. 这个Bug跟AgentV0的设计哲学一致。前面是`NOT_FOUND ≠ REFERENCE_UNAVAILABLE` `没有violation ≠ NORAML` `没看到坏事 ≠ 证明没问题`，现在又多了一个`没命中失败黑名单 ≠ 证明响应正常结束`，本质上是同一个工程习惯：「positive proof，而不是 absence of known failure」
