---
title: "技术手记｜Java 小事故复盘：Token、HMAC、Spring 注入与资源路径"
slug: "java-small-incidents-review"
date: "2026-09-23T12:00:00+08:00"
updated: "2026-09-23T12:00:00+08:00"
description: "把 Token 校验失败、pepper 误当 message、static 注入与手动 new、工作目录与资源路径等一串小 Bug 放在一起复盘：它们的共同点是隐含契约没有写清楚。"
categories:
  - "技术手记"
tags:
  - "Java"
  - "Spring"
  - "HMAC"
  - "BugFix"
draft: false
---
2026 年 2 月上旬，写登录 / Token 模块那几天，接连踩了一串小坑。单拎出来每个都不大，放在一起看，共同点很明显：**隐含契约没有写清楚**——两端对“存什么、算什么、从哪儿读”各有各的理解，编译器不会告诉你，只有跑起来才炸。

# 1. Token 派生契约不一致

## 现象

测试发现，`cachedTokenId` 跟前端传的 `tokenId` 一模一样，为啥还是校验失败？

第一反应：难道 pepper 每次都随机生成一个新的，不是固定常量？（之前出现过类似错误。）检查了一下 pepper，没错。

`tokenId` 对得上，说明传递没问题，那问题就出在加密上。

## 根因

- 创建 token 存 Redis 时：`token = sha256(sha256(tokenId))`
- 校验时：`token = sha256(tokenId)`

难怪 `tokenId` 对了，校验老失败。（这个坑是让 Codex 审出来的，我自己测了一下午，它花了 2 分钟。）

**根因不是“双重 Hash 一定错”，而是两端算法不一致。** 写 `saveRefreshToken` 的时候，文档里没写清楚到底存 token 还是存 tokenId、存之前要做几次派生，于是保存端和校验端各写了一套。

## 修法

- 收敛到唯一的派生函数，保存和校验都调它：

```java
public String deriveTokenDigest(String tokenId) {
    return hmacSha256(pepper, tokenId);
}
```

- 加**固定向量测试**：给定 pepper 和 tokenId，断言输出等于一个写死的期望值。以后谁改了派生逻辑，测试立刻红。
- 在文档里写清楚：Redis 里存的是什么、怎么算出来的。写清楚文档，真的很必要啊（笑）。

# 2. Pepper 到底是 key 还是 message

## 错误版本

```java
sha256(input + pepper)
```

错误有二：

1. `input + pepper` 在密码学上是**自制协议**，有长度扩展、拼接歧义的风险。
2. **语义不清**：pepper 是密钥，不应该被当成 message 的一部分。

## 正确版本

```java
Mac mac = Mac.getInstance("HmacSHA256");
mac.init(new SecretKeySpec(pepper, "HmacSHA256"));
byte[] digest = mac.doFinal(input.getBytes(StandardCharsets.UTF_8));
```

也就是 `HMAC(key = pepper, message = input)`。别自己拼协议，用现成的。

这种写法的使用场景：

1. 登录校验
2. token 派生（服务端不可伪造 token）
3. 签名校验
4. 内部安全字段

# 3. Spring 容器边界

写加密工具类时，顺手又踩了两个 Spring 的坑，外加后来一个 NPE：

- **`@Autowired` 不能注入 static 字段**：Spring 注入的是实例，static 字段不归它管，结果就是 null。
- **手动 `new Security()` 会绕过 Spring**：new 出来的对象不是 Bean，里面的 `@Value` / `@Autowired` 一个都不会生效。→ 改为构造器注入，让容器负责创建。
- **Bean 注册了，但没提供可用的配置值**：pepper 是靠 `Security` Bean 提供的，Bean 确实注册了，但提供 pepper 的方法没有返回值，于是 pepper 为空，HMAC 直接 NPE。

共同点：**对象是不是由容器创建的、值是不是真的被容器填进去了**，得在启动时就验证，而不是等到第一次调用才发现。

# 4. 工作目录与资源路径

## 一次启动失败

重测的时候，项目启动失败，错误原因是找不到 mapper 目录。

我当时仔细一看，项目目录里不知道什么时候混进了一个 `.idea` 目录，删掉、重新编译之后，就能正常跑了。

不过“删掉 `.idea` 就能解决 mapper 丢失”，**不能当成通用结论**——我并没有确认 `.idea` 就是根因，也可能是重新编译这一步把构建产物刷新了。下次再遇到，应该按顺序核对：

1. **当前工作目录（cwd）** 是哪里？IDE 的运行配置、终端、测试框架，cwd 可能各不相同。相对路径都是相对它算的。
2. **资源是从文件系统读，还是从 classpath 读？** mapper XML、Lua 脚本这类资源，最好统一走 classpath（`classpath:mapper/*.xml`），别依赖 cwd。
3. **资源有没有真正打进构建产物？** 去 `target/classes` 里看一眼，mapper / Lua 文件在不在、路径对不对。
4. 以上都对，再考虑 IDE 缓存、目录混入之类的环境问题。

# 5. 四个快速故障案例

某天测试时一口气冒出来的小 bug：

| 报错 | 原因 | 教训 |
|---|---|---|
| 启动报 `AmqpError` | RabbitMQ 没启动 | 依赖的中间件先起 |
| `FileNotFound` | Lua 脚本路径写错：`RedisLuaConfig` 里注册新 Lua 时 copy 了老 Lua 的代码，改的时候文件名凭印象写，写错了 | 资源路径别凭印象，启动时就加载并校验 |
| NPE | HMAC 的 pepper 为空（见上面第 3 节） | 配置值启动时校验非空 |
| Lua 执行报错 | `if` 语句没写 `end` | Lua 脚本单独跑一遍语法检查 / 集成测试 |

# 6. 最终检查清单

- **依赖**：MySQL / Redis / RabbitMQ 等中间件是否都已启动？
- **资源**：mapper、Lua 是否在 classpath 上、是否打进了 `target/classes`？路径是否和配置一致？
- **配置**：pepper 等关键配置启动时校验非空，缺失就 fail fast。
- **Spring**：有没有 static 注入、手动 `new` 本该是 Bean 的对象？
- **加密**：派生逻辑只有一个入口；有固定向量测试；用 HMAC 而不是自制拼接。
- **启动测试**：至少有一个能把整个上下文拉起来的集成测试，把“启动就炸”的问题拦在 CI 里。
