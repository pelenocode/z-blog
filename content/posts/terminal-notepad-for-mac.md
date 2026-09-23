---
title: "终端记事本·灵魂补丁版～弥补Mac没有记事本的遗憾"
slug: "terminal-notepad-for-mac"
date: "2025-12-16T17:53:31+08:00"
updated: "2025-12-16T17:53:31+08:00"
description: "用一个带时间戳的 Shell 脚本，在 macOS 桌面快速创建并打开临时 Markdown 记事文件。"
categories:
  - "技术手记"
tags:
  - "Mac"
  - "vim"
  - "记事本"
  - "给设备打补丁"
  - "修理工"
draft: false
---
自从今年换了Mac之后，哪哪都好，唯一痛点，Mac没有记事本，不能像windows一样，右键点开，新建文件。
所以比较烦，就重回vim怀抱，新建文件，自己打开终端，直接开始`vi`

不过这也太烦了。毕竟打开终端--> `vi` --> 写文件 --> 命名 --> 保存。这一套流程也很烦人。
能不能简化一下呢？因为我用vim新建小文件，顶多是记录杂项，过一阵就删除了。所以最重要的是省事儿，其他的不需要。

于是我写个shell脚本，快速新建带时间戳的`.md`文件，在桌面自动生成文件并打开。

步骤如下：
1. 打开终端，输入：`vi ～/.zshrc`
2. 在文件末尾写函数并保存，函数内容如下：
```bash
function note() {
    title=$1
    if [ -z "$title" ]; then
      filename="note-$(date + "%Y-%m-%d-%H%M").md"
    else
      filename="note-$(date + "%Y-%m-%d-%H%M")-$title.md"
    fi 
    filepath=~/Desktop/$filename
    touch $filepath
    vi $filepath
}
```
3. 更新配置文件：`source ~/.zshrc`
4. 用法
```bash
note # 默认新建 note-2025-12-16-1809.md
note dream # 默认新建 note-2025-12-16-1809-dream.md
```
