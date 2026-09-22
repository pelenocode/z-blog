---
title: "BugFix｜AgentV0Bug：为什么单测全绿，集成测试还能挂？"
slug: "spring-test-context-wiring-gap"
date: "2026-09-15T18:57:26+08:00"
description: "分析单元测试和 Maven test 全绿、集成测试却稳定失败的原因，最终定位为测试上下文遗漏公共 Spring 配置，而非生产 wiring 故障。"
categories:
  - "BugFix"
tags:
  - "AgentV0"
  - "Spring Boot"
legacyUrl: "https://sajlle.github.io/2026/09/15/BugFix｜AgentV0Bug：为什么单测全绿，集成测试还能挂？/"
draft: false
---
## TL;DR

为啥单测全绿，集成测试还是挂了？因为单测验证的是对象行为，这次坏的是 Spring application wiring。

最后查出来是多 Provider 重构之后，IT 手写的 @Import 漏了 provider-neutral 公共配置；生产 wiring 完好。

修复方式：只给 IT 补 import LlmCommonConfiguration，生产代码 0 改动。

总结：测试上下文和生产上下文并不天然等价。

## 症状

IT 稳定 5/5 失败，单独跑也挂，所以不是 flaky；

报错是 UnsatisfiedDependencyException 包了 NoSuchBeanDefinitionException。

此时单测全绿，mvn test 全绿。

## 是 production wiring 还是 test wiring？

一开始先不预设是测试的问题，先追完整的依赖链条，看是 production wiring 还是 test wiring？

有 2 个假设：

- 假设 1：production-environment context 缺 bean 导致报错。
- 假设 2：production context 正常，但集成测试配置缺 bean，导致测试失败。

于是我设计了两个 case，验证这两个假设：

- caseA 验证应用在没有开启 AI Explanation 的时候，能正常启动。说明 deterministic core 没有被 AI 配置污染。但不能排除 AI-enabled production wiring 有问题。
- caseB 验证开启 AI Explanation 的时候，当前真实调用链能成功装配。如果 production-equivalent context 本身也缺 bean，那这就是 production wiring defect，假设 1 成立。反之则是假设 2 成立。

于是我给 Codex 下指令，让它执行命令：

1. 先追踪完整依赖链条，读取完整的 Spring context failure，明确 constructor 依赖哪个 bean，最终要求 explanationPromptFactory，为什么当前的 ApplicationContext 没有注册它。先汇报实际的 dependency chain，不先改代码。
2. 分别验证 caseA 和 caseB：不用真实 API key，不调用真实互联网，用测试配置或 fake provider。如果 production-equivalent context 本身也缺 bean，那就是 production wiring defect，不许只修测试。
3. 如果仅 TestConfiguration 缺乏 bean，也就是 production context 正常，但是 RefundCaseExplanationControllerIT 因为自己的 @Import/@TestConfiguration 替换 provider 之后漏掉了 deterministic prompt factory，则只修装配测试。优先注册真实的 explanationPromptFactory，因为 prompt factory 是纯确定性组件，没必要 mock。不许为了让 context 绿了就把
   - production dependency 改成 optional
   - 使用 @Autowired(required=false)
   - 给整个 application 加宽泛的 component scan
   - mock 掉 RefundCaseExplanationService
   - mock 掉 deterministic diagnosis chain

## 根因

真实的调用链是：

```
RefundCaseExplanationController
-> RefundCaseExplanationService
-> Optional<LlmReasoner>
-> OpenAiLlmReasoner
-> ExplanationPromptFactory
```

重构之前是：

```
OpenAI configuration ≈ 整个AI configuration
```

后来为了多 SDK/多 provider，把公共逻辑抽出去了，Configuration 包含 LlmCommonConfiguration 和 OpenAiLlmConfiguration，也就是这样：

```
LlmCommonConfiguration
-> ExplanationPromptFactory

OpenAiLlmConfiguration
-> OpenAiLlmReasoner

Anthropic...
```

所以生产环境的 component scan 会把二者都扫描进来。

但是测试手写的 @Import(OpenAiLlmConfiguration) 只能拿到 OpenAiLlmConfiguration。

这就 Bug 了。

关于这点，证据如下。

caseA 结果：

- OpenAiLlmConfigurationTest：无 AI 配置时 context 正常启动，不创建 provider Bean。
- RefundCaseControllerIT：5/5，通过真实 HTTP → controller → deterministic core 链路验证 /diagnose 可用。

这条结果验证了 AI disabled 的时候，deterministic core 独立成立，防止 explanation 配置反向污染 /diagnose。

caseB 结果。这里要先说清楚一件事：修复后的 IT 跑绿，只能证明「测试 wiring 修好后能跑」，不能反推 production 在 37caac9 时原本就是好的。所以我补做了一次历史 revision 验证：

