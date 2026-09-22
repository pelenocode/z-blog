---
title: "日常记录｜项目的门禁测试失败了，原因是啥呢？是iCloud同步工作目录，导致出现随机的NoClassDefFoundError"
slug: "icloud-maven-build-corruption"
date: "2026-09-10T11:46:35+08:00"
description: "记录 iCloud File Provider 干扰 Maven/Failsafe 构建产物的取证过程，以及迁移到非同步目录后的验证结果。"
categories:
  - "日常记录"
tags:
  - "Bug记录"
  - "iCloud"
legacyUrl: "https://sajlle.github.io/2026/09/10/日常记录｜项目的门禁测试失败了，原因是啥呢？是iCloud同步工作目录，导致出现随机的NoClassDefFoundError/"
draft: false
---
如题～
执行集成测试的时候，出现了5个Errors。几个类找不到。

直接原因是Failsafe JVM 类加载异常。后续排查的时候，没有发现ExceptionInInitializerError，或者Could not initialize class，所以不是静态初始化失败。
然后检查Failsafe effective configuration，同样的配置再隔离目录运行稳定。所以不大像是配置问题。
再检查仓库有无自删 build output，没有发现脚本或者测试启动了子maven，或者清理了target/classes或者target/test-classes。或者修改了全局的classpath，或者动态删除编译产物，或者操纵URLClassLoader。
再检查 Suspect.class的完整性。后续四个找不到的文件mtime都是10:37:19，但是ctime分散在10:39～10:40，隔离副本重新编译出来的size，SHA-256与原目录相同，说明源码和编译结果本身正常。
然后检查数字后缀/冲突生成物。没有发现数字后缀或者生成物冲突。而且target/classes和target/test-classes目录中的没有symlink，不可读文件，dataless文件。
后续检查到项目目录，在 ~/Documents下，它底层不是symlink，而是本地APFS，file-provider-domain-id解码成iCloudDriverFileProvider/...，而且bird，cloudd，fileproviderd都在运行。
然后检查到，失败构建的窗口之内，iCloud日志记录如下：
- 10:37:10 开始上传200个文档
- 10:37:12 收到20个远端变更并且大量apply-changes
- 原来的target在10:37:14创建
- 10:37:25出现 upload progress...not tracked和 UNREACHABLE...should be needs-upload
- 10:41:56又收到12个编辑和15个删除文件并执行apply-changes
然后原来的Failsafe报告从正常应有的17个文件减少到3个，恰好消失了14个，target/failsafe-reports mtime/ctime也在构建结束之后继续变化。

然后检查了/private/tmp，同一份源代码，相同的Maven/Failsafe配置，相同的test order，连续3次 clean verify，三次都build success，而且源码哈希三轮都不变，所以排除Java/Spring/Failsafe/OpenAI SDK的嫌疑。

最后，这问题确认是iCloud同步工作目录干扰。修复就是原项目目录搬出iCloud Drive File Provider domain。
