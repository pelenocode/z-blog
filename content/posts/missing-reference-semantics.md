---
title: "BugFix｜AgentV0Bug：NOT_FOUND和REFERENCE_UNAVAILABLE的语义分歧"
slug: "missing-reference-semantics"
date: "2026-09-14T15:23:02+08:00"
description: "区分 NOT_FOUND 与 REFERENCE_UNAVAILABLE，展示如何通过事实模型编码不确定性，避免 Agent 基于缺失关联编造结论。"
categories:
  - "BugFix"
tags:
  - "工程判断"
  - "状态枚举"
legacyUrl: "https://sajlle.github.io/2026/09/14/BugFix｜AgentVOBug：NOT-FOUND和REFERENCE-UNAVAILABLE的语义分歧/"
draft: false
---
如题～

最开始Payment不存在看起来像是一个Optional empty。
但实际上存在两种完全不同的情况。

情况一：
```markdown
refund.paymentRecordId = 123
查不到payment
-> NOT_FOUND
```

情况二：
```markdown
refund.paymentRecordId = null
根本不知道该查哪一条
-> REFERENCE_UNAVAILABLE
```

如果混掉了，后面的Agent会产生错误结论。

比如：
```markdown
Payment不存在
-> 没有 transaction mismatch
-> NORMAL
```
这个显然错了

所以从2态升级到了3态。
```markdown
PRESENT
NOT_FOUND
REFERENCE_UNAVAILABLE
```

所以MissingEvidence才可以正确表达：「已知应该但是没有」和「现在连关联都没有，不能判断」。

这条的核心是：
> Agent如何减少幻觉？不靠Prompt，而是靠数据模型把不确定性编码出来