- Revision：37caac9b2121f3c8662bf0272189a204e5c9bf99
- 使用 production 的扫描根 com.coupon，扫描真实的 LlmCommonConfiguration 和 OpenAiLlmConfiguration
- AI enabled，使用测试 key 和不可访问的本地 base URL，不调用供应商
- 没有导入修复后的 RefundCaseExplanationControllerIT
- 明确断言：context 启动成功、ExplanationPromptFactory 恰好一个、LlmReasoner 恰好一个

结果：

```
HistoricalProductionLlmScanTest
Tests run: 1, Failures: 0, Errors: 0
BUILD SUCCESS
```

临时验证代码只存在于 37caac9 的隔离快照里，没有修改当前工作树。

于是在同一个 revision 上形成了真正的 A/B 对照：

```
production-package-scan context
→ LlmCommonConfiguration 被扫描
→ ExplanationPromptFactory 唯一
→ LlmReasoner 成功创建
→ PASS

RefundCaseExplanationControllerIT 手写窄上下文
→ 只 @Import OpenAiLlmConfiguration
→ 没有扫描/导入 LlmCommonConfiguration
→ 缺 ExplanationPromptFactory
→ 5/5 context error
```

证据边界也要说清楚：这证明的是与本问题直接相关的 LLM Bean 装配子图，不等于在该历史 revision 上完整启动了包含 MySQL、Redis、RabbitMQ、调度器的整个 CouponApplication。

两个 case 合起来，可以确定坏的是 test wiring drift，而不是 production wiring defect。

## Optional 为啥没有兜底呢？

因为 Optional&lt;T&gt; 能处理的是「0 个 T -> Optional.empty()」，处理不了「有一个 T 是候选，但这个 T 是坏的，创建失败」。

如果用 Optional 来修，会扭曲架构语义。我这边原本架构是：

```
AI disabled
-> 没有LlmReasoner
-> /diagnose 正常

AI enabled
-> LlmReasoner 必须完整可创建
-> 配置错误就应该启动失败
```

而不是：

```
AI enabled但是配置失败
-> 算了，当AI disabled吧
```

后者会隐藏部署错误。

所以，Optional 允许缺席，但不允许失败。

## 为啥 Gateway 单测、Provider selection test、mvn test 全绿？

因为测试层级不同。

Gateway 单测，大概类似 new SdkCompatChatGateway(...)，对象直接 new。它能验证：

- JSON parsing
- strict schema
- finish reason
- coercion
- malformed response

但它根本没问 Spring：你能不能把整条 /explain 依赖装配起来。所以看不到 bean 丢失。

那为啥 Provider selection test 绿了呢？因为这类测试已经显式地 import 了 LlmCommonConfiguration，所以它也是绿的。

为啥普通的 mvn test 也绿呢？因为普通的 mvn test 的时候，Failsafe 的 *IT 不执行。所以单元测试全绿，并不代表整个 Spring HTTP integration context 能启动。直到 mvn verify 跑到 RefundCaseExplanationControllerIT，才第一次真正走了：

```
Spring Context
-> Controller
-> Service
-> Provider Bean
-> PromptFactory
```

所以炸出来了。

三个测试都绿了，是真的。但没有一个在回答整条 /explain 能不能被 Spring 装起来。

## 修法和错误修法

最终改动是两行：

```java
@Import({
        LlmCommonConfiguration.class,   // ← 补这一行
        OpenAiLlmConfiguration.class,
        ...
})
```

为什么只动测试不动生产？因为上面 caseA/caseB 已经证明了 production-equivalent context 能完整装配，坏的是测试自己裁剪过的 context。生产 wiring 没坏，就不该为了让测试绿而去改生产。

验收结果。先是修复后的 IT，`RefundCaseExplanationControllerIT#normalCaseShouldFlowFromMysqlThroughRealSdkHttpAdapterToExplanation`：

- 通过 MockMvc 调用真实 /explain Controller。
- 真实 RefundCaseExplanationService、真实 deterministic diagnosis 链路、真实 OpenAI SDK adapter 全部参与。
- base-url 被替换成本机 Fake Server，Fake Server 明确监听 /v1/responses，未调用付费 API。

这条 IT 本身没有单独写 `assertThat(context).hasSingleBean(ExplanationPromptFactory.class);`，它对唯一性的证明是间接的：openAiLlmReasoner 的必选参数就是 ExplanationPromptFactory，Bean 为 0 个或多个时 context 都起不来，5/5 通过说明解析到了唯一候选。唯一性的直接断言在上面 caseB 的历史验证里。

然后是两次 mvn clean verify，两次之间不改文件：

- 第一次：BUILD SUCCESS，耗时 1:14
- 第二次：BUILD SUCCESS，耗时 1:22
- 第二次报告汇总：Surefire 341/341、Failsafe 41/41，0 failures、0 errors、0 skipped

下面是几个不该用的修法。

### @Autowired(required=false)

比如：

```java
@Autowired(required=false)
private ExplanationPromptFactory promptFactory;
```

这只是把启动时报错，改成了运行到这一行才 NPE/fallback。甚至更糟糕，因为 PromptFactory 明明是依赖必须，就应该在启动 provider 的时候明确存在。

