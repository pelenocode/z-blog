---
title: "BugFix｜AgentV0Bug：兼容层的“本地强校验”实际上不是严格 Schema 校验"
slug: "strict-structured-output-validation"
date: "2026-09-14T15:59:54+08:00"
updated: "2026-09-14T15:59:54+08:00"
description: "说明共享 ObjectMapper 的宽松反序列化如何绕过结构化输出边界，并把错误字段静默强转或丢弃。"
categories:
  - "BugFix"
tags:
  - "SDK integration"
draft: false
---
如题～
供应商的Gateway采用的是共享生产全局ObjectMapper反序列化。如果发送了如下错误响应，则会被接受：
```json
{
  "summary": 123,
  "findings": [],
  "evidenceGaps": [],
  "nextStep": true,
  "unauthorizedAction": "REFUND"
}
```
最终会得到`summary=123`,`nextStep=true`，额外字段被静默丢弃。

因此如果供应商即使在解释对象里额外返回`diagnosis`或者`action`，也可能会被静默丢弃后当成合法结果。

整个bug的链路是：
```markdown
Provider structured output
-> 我们本地还会强校验一次
-> 实际上只是普通的DTO deserialization
-> unknown fields 被 ignore
-> 本地所谓的strong validation 并没有证明provider output == declared explanation schema
```

这会破坏Agent V0的边界：「LLM只负责解释确定性结果，不能偷偷生成诊断或者动作」。虽然它没有直接篡改业务边界，毕竟额外字段后续真的被丢弃，没有进入deterministic packet，也没有执行。但它破坏了对这个边界的本地强制验证。
举个例子：系统本来设计的是：LLM输出只能属于Explanation Schema，实际上变成了LLM可以输出越界内容，只要其中还有一个能挑出合法Explanation DTO，Gateway就会把整段响应判为成功～
后者的问题是：
- prompt/schema regression会被隐藏
- provider compatibility bug会被隐藏
- 模型开始输出本不该出现的diagnosis/action，监控也看不出来
- 你无法声称本地boundary enforcement是fail-closed

后续修法：我给gateway创建了私有严格ObjectReader，只在这里启动FAIL_ON_UNKNOWN_PROPERTIES，既拒绝Schema外字段，又不改变支付，MQ等其他JSON的全链路行为。
