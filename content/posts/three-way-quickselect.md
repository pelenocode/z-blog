---
title: "算法｜今天上午写215题三路QuickSelect，一点总结"
slug: "three-way-quickselect"
date: "2026-09-20T11:26:07+08:00"
description: "从循环不变量、未知区收缩和 pivot 取值出发，梳理三路 QuickSelect 的双向写法、边界条件与常见错误。"
categories:
  - "算法"
tags:
  - "Quick Select"
legacyUrl: "https://sajlle.github.io/2026/09/20/算法｜今天上午写三路QuickSelect，一点总结/"
draft: false
---
基本思路就是把数组划分为四个区间：
- low ~ lt-1: < pivot
- lt ~ i-1: = pivot
- i ~ gt: 未知区
- gt+1 ~ high: > pivot

然后保证未知区一定缩水：
```markdown
nums[i] < pivot
-> 跟 lt 交换，左边收走，lt++
-> i++
-> 未知区左边收缩

nums[i] == pivot
-> 中间收走
-> i++
-> 未知区左边收缩

nums[i] > pivot
-> 跟 gt 交换，右边收走
-> gt--
-> 未知区右边收缩
```
最后[i,gt]像是两头不断被啃掉的待处理池。

另外，pivot 要存值，不要存下标。交换过程中元素的位置会变，存下标的话，比较到一半，pivot 就被换走了。

但是非得规定未知区就是[i,gt]吗？
当然不是。我们还可以把未知区规定成[lt,i]，这样只需要从右往左检查。

然后循环不变量变成：
- low ~ lt-1: < pivot
- lt ~ i: 未知区
- i+1 ~ gt: = pivot
- gt+1 ~ high: > pivot

这时候i从右往左走。代码也可以写成镜像版本：
```java
int lt = low;
int i = high;
int gt = high;

while(lt <= i){
    if(nums[i] > pivot){
        swap(nums,i,gt);
        gt--;
        i--;
    }else if(nums[i] < pivot){
        swap(nums,i,lt);
        lt++;
        // 这个地方i不动，因为左边换过去的东西还没有检查
    }else{
        i--;
    }
}
```
两个版本最后殊途同归：原始版本结束时 i = gt+1，镜像版本结束时 i = lt-1，而[lt,gt]都正好是等于区。

这时候这题的经典坑，就反过来了。原始版本是`nums[i]>pivot`，从`gt`换过来的是未知元素，所以i不动。我们镜像版本`nums[i] < pivot`从`lt`换过来的是未知元素，所以i不动。
详细点做个对比：

原始版本（左 → 右）：
```markdown
遇到小元素
-> 跟 lt 交换
-> 换回来的是等于区的元素（已检查）
-> i 可以走

遇到大元素
-> 跟 gt 交换
-> 换回来的是未知区右端的元素（未检查）
-> i 不能走
```
镜像版本（右 → 左）：
```markdown
遇到大元素
-> 跟 gt 交换
-> 换回来的是等于区的元素（已检查）
-> i 可以走

遇到小元素
-> 跟 lt 交换
-> 换回来的是未知区左端的元素（未检查）
-> i 不能走
```
严格来说，“换回来的是等于区的元素”有个边界：等于区为空时，换回来的就是它自己。这种情况下 i 照样可以走，因为它本身已经检查过，交换后也已经归位了。

划分完之后，才是 Select 的部分。第 k 大对应升序下标 n-k，看它落在哪个区间，只往那一边继续：
```java
public int findKthLargest(int[] nums, int k) {
    int target = nums.length - k; // 第 k 大 = 升序下标 n-k
    int low = 0, high = nums.length - 1;
    Random rand = new Random();

    while (true) {
        int pivot = nums[low + rand.nextInt(high - low + 1)]; // 随机选，存值不存下标
        int lt = low, i = low, gt = high;
        while (i <= gt) {
            if (nums[i] < pivot) {
                swap(nums, i, lt);
                lt++;
                i++;
            } else if (nums[i] > pivot) {
                swap(nums, i, gt);
                gt--;
                // i 不动：从右边换回来的还没检查
            } else {
                i++;
            }
        }
        if (target < lt) high = lt - 1;        // 答案在小于区
        else if (target > gt) low = gt + 1;    // 答案在大于区
        else return pivot;                      // 落在等于区，直接命中
    }
}
```
三路划分在这里还有个额外的好处：target 一旦落进等于区就直接返回。遇到大量重复元素的用例，不把等于 pivot 的元素整体收拢的两路实现，容易退化超时，三路划分反而更快。pivot 随机选，是为了避免固定选点在有序或特定输入上系统性退化；随机化让 QuickSelect 获得期望线性复杂度，但最坏情况仍然是 O(n²)。

所以这题重点是：必须先定义每一个区间代表什么，然后每一次交换都不能破坏这个定义。
重新定义的时候，需要做到两件事：
1. 每一轮处理之后，这几个区域的定义依然成立
2. 未知区域每一轮至少缩小一个元素，最终一定归零。

简单总结：指针的位置不是算法真理，区间含义+循环不变量才是算法真理。