### 给 PromptFactory 随便再加一个 @Component

生产本来已经是：

```
LlmCommonConfiguration -> Bean
```

再加 @Component，很可能以后直接得到 NoUniqueBeanDefinitionException，那就从缺一个，变成多两个。

### Mock 整个 RefundCaseExplanationService

这样 ControllerIT 可绿了：HTTP -> mocked service。但真正想验证的：

```
Controller
-> ExplanationService
-> deterministic diagnosis
-> provider adapter
-> fake network
```

全部被绕过去。这属于是把报警器拆了，不是修路子。

### 把 Optional 当兜底

上面已经说过了，这会把「配置错误」伪装成「功能关闭」，隐藏部署错误。

## 为什么当初会手写 @Import

回头看这个 bug，容易得出"手写 @Import 是坏习惯"的结论。但当初写成那样，动机是完全正当的：这个 IT 要验证 explanation pipeline，就必须指定用哪个 provider、必须不打付费 API、还得让上下文起得快一点。

目标没错，错的是实现方式。为了隔离外部依赖，我把整个 dependency graph 重建了一遍，而不是在边界上替换。

**隔离外部依赖，和重建依赖图，是两件事。前者只需要换掉边界，后者会复制一份必然过期的生产拓扑。**

这里其实有三种做法，不是两种。之所以要把第二种也摆出来，是因为正是它的缺点，逼着大家去选第一种：

| | A. 手写窄 @Import | B. 完整生产 context + 真外部依赖 | C. 生产装配入口 + 只 fake 边界 |
|---|---|---|---|
| 真实性 | 低。装的是测试自己裁剪的拓扑，不是生产拓扑 | 高，但代价是真连供应商 | 高。拓扑与生产同源，只有边界被替换 |
| 外部依赖 | 已隔离 | 需要真实 API key，会产生费用 | 已隔离，fake server 在本机 |
| 漂移风险 | 高。生产重构后测试不会自动跟进 | 无。生产变了测试自动跟着变 | 无。同一个装配入口，改一处两边都变 |
| 架构重构时要改几处 | 每个手写 IT 各改一处 | 0 | 1 处（装配入口） |
| 启动速度 | 待测 | 待测 | 待测 |

本次踩的就是 A 的漂移风险那一格，而且证据是现成的：同一个 37caac9 revision 上，production 扫描根能把 LLM 子图完整装起来，手写窄上下文却缺 Bean——这就是 A 和 C 的差距被量出来的样子。

B 在现实里基本不可用，所以真正的选择从来不是「隔离」还是「真实」，而是「在哪一层做隔离」。A 在配置层做，于是复制了拓扑；C 在边界层做，拓扑留给生产自己算。

## 防止复发

第一条是原则：集成测试不要复制 production dependency graph。让 production 自己构造 dependency graph，测试只替换 side-effect boundary。

具体做法：测试不再手挑 configuration 类，改 import 一个生产测试共用的 LLM 装配入口，只在 provider/网络边界做替换。

回归测试：加 wiring regression test，覆盖 AI disabled context 能起，以及 explanation context 下 PromptFactory 有且只有一个。

这条其实已经有现成的原型了。上面 caseB 用的 HistoricalProductionLlmScanTest，就是一个以 production 扫描根启动、断言 Bean 唯一的最小上下文测试，只不过它只活在 37caac9 的隔离快照里，删掉就没了。把它固化进仓库（换个名字，比如 ProductionLlmWiringTest），下次再抽公共层，先红的就是它，而不是等 Failsafe 跑到 Controller IT。一个临时的排查脚手架，顺手就能变成常驻的护栏。

流程上，mvn test 不跑 IT，确实是漏洞。IT 红了多久？最早是从多 SDK 重构、公共配置抽离后开始失效；真正首次被完整 verify 捕获是在后续 strict-schema 修复阶段。也就是从 37caac9 持续到 4e3aca8，最后用两行测试 wiring 修复结束。

日常和 CI 到底应该跑什么？日常：targeted tests / mvn test；pre-merge CI：mvn clean verify；可选 nightly：clean verify + repeated flaky-sensitive IT。

## 收束

这个 bug 反映了三层问题：表层是 import 配置问题 -> 中层是拓扑漂移 -> 深层是模块化边界。

### import 配置问题

最表层的是：@Import 漏了一个配置类。

### 测试拓扑和生产拓扑漂移

也就是测试为了隔离外部 Provider，构造了一个缩小版的 ApplicationContext，架构重构以后生产依赖拓扑变化了，但测试拓扑没有同步变化。

### 多 Provider 重构带来的公共/私有配置边界

我这边的配置是：

```
common LLM layer
-> ExplanationPromptFactory
-> shared contracts
-> shared policies

provider layer
-> OpenAI
-> Anthropic
-> compatible provider
```

这个分层，意味着测试不能够把 OpenAiLlmConfiguration 继续当整个 LLM 系统。

拆包之后，原来隐式共存的依赖，变成了显式依赖。a
