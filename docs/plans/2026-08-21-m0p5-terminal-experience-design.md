# M0.5 终端体验检查点设计

- 状态：已批准
- 日期：2026-08-21
- 方案：B2
- 前置条件：原实施计划 Task 1–6 全部完成，M0 工程 Gate 通过

## 1. 目的

M0.5 在不改变原架构和里程碑标准的前提下，把已经通过 M0 的确定性 Core 变成一个可以亲自操作的终端闭环。

它回答的不是“真实模型能否准确理解偏好”，而是更早回答四个产品问题：

1. 用户能否理解“候选偏好”与“已生效偏好”的区别？
2. 确认后产生的行为变化是否清晰可感知？
3. 撤销和场景隔离是否符合直觉？
4. 这种受治理的偏好是否明显不同于普通聊天记忆？

如果这些基本交互本身没有意义，就在 SQLite、HTTP、Web Inspector、真实 Observer 和 AIRI 接入之前停止或调整方向。

## 2. 与原计划的关系

原 Task 1–6、Task 7–17 及 M0–M4 Gate 保持原义。M0.5 只是插入在 M0 与 M1 之间的新检查点：

```text
Task 1–6 / M0 工程 Gate
→ M0.5 终端体验检查点
→ 用户 Continue / Revise / Stop
→ Task 7–14 / M1
```

M0.5 不能替代：

- Task 14 的真实模型质量与 Memory/RAG 基线评测；
- Task 15 的 AIRI 协议与第二宿主验证；
- Task 17 的真实用户与端到端验收。

它也不能被用来宣称项目已经拥有真实 AI 学习、持久化、跨宿主复用或产品级 UI。

## 3. 体验范围

第一版只演示一个工作陪伴偏好和一个跨领域反例。

### 3.1 主场景

```text
一段合成工作对话
→ Fake Observer 提出 interaction.response_detail = concise
→ 终端显示候选、证据引用、作用域和风险说明
→ 用户输入 confirm
→ Core 生成用户确认的 PreferenceRecord
→ 同一工作请求的确定性预览从详细版变为简洁版
→ 用户输入 revoke
→ Guidance 恢复为空，预览恢复基线版
```

确认前，候选永远不能影响预览。确认与撤销必须调用正式 Lifecycle、Repository 和 Resolver 路径，终端不能直接改对象或伪造 Guidance。

### 3.2 跨领域反例

终端预置一个只适用于 `companion` 领域的 `companion.support_style` 候选或记录。切换到 `work` 查询时，Resolver 必须排除它并显示隐私/作用域原因，不能产生工作 Guidance。

### 3.3 确定性预览

终端不调用真实聊天模型。它使用两个明确标记为 `Deterministic preview` 的固定响应模板，并只根据正式 `BehaviorGuidance` 选择展示版本。

因此 M0.5 证明的是“治理闭环和行为控制信号可理解”，不是“模型回复质量更好”。

## 4. 架构

新增 `apps/m0-terminal`，只负责输入输出和应用编排，不拥有新的领域状态或规则：

```text
apps/m0-terminal
├── scenario       合成场景和固定响应预览
├── session        调用正式 Observer / Repository / Lifecycle / Resolver
├── render         人类可读的候选、状态、解释和预览
└── main           readline 命令循环
        │
        ├── @companion-preference/contracts
        ├── @companion-preference/preference-core
        └── @companion-preference/observer (Fake only)
```

`apps/m0-terminal` 是可长期保留的体验回归工具。后续真实参考宿主不会依赖它；Task 13 可以复用它的场景和可读术语，但仍通过正式 Runtime Client 和模型传输实现真实闭环。

## 5. 命令与状态

最小命令集：

```text
help
show
next
confirm <candidate-id>
reject <candidate-id>
revoke <preference-id>
domain work|companion
reset
exit
```

规则：

- `show` 显示当前领域、Pending、Active Profile、排除原因、Guidance 和确定性响应预览。
- `next` 只推进冻结场景，不接受任意私密对话输入。
- 非法 ID、非法状态转换和重复命令返回可读错误，不修改状态。
- `reset` 只重建内存状态；退出后不保留任何数据。
- 每一步同时提供脚本化输入路径，保证测试与人工演示使用同一编排逻辑。

## 6. 数据与安全边界

- 只使用仓库内合成场景，不读取用户真实聊天。
- 只使用 `FakePreferenceObserver`，禁止网络、API Key 和真实模型调用。
- 只使用 `InMemoryPreferenceRepository`，禁止 SQLite、文件写入和后台服务。
- 不启动 HTTP、MCP、AIRI 或 Web UI。
- 不新增偏好键，不修改已冻结 Contracts、Lifecycle、Resolver 或 Repository 语义。
- 终端输出只展示合成证据摘要和稳定 ID。

## 7. 错误处理

总原则是“演示失败必须显式失败，不能伪造成功”。

- M0 Gate 未通过：拒绝构建 M0.5。
- 所需 Core API 与本设计不同：返回原计划进行高阶复核，不在终端包中复制规则。
- Fake Observer 无候选：显示 `No candidate proposed`，不自动生成生效记录。
- 非法确认/撤销：显示正式领域错误并保持先前状态。
- 跨领域记录意外进入 Guidance：测试失败并阻断 M0.5。
- 任何网络或持久化尝试：测试失败并阻断 M0.5。

## 8. 测试与验收

自动验收必须证明：

1. 未确认候选不改变 Guidance 或预览。
2. 确认后，正式 Active Profile 和 Guidance 同时变化。
3. 撤销后，Guidance 与预览恢复基线。
4. companion-only 偏好不进入 work Guidance。
5. 重复 action ID 遵循正式幂等语义。
6. reset/exit 后无持久化状态。
7. 测试期间没有网络、文件数据库或 AIRI 调用。

人工检查点记录四个问题：

- 候选是否容易理解？
- 确认后的变化是否足够明显？
- 确认和撤销是否符合预期？
- 这是否比“系统记住一条事实”更接近你想要的陪伴？

结果只能是：

```text
CONTINUE  体验方向成立，进入 M1
REVISE    修改偏好表达或交互，再重复 M0.5
STOP      收缩为 Explicit Companion Profile 或重新讨论问题定义
```

没有完成人工检查时，状态为 `NOT_EVALUATED`，不能自动进入 M1。

## 9. 设计结论

M0.5 不优化最终 UI，也不证明真实模型效果。它以最小成本把正式 Core 变成一个可理解、可操作、可否决的体验检查点，从而保护原计划免于在产品假设尚未被感知时继续扩大工程投入。
