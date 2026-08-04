---
title: "技术手记｜写写Spring MVC的流程，Filter拦截了啥？Interceptor拦截了啥？"
slug: "spring-mvc-filter-interceptor-flow"
date: "2026-02-23T15:07:41+08:00"
description: "按一次 HTTP 请求的完整路径，说明 Filter、DispatcherServlet、Interceptor 和 Controller 各自拦截的位置与职责。"
categories:
  - "技术手记"
tags:
  - "Spring MVC"
  - "Filter"
  - "Interceptor"
  - "八股"
legacyUrl: "https://sajlle.github.io/2026/02/23/技术手记｜写写Spring-MVC的流程，Filter拦截了啥？Interceptor拦截了啥？/"
draft: false
---
来，先上一个一次HTTP请求在Spring Boot里走过的路径（单请求路径的横切面）
```text
Client 
-> Tomcat
  -> Filter（按顺序）
    -> DispatcherServlet
      -> HandlerMapping（找Controller方法）
      -> Interceptor.preHandle（按顺序）
      -> Controller（方法执行）
      -> Interceptor.postHandle（逆序）
      -> View（渲染）/ MessageConverter（写Json）
      <- Interceptor.afterCompletion（逆序，即使异常也会）
    <- DispatcherServlet
  <- Filter（返回方向，逆序）
<- Client
```
Filter：拦截的是进入和离开DispatcherServlet之前的所有请求，面向servlet层。
- `Client -> Filter -> DispatcherServlet -> Filter -> Client`

Interceptor： 拦截的是进入Controller前后的所有请求，面向Spring MVC层
- `DispatcherServlet -> handlerMapping -> Interceptor.preHandle -> controller -> Interceptor.postHandle -> View/ MessageConverter -> Interceptor.afterCompletion -> DispatcherServlet`

视觉化的总结：
- Filter包住了dispatcherServlet
- Interceptor包住了`controller -> view/ messageConverter`，controller执行之前塞preHandle，controller执行之后塞postHandle，视图渲染之前，塞afterCompletion


### Spring MVC里的DispatcherServlet到底干啥了？
1. 找到执行哪个handler
   - HandlerMapping 根据URL，HTTP Method，参数等，找到匹配的Handler
     - 通常是`@RequestMapping`/`@GetMapping`里的某个Controller方法
2. 决定怎么执行这个handler
   - HandlerAdapter 把找到的handler用正确的方式调用起来
     - 对 `@Controller`的方法，走`RequestMappingHandlerAdapter`
3. 参数绑定 + 调用Controller
   - 把JSON body/ query/ path解析成DTO
   - 做参数校验（比如 `@Valid`）
   - 调用 Controller 方法，拿到返回值
4. 处理返回值
   - 返回JSON `@RequestBody`或者`@RestController`
     - 走HttpMessageConverter （比如Jackson），把对象写到response body
   - 返回页面（View）： ModelAndView
5. 走异常处理
   - 抛出异常的时候，会走HandlerExceptionResolver
     - `@ControllerAdvice` / `@ExceptionHandler`

人话版本：找到方法，执行方法，解析结果，异常处理
- 找到controller里的方法（HandlerMapping/@RequestMapping等等）
- 调用方法（handlerAdapter/RequestMappingHandlerAdapter）
- 解析参数（嗯，这时候接触到方法了，才解析参数）。（参数变DTO，校验参数，调用方法，拿到返回值）
- 把返回值塞给responseBody(如果返回json),MessageConverter，或者返回view（如果是jsp前后端耦合）
- 抛出异常（HandlerExceptionResolver, @ExceptionHandler/@ControllerAdvice)

### Interceptor拦截了啥？
1. preHandle(request, response, handler)
   - 发生在拿到handler之后，执行handler之前，拿到的是哪个controller的哪个方法
   - 可以返回false终止请求
   - 用途：需要知道这是哪个业务接口/哪个注解的策略
2. postHandle(reques, response, handler)
   - 发生在Controller执行之后，渲染之前
   - 请求走到Controller，且没有异常
   - 可以改 ModelAndView，纯JSON场景用处少
3. afterCompletion(request, respons, handler, ex)
   - 请求整个完成之后，包括异常/视图渲染/JSON写出之后
   - 最适合做：资源清理，耗时统计收尾，MDC清理
   - 即使异常也会被调用，这也是它比postHandle更可靠的地方

人话版本总结：
- preHandle：适合需要知道哪个业务接口
- postHandle：请求走到这里且无异常，有异常可能不走这里
- afterCompletion：即使异常也被调用，适合请求执行完之后的资源清理等收尾工作

### Filter到底拦截了啥？
Filter（javax.servlet.Filter/ jakarta.servlet.Filter）只有一个核心`doFilter(request, response,chain)  `，作用是：
- 是否继续chain.doFilter()，让请求往后走
- 在chain.doFilter前后做什么

Filter能力比较底层：
- Filter能在Spring没找Controller之前拦截
- 对所有路径都可能生效（包括静态资源，非MVC servlet等）
- 包裹request/response(wrapper)，做I/O处理，比如缓存body，加解密，统一压缩等

### Spring Security的链路在哪？
