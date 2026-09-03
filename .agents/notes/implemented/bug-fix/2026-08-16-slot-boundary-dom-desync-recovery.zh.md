# Agent Note: slot 条目边界自愈 DOM 失步崩溃

Status: implemented

[English](2026-08-16-slot-boundary-dom-desync-recovery.md) | 中文

## 问题

用户会话在 [scoped-slots.tsx](../../../../packages/client/web-react/src/scoped-slots.tsx) 第 326 行记录了 `NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.`，报错前缀为 `slot entry crashed in 'conversation.composer.bar'`。该消息来自 `SlotErrorBoundary.componentDidCatch`，说明崩溃已被包含——应用没有崩溃——但 composer bar 没有幸免。该 bar 是 `single` 类 slot，只有一个注册；边界的崩溃报告让该注册让位（非 chain 类都会以 `reportEntryError(..., { abdicate: true })` 让位），于是 `entriesOfSlot` 没有幸存者，outlet 渲染出永久崩溃面 `<div data-slot-error="conversation.composer.bar" />`。用户的输入 UI 一直空白，直到条目重新注册（HMR）或页面刷新。

抛出的 `NotFoundError` 是 React 自身的 DOM 记账与真实 DOM 失去同步：React 试图移除一个已不再是其记录父节点的子节点。注册者的组件并没有抛错，抛错的是环境——浏览器扩展或脚本改动 React 管理的 DOM、portal 容器在提交中途被拆除、或 HMR 重新注册与卸载竞态。把这种环境性失败当作注册者失败对待，正是缺陷所在：它永久清退了一个健康的条目。

## 决策

`SlotErrorBoundary` 在报告前先对崩溃分类。`name === 'NotFoundError'` 的 `DOMException`（`removeChild`/`insertBefore` 失步的特征）属于 React↔DOM 失步，而非注册者失败。对该类，边界：

- 以 `{ abdicate: false }` 通过 `onEntryError` 报告，使条目保留在它的格子中，不启动幸存者搜索；
- 用新 key（带 `remount` 计数器的 keyed `Fragment`）将子树重新挂载一次，从零重建子树的 fiber↔DOM 记账；
- 当失步持续超过一次重挂载（`MAX_DESYNC_REMOUNTS = 1`）时，回落到普通的崩溃面 + 让位路径，让持续敌对的环境仍然响亮失败，而不是循环。

注册者失败（组件渲染抛错、inject 工厂抛错、其他一切）保持既有行为不变：立即崩溃面，shadowing 类让位给格子的下一个幸存者。装配错误仍然重抛。`onEntryError` 契约从 `(error) => void` 放宽为 `(error, info?: { abdicate?: boolean }) => void`；调用方的默认策略（`spec.kind !== 'chain'`）在边界未覆盖时生效。

## 备选方案

**维持边界崩溃面不变（不改）。** 被否决：这正是所报告的 bug。一次短暂的环境失步会永久摧毁单条目 slot 的 UI，唯一的恢复是重新注册或刷新——对一个并非注册者过错导致的崩溃而言不成比例。

**任何崩溃都重挂载，而不只限于失步类。** 被否决：渲染抛错的注册者在新的挂载上还会抛错，无条件的重挂载只会让同样的终点崩溃面多一次渲染与报告循环。把重挂载限制在重挂载确实能治愈的类（fiber↔DOM 失步），才能让注册者失败路径保持快速、诊断保持干净。

**无界重挂载（不设预算）。** 被否决：持续对抗 React 的改写者会把边界钉在崩溃/重挂载循环里。一次自愈后响亮失败，才是包含哲学的边界。

**从源头修复失步。** 被否决，超出本次改动范围：源头是环境性的（外部 DOM 改写）或跨切面的竞态（HMR 拆除、portal），不是本包中的单一缺陷。边界恢复正是包含缝的职责：让 React 交给它的子树在环境作祟时存活下来。

## 后果

- 单条目 slot（composer bar，以及未来任何单占用 UI）能挺过一次 DOM 失步事件：它重新挂载焕然一新，用户无需刷新即可继续输入。持续改写者仍会在一次重试后得到崩溃面。
- 失步事件保持可观察：`componentDidCatch` 仍会记录日志，非让位报告仍会到达账本的 `onEntryError` 监督监听器。
- `onEntryError` prop 契约多了一个可选覆盖参数；所有调用点（`guarded`、`StrictSessionEntry`、`RootOutlet`）都透传它，注册者失败的 kind 默认策略保持不变。
- 恢复以边界实例为界：新的赢家（重选、HMR 重新注册）挂载带全新重挂载预算的新边界。

## 测试

[scoped-slots.client.spec.tsx](../../../../packages/client/web-react/tests/scoped-slots.client.spec.tsx) 中新增的 `DOM-desync recovery in entry boundaries` 块覆盖：single slot 的 `NotFoundError` 无让位自愈（报告参数 `{ abdicate: false }`、无 `[data-slot-error]`、两次挂载）；经由 `StrictSessionEntry` 的相同路径；持续失步在一次重挂载后回落崩溃面 + 让位（报告参数先 `{ abdicate: false }` 后 `{ abdicate: true }`）；注册者 `Error` 保持立即让位且不重挂载。既有的崩溃包含测试（list slot 兄弟存活、inject 工厂抛错、chain 重选）不变，钉住注册者路径。
