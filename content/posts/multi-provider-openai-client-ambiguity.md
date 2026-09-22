---
title: "BugFix｜AgentV0Bug：OpenAI 与兼容供应商双开会导致应用启动失败"
slug: "multi-provider-openai-client-ambiguity"
date: "2026-09-14T15:55:31+08:00"
description: "复盘多供应商 LLM 接入后两个同类型 OpenAIClient Bean 造成的启动歧义，以及显式限定客户端依赖的修复方式。"
categories:
  - "BugFix"
tags:
  - "SDK integration"
legacyUrl: "https://sajlle.github.io/2026/09/14/BugFix｜AgentV0Bug：OpenAI-与兼容供应商双开会导致应用启动失败/"
draft: false
---
如题～
项目的 AI 解释层原来只接 OpenAI。为了支持 Anthropic、DeepSeek 等供应商，我保留统一的 `LlmReasoner` 接口，但在适配层分别使用官方 OpenAI Responses API、Anthropic Messages API，以及复用 `openai-java` 的 Chat Completions 兼容层。配置上允许多家提前 `enabled`，再通过 `provider` 选择当前对外提供服务的一家。
第一轮代码看起来职责已经拆开，但是我补「双开OpenAI和DeepSeek，当前选择DeepSeek」的上下阿文测试时，容器启动直接失败。
原因是官方OpenAI client和兼容层的client的Java类型都是OpenAIClient，两个gateway又都只按照类型注入，Spring抛出`NoUniqueBeanDefinitionException`。
我没有用 `@Primary` 掩盖歧义，因为那会让另一家 gateway 有机会拿到错误的 base URL 和密钥；最终在两个注入点分别使用 `@Qualifier("openAiClient")` 和 `@Qualifier("compatOpenAiClient")`，把 client 归属显式固定。
