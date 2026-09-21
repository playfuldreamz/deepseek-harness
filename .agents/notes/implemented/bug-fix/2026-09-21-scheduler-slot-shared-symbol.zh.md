# Agent Note：跨重复模块求值的共享调度器槽位符号

Status: implemented

[English](2026-09-21-scheduler-slot-shared-symbol.md) | 中文

## Problem

Web 服务器的 tool 调用轮次在分发前失败，错误为 `TOOL_SCHEDULER_UNAVAILABLE` 且 `schedulerSlot: foreign`：`ctx.tools` 是一个真正的 `ToolRuntime`，但实例上的调度器槽位符号与 agent 循环导入的符号不一致。只有当同一进程中存在两次 `dsh-tools` 求值（源码与构建产物副本，或两条加载器路由）时，每个求值自带的 `Symbol()` 才会出现这种分歧，于是循环在一个健康的 registry 上读到了缺失的槽位。

## Decision

`TOOL_RUNTIME_SCHEDULER` 改为取自全局符号注册表（`Symbol.for`），而不再是每次求值新建的 `Symbol()`。模块的每次求值都产生同一个键，因此无论哪个副本构造了 registry，循环总能找到调度器。调度器对象本身仍是每实例一份，所有实例行为都保持在其所属副本内部，不跨越副本边界：生产代码中没有 `instanceof ToolRuntime` 检查，工具错误标识以字符串 code 传递。循环中的 `foreign` 检测保持不变，仍可报告手工构造的同描述符号。

## Alternatives considered

**强制单一模块求值。** 让所有加载器路由（profile fallback 链接、tsconfig-paths 映射、构建产物 `lib/` 导出）收敛到同一个文件 URL，依赖的是该包之外的部署解析行为，每新增一条路由都可能再次断裂；共享键不依赖路由。

**失配时重挂 tools 插件。** 在轮次中途销毁并重建 registry 会丢弃已注册工具和会话相关的策略状态；报错时机在任何 `tool/call` 提交之前，但被拒绝的 registry 本身功能完整。

**用字符串做槽位键。** 服务对象上的字符串键可能与 Cordis 内部及未来的服务成员冲突；注册表符号既保持独立命名空间，又共享标识。

## Consequences

重复求值仍可能发生（多一份模块记录的内存开销），但不再导致轮次失败：槽位读取对副本透明，其余跨副本接触面都是结构性的（相同方法名、字符串 code、纯数据事件），不依赖标识。回归测试在两端锁定注册表标识：导出等于其描述对应的 `Symbol.for`，且循环能针对以独立获取的注册表符号为键的 tools 对象正常执行一批调用。
