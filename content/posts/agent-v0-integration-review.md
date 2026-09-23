---
title: "日常记录｜Agent V0联调的事故复盘～"
slug: "agent-v0-integration-review"
date: "2026-09-11T15:50:58+08:00"
updated: "2026-09-11T15:50:58+08:00"
description: "复盘 Agent V0 真实联调中确定性诊断、allowedActions、时间线完整性和解释字段边界的验证结果。"
categories:
  - "日常记录"
tags:
  - "Agent"
draft: false
---
昨儿联调测试了两个case，一个正常case，一个异常case。
联调的结果还不错，模型没有为了显得有用，硬编一个调查步骤，最后明确说no action is authorized。
异常case里，deterministic core给的是：
```
REFUND_STATE_NOT_CONVERGED

REFUND_ORDER_STATE_CONVERGED
expected 4 / actual 3

REFUND_VOUCHER_INSTANCE_STATE_CONVERGED
expected [6] / actual [5]
```
模型没有重新分类，没有说「我觉得支付异常」，也没有扩大权限，最后只保留了系统已经授权的「QUERY_REFUND_CHANNEL」和「REQUEST_HUMAN_REVIEW」，并且引用已有的「PB_REFUND_DOWNSTREAM_CONVERGENCE」。
这部分测试还不错，几个点都过了：
1. 模型可以正常返回 strict structured output
2. Normal case不发明问题
3. 异常case不重新分类
4. 不修改 deterministic violations
5. 不扩大allowedActions
6. 不发明compensation/UPDATE/SQL
7. 能识别 evidence_only timeline的局限
8. 能把 approximate timestamp和明确时间线分开
9. nextStep被限制在系统授权范围内

不过还有几个需要polish的地方。
模型输出的时候，在normal case里写，「numeric status codes 没有 semantic labels」，异常case里又写「timeline中没有显式记录order 到 4/voucher 到6的transition event」。 而且补充「这些不是deterministic missing evidence」
逻辑没错，模型没有伪造missing evidence，但是字段名字叫evidenceGaps，读者容易把「aiExplaination.evidenceGaps」当成是「diagnosis.missingEvidence」。但实际上它表达的是更宽的「deterministic missing evidence」+ 「interpretation limitations」 + 「timeline limitations」

后续的修法：
1. 不改DTO，prompt再卡严：evidenceGaps只允许：
   - paraphrase deterministic missingEvidence
   - 明确陈述timelineCompleteness带来的限制
   - 不得自行提出新的证据缺失
2. 或者把名字改成更准确的evidenceAndInterpretationLimit

再，因为context minimization太严格，模型只看到orderStatus=4，voucherStatus=6，但不知道4=Refunded，6=Refunded，所以它在normal case里很老实的说「我不知道这些数字状态码具体是什么意思」。

后续的修法：
1. 用projector确定性的附上一个normalized semantic label，比如：
   - orderStatus
     - code : 4
     - semantic: refunded
   - voucherStatus
     - code : 6
     - semantic: refunded
