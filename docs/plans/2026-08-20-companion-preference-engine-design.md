# Companion Preference Engine 设计

- 状态：已批准
- 日期：2026-08-20
- 阶段：首个可用垂直切片
- 工作目录名：`companion-preference-engine`，最终公开名称尚未确定

## 1. 背景

最初愿景不是再做一个带长期记忆、人设和形象的聊天应用，而是让同一个 AI 伙伴能够跨 AIRI、编码 Agent、通用聊天产品以及未来的机器人载体持续存在。

完整的“同一个伙伴”至少包含五种连续性：

1. 身份连续性：伙伴是谁，其价值、人格和边界保持稳定。
2. 关系连续性：伙伴与用户之间的共同经历和关系变化保持连续。
3. 记忆连续性：伙伴能够记住用户、目标、重要事件和共同经历。
4. 目标连续性：伙伴能持续跟进用户长期目标，并支持总结和反思。
5. 行为连续性：伙伴知道用户希望以什么方式被陪伴。

本项目第一阶段只直接解决第五项：把用户希望怎样被陪伴，转化为有证据、有作用域、需确认、可撤销的结构化偏好。它不是完整 Companion System，也不应该把身份、关系、记忆、目标和主动行为错误地编码成偏好字段。

研究与现有工程说明这个问题真实存在，但也存在明显的重复风险：

- [PrefEval](https://arxiv.org/abs/2502.09597) 显示，模型仅依赖长上下文时难以稳定识别并遵循用户偏好。
- [AMPLe](https://aclanthology.org/2025.acl-long.1590/) 说明通过比较反馈学习隐式、多维偏好是可行方向。
- [Plast Mem](https://github.com/moeru-ai/plast-mem) 已经覆盖偏好、关系、目标和行为准则等语义记忆类型。
- AIRI 的 [长期记忆 PR #1973](https://github.com/moeru-ai/airi/pull/1973) 已覆盖对话事实抽取、本地存储、召回和上下文注入。

因此，如果本项目只是“对话 → LLM 抽取偏好 → 保存 → 塞回 Prompt”，它不具备独立价值。差异必须来自偏好治理：候选、确认、作用域、冲突、版本、过期、撤销、解释和安全应用。

## 2. 核心定位

Preference Engine 回答：

> 用户已经授权哪些交互规则、这些规则适用于什么场景、依据是什么，以及为什么本次应用或没有应用。

Memory 系统回答：

> 哪些过去信息可能与当前任务有关。

二者可以协作，但不能互相替代。Preference Engine 可以消费 Memory Provider 提供的证据引用，但不在第一阶段建设另一套向量库或完整长期记忆平台。

## 3. 已确认的产品约束

- 第一轮实时场景：工作与创作陪伴。
- 第二轮场景：日常与情绪陪伴。
- 两类场景共享同一套状态机和协议，但分别评测。
- 第一版：单用户、单设备、多个宿主。
- 存储本地优先。
- 用户可以选择本地模型或自己的云端模型供应商。
- 自动观察默认关闭。
- 原始对话和已确认 Profile 分开保存。
- 推断结果不能未经确认直接影响行为。
- 同一份 Profile 可以被 AIRI、参考聊天端和未来的编码 Agent 使用。
- 第一阶段是可用的垂直切片，而不是只做离线论文原型，也不是产品级公开发布。

## 4. 目标与非目标

### 4.1 第一阶段目标

完成以下真实闭环：

```text
宿主对话
→ 标准化交互证据
→ 产生偏好候选
→ 用户查看证据并确认
→ 形成有版本的 Active Profile
→ 宿主在下一轮获得结构化 Guidance
→ 用户可撤销并停止影响
```

同时证明：

- Core 不引用 AIRI、Codex 或具体 LLM Provider 类型。
- 同一 Core 能在 AIRI 和一个参考聊天端中工作。
- Preference Engine 在盲评中优于普通 Memory/RAG 基线。
- 用户能够理解、确认和纠正候选，不产生不可接受的确认负担。

### 4.2 第一阶段非目标

- 主动发消息或跨平台通知中心。
- 亲密度、好感度或完整 Relationship Engine。
- 完整 Companion Identity 与人格演化。
- 通用长期记忆、知识图谱或复杂向量检索。
- 自动每日反思和目标管理。
- 云账号、多用户、多设备同步。
- Live2D、语音、视觉生成或机器人控制。
- 插件市场、通用工作流引擎或多 Agent 网络。
- 自动修改 AIRI Character Card。
- Kimi、豆包等封闭平台的完整接入承诺。

## 5. 总体架构

核心采用 Library-first，Standalone、Embedded SDK、Sidecar 和 MCP 都只是运行外壳。

```text
Preference Core
├── Schema Pack
├── Candidate State Machine
├── Scope Resolver
├── Conflict / Version / Revocation
└── Explanation
          │
          ├── Standalone Runtime
          ├── Embedded SDK
          ├── Local Service API
          └── MCP Server
```

第一阶段的逻辑组件：

```text
contracts
  身份、作用域、证据、候选、Profile 和 Guidance 契约

preference-core
  确定性状态机、冲突处理、版本、撤销和作用域解析

observer
  可替换的 LLM 推断器，只能提出候选

profile-store
  本地权威数据持久化

runtime-local
  生命周期、本地 API、任务执行与单写入者协调

inspector
  权限、候选审核、证据解释、编辑、删除和导出

adapters
  AIRI、参考聊天端及 MCP 接入

eval
  固定场景、基线比较和回归测试
```

### 5.1 单一权威运行时

同一时间只能有一个 Canonical Runtime 写入同一份数据：

- AIRI 单独使用时，未来可以由 AIRI 内嵌 Runtime。
- 多宿主共享时，由独立本地 Runtime 持有状态，各宿主作为客户端连接。
- 独立 Runtime 可以由桌面应用、AIRI 或 MCP 客户端自动拉起，用户无需手动维护后台服务。
- MCP Server 和各 Adapter 不得拥有自己的偏好、记忆或关系数据库。
- Standalone 与 Embedded 模式不能同时写同一个数据库。

### 5.2 长期 Companion System 的模块边界

Preference Core 是长期系统的第一块领域核心。未来经过独立验证后，可以增加：

```text
Identity Core
Memory Provider
Relationship Core
Goal Core / Reflection Worker
Proactivity Policy
Sync Service
Embodiment Adapters
```

这些模块当前不创建空壳。第一阶段只在公共契约中保留必要的稳定标识和扩展边界。

## 6. 稳定身份与来源

所有证据从第一天携带：

```text
userId
companionId
relationshipId
hostId
sessionId
domain
occurredAt
sourceRef
collectionPolicy
outboundInferencePolicy
projectionPolicy
schemaVersion
```

含义：

- `userId`：本地用户的稳定身份。
- `companionId`：跨宿主伙伴身份，不能直接使用 AIRI Character Card ID 或 Codex Session ID。
- `relationshipId`：用户和伙伴之间的稳定关系标识；第一阶段只引用，不管理关系状态。
- `hostId`：事件来自 AIRI、参考聊天端或其他宿主。
- `sessionId`：宿主会话标识；宿主没有正式会话字段时只能使用明确配置的 sentinel，不能伪造成宿主原生 ID。
- `domain`：第一阶段主要为 `work`，同时支持跨场景隔离测试。
- `sourceRef`：可追踪到宿主事件；它只在宿主命名空间内唯一，幂等去重使用 `userId + companionId + relationshipId + hostId + sourceRef` 复合键。
- `collectionPolicy`：控制哪些有类型的来源可进入系统以及是否保留正文。
- `outboundInferencePolicy`：独立控制禁用推理、仅本地推理或明确允许的远端推理。
- `projectionPolicy`：控制哪些宿主和领域可以读取派生结果。

这三层授权互不传递：允许采集不等于允许发给云端，允许推理也不等于允许投影给其他宿主。

未明确绑定到同一 `userId/companionId/relationshipId` 的来源不能自动合并状态。

## 7. 核心数据对象

### 7.1 InteractionEvidence

宿主无关的交互证据。第一阶段支持：

- 用户发言。
- 助手回应。
- 用户显式设置。
- 用户对某次回应的反馈或纠正。
- 必要的非敏感环境信号。

宿主原始对象、Character Card、代码 Diff、终端正文和完整模型输入不能直接成为 Core 契约。Adapter 只传递形成偏好判断所需的最少内容。

### 7.2 PreferenceCandidate

Observer 提出的候选，至少包含：

- 类型化的偏好键和值。
- 适用作用域。
- 证据引用和反证引用。
- 置信度。
- 风险类别。
- 待确认状态。
- 可选的失效时间。

### 7.3 PreferenceRecord

用户手工设置或确认后的生效记录，至少包含：

- 类型化偏好键和值。
- 作用域与隐私范围。
- 权威来源：用户手工设置或用户确认。
- 修订版本。
- 生效、撤销或被替代状态。
- `supersedes` 关系。
- 证据引用。

### 7.4 EffectiveProfile

根据当前宿主、领域、项目、任务和隐私范围临时解析出的结果。它不是独立真相源，也不持久化为一段自然语言 Prompt。

### 7.5 BehaviorGuidance

Core 的结构化输出，例如：

```json
{
  "responseDetail": "concise",
  "directness": "direct",
  "initiative": "low_risk_auto",
  "verificationDepth": "targeted",
  "avoid": ["generic_reassurance"]
}
```

各宿主负责把 Guidance 映射为自己的 Context、规则、文本风格、表情或动作。Core 不输出最终 Prompt、回复、Live2D 动作或机器人指令。

## 8. 偏好 Schema 与作用域

第一阶段只允许白名单、命名空间化的偏好键：

```text
interaction.response_detail
interaction.directness
interaction.initiative
interaction.interruption_policy

work.approval_style
work.verification_depth

companion.support_style
```

`companion.support_style` 第一阶段只用于第二场景的离线和跨场景泄漏测试，不进入首轮工作场景实时产品路径。

作用域从具体到宽泛：

```text
当前任务
→ 当前项目/工作区
→ 当前宿主
→ 当前领域
→ 全局
```

解析规则：

1. 只选择与当前请求匹配的记录。
2. 更具体的作用域优先。
3. 同一作用域中，用户手工设置优先于确认后的模型推断。
4. 新记录必须显式 `supersedes` 旧版本，不能静默覆盖。
5. 未解决冲突时不应用任何冲突项，并提交 Inspector。
6. 自动推断不能直接创建全局偏好。
7. 只有用户可以把已确认偏好提升为全局。
8. 临时情绪、一次性指令和当前任务状态不能升级为长期偏好。

跨宿主隐私默认最小可见：

- 工作偏好默认只对工作领域宿主可见。
- 用户可选择仅当前宿主、指定宿主、同领域宿主或全部宿主。
- 健康、亲密关系和情绪数据不能自动暴露给编码 Agent。
- 跨宿主连续性不等于所有宿主获得所有数据。

## 9. 候选与偏好生命周期

证据、候选和已确认偏好是三个对象，不能共用一个状态枚举：

```text
Evidence
live → deleted-tombstone

Candidate
pending_confirmation → confirmed | rejected | superseded | deleted

PreferenceRecord
active → superseded | revoked | deleted
```

规则：

- 用户在 Inspector 等可证明人工动作的通道中直接设置的偏好可以立即生效；普通 Agent/MCP 工具调用只能提出待确认候选。
- 从普通对话识别出的内容，即使置信度很高，第一阶段也只能成为候选。
- Observer 无权直接修改 Active Profile。
- Adapter 无权绕过 Core 修改 Confirmed Profile。
- 拒绝的候选保留最小去重记录，避免反复询问同一内容。
- 删除证据、删除候选、撤销偏好和完全重置是不同操作。

## 10. 第一版数据流

```text
1. 用户分别允许 AIRI 采集、学习、对外推理和应用工作场景偏好
2. AIRI Adapter 获得当前轮用户和助手消息
3. Adapter 移除未授权字段并转换为 InteractionEvidence
4. Runtime 幂等接收；采集或学习关闭时不保留正文，只记录无内容的决定原因
5. Observer 异步生成 PreferenceCandidate
6. Core 检查 Schema、作用域、重复、冲突和风险
7. Inspector 展示候选、证据和反证
8. 用户确认、修改、调整作用域或拒绝
9. Core 产生新版本 PreferenceRecord
10. 宿主按当前场景查询 EffectiveProfile
11. Core 返回结构化 BehaviorGuidance
12. Adapter 将 Guidance 映射为宿主 Context
13. 用户反馈成为下一轮 Evidence
```

Observer 不阻塞宿主正常对话。Observer、模型或 Runtime 失败时，宿主退化为无个性化模式。

## 11. Adapter 能力模型

每个宿主声明四项能力：

```text
observeTurns
injectContext
deliverNotification
receiveFeedback
```

第一阶段：

- AIRI：验证 `observeTurns`、`injectContext` 和可获取的反馈路径。
- 参考聊天端：完整实现首轮闭环，作为宿主无关性证明。
- MCP：第一阶段提供读取 Profile、候选查询和“提出待确认候选”的工具，不假定它能被动观察每一轮对话，也不把模型发起的工具调用当成人工确认。
- 主动投递不进入第一阶段。

宿主能力可以降级。因此“同一个伙伴”表示共享同一身份和权威状态，不表示每个宿主拥有完全相同的交互能力。

## 12. AIRI 接入设计

第一阶段使用外部 Sidecar Adapter，不要求 AIRI 直接依赖本项目：

```text
AIRI output:gen-ai:chat:complete
→ AIRI Adapter
→ Local Runtime
→ Candidate / Confirmation
→ Local Runtime
→ AIRI context:update + replace-self
→ 下一轮对话
```

AIRI 当前已有对话完成事件、外部 WebSocket 客户端、Context Registry 和 `context:update` 路径，因此普通对话 PoC 有条件可行；但必须先做协议实验，不能把 SDK 类型表面上存在的字段当作运行时已实现语义。

现有风险：

- `output:gen-ai:chat:complete` 当前是广播事件，Sidecar 通过 `onEvent` 接收；它会在 Sidecar 过滤之前携带 `composedMessage`、contexts 和 input，因此第一版只能保证 Sidecar 不转发、不落盘和不记录这些字段，不能声称 AIRI 源头隔离。
- 当前正式事件缺少稳定的用户、角色、领域和会话作用域；PoC 只能使用配置好的单一身份、领域和 session sentinel。
- `replace-self` 实际按稳定的事件来源 bucket 替换，而不是按 `contextId`；Sidecar 重启时必须复用稳定 Client identity。
- 空文本只能形成 blank tombstone，不能真正删除 source bucket；SDK send 也没有 Stage/server ACK，只能在下一轮 context snapshot 或 DevTools 中验证实际应用。
- Context 清除和 TTL 能力不足。
- 正式 Plugin Platform 仍处于 Active Design。

首个 AIRI Feature Request 应保持很窄：

1. 默认关闭、需用户授权且只包含最小字段的 completed-turn 事件。
2. 只发送当前轮原始用户文本和助手输出。
3. 提供稳定的 `sessionId`、`turnId`、`characterId` 和用户作用域。
4. 默认不发送 `composedMessage`、system prompt 或完整历史。
5. 按能力授权订阅，而不是广播给所有已认证 peer。

第二个独立请求再增加按来源清除 Context 或 `remove-self`，保证“关闭应用”真实可逆。

## 13. Inspector 与用户控制

Inspector 第一版包含：

```text
Connections
  宿主连接状态、权限和模型供应商

Pending
  候选、证据、反证、作用域、冲突和审核操作

Active Profile
  各领域和宿主当前真正生效的偏好

Data & History
  版本、撤销、删除、导出和完全重置
```

每张候选卡支持：

- 确认。
- 修改后确认。
- 调整作用域。
- 拒绝。
- 不再提出这类候选。
- 查看证据和反证。

控制面拆分为：

1. 允许宿主发送对话。
2. 允许从观察中学习。
3. 允许已确认偏好影响行为。
4. 允许主动行为。

第一版实现前三项。主动行为尚未实现时明确显示不可用，不提供假开关。

关闭“允许应用”时，Adapter 必须停止继续注入。AIRI 第一版写入 blank tombstone 后先显示 `tombstone-locally-written`/未验证；只有下一轮 context snapshot 确认已确认文本不再出现，才显示 `verified-guidance-absent`。由于当前协议不能真正删除 bucket，也没有发送 ACK，Inspector 不能显示为“已彻底清空”。

## 14. 隐私与数据治理

- 自动观察默认关闭。
- 每个宿主单独授权。
- 采集、对外推理和投影/应用是三组独立策略。
- 原始 Evidence、候选和 Confirmed Profile 分开存储。
- 默认不采集代码、终端正文、密钥和完整模型输入。
- 云端 Observer 明确显示供应商，仅发送必要片段。
- 敏感数据不能从身份或暗示中自动推断。
- Profile 不默认跨领域、跨宿主可见。
- 用户可查看、修改、撤销、导出并从活动 SQLite 数据库及其 WAL/SHM/journal 中删除数据；系统必须明确说明无法保证从外部备份、文件系统快照或 SSD 磨损均衡副本中物理抹除。
- 暂停观察不自动删除旧数据，删除由用户单独确认。
- 删除单条证据时，完全依赖它的未确认候选随之删除；已确认偏好是独立的用户授权记录，默认保留但来源变为无正文 tombstone，用户可同时选择撤销。
- 完全重置会停止 Runtime、删除数据库及 WAL/SHM，并清空无正文审计记录。
- 未确认的候选永远不能影响宿主行为。
- 第一阶段一个 bearer token 代表所有已认证本地客户端都受信任；宿主可见性用于防止误投影，不抵抗持有 token 的恶意本地进程。进入多用户或不可信插件场景前必须增加绑定宿主的 capability。

## 15. 错误处理

总原则：

> 聊天可继续，隐私默认关闭，个性化宁可暂时失效也不能错误生效。

行为：

- Observer 或模型失败：不产生候选，不影响聊天。
- LLM 返回非法 Schema：丢弃并记录原因。
- 重复事件：按 `sourceRef/turnId` 幂等去重。
- Runtime 不在线：宿主进入无个性化模式。
- 数据库异常：停止观察和写入，不读取不确定状态。
- Adapter 断开：显示断开，不无限缓存原始对话。
- Context 清除失败：显示潜在残留并停止继续注入；AIRI 的 blank tombstone 必须明确标记为兼容性降级，而不是成功删除 bucket。
- 无法解析冲突：不应用冲突项，交由用户处理。

## 16. 测试与评测

### 16.1 Core 单元测试

- 候选生命周期。
- 确认、拒绝、撤销和替换。
- 作用域优先级。
- 冲突时不应用。
- 跨宿主隐私投影。
- 幂等去重。
- 未确认候选不能进入 Effective Profile。

### 16.2 Adapter 契约测试

- AIRI 和参考聊天端转换为同一种 Evidence。
- 同一 Effective Profile 产生语义一致的 Guidance。
- Adapter 不传递 system prompt、完整历史或未授权字段。
- 关闭应用后已确认 Guidance 能在下一轮被验证为不存在；AIRI 当前仍可能保留空 source-bucket 行，不能宣称 bucket 已删除。

### 16.3 集成测试

```text
收到对话
→ 生成候选
→ 用户确认
→ 下一轮获得 Guidance
→ Runtime 重启后状态保持
→ 撤销后停止应用
```

### 16.4 效果评测

在同一组多轮场景中比较：

- 无个性化。
- 完整历史。
- 普通 Memory/RAG。
- 用户手工 Profile。
- Preference Engine。

场景覆盖：

- 显式偏好。
- 多次隐式反馈。
- 一次性情绪而非长期偏好。
- 偏好变化。
- 不同场景中的相反偏好。
- 信息不足时放弃推断。
- 工作内容不能泄漏到敏感领域。

初始质量门槛：

- 候选准确率约 80% 以上。
- 冲突和偏好变化处理约 85% 以上。
- 确定性的权限、作用域和未确认不生效测试 100% 通过。
- 确定性规则层跨领域错误应用为零。
- 人类盲评中明显优于普通 Memory/RAG。
- 8–12 名目标用户中候选接受率约 60% 以上。
- 平均确认负担不高于约每 20 轮一次。

这些数值是第一轮实验门槛，不代表已经获得科学验证。

## 17. Go / No-Go

继续推进的条件：

- Preference Engine 明显优于最强 Memory/RAG 基线。
- 用户理解候选含义并能有效纠正错误。
- 同一 Core 原样接入 AIRI 与第二个真实宿主。
- 第二个 Adapter 不要求重写核心领域模型。
- 自动观察与跨宿主投影没有造成不可接受的隐私不适。

停止或收缩条件：

- 普通 Memory/RAG 达到相同体验。
- 用户只接受手工设置，不接受自动候选。
- 第二宿主迫使 Core 引入大量宿主特有概念。
- 无法避免工作与私人场景互相污染。
- AIRI 无法提供安全、带作用域、可撤销的接入点。

失败时，项目收缩为 Explicit Companion Profile 或 AIRI 的偏好数据契约，不继续扩建为大型平台。

## 18. 首个里程碑

首个里程碑是一个可用的垂直切片：

> 同一本地 Core 在参考聊天端和 AIRI 中完成“对话 → 候选 → 用户确认 → 下一轮行为变化”，并通过普通 Memory/RAG 基线比较。

建议的交付顺序：

1. 固定协议、Schema Pack、评测数据和基线。
2. 实现 Preference Core 与确定性测试。
3. 实现 Local Runtime、Profile Store 和 Inspector。
4. 接入参考聊天端，闭合完整体验。
5. 接入 AIRI Sidecar，验证真实宿主。
6. 提交最窄 AIRI Feature Request。
7. 增加 MCP 查询和受治理的候选提议接口；直接确认仍留在 Inspector 等可证明人工动作的通道。
8. 根据 Go/No-Go 决定是否进入身份、关系、反思和主动性阶段。

## 19. 长期演进原则

- Preference Core 始终只管理用户授权的交互偏好。
- Companion Identity 不被用户偏好或 Observer 自动改写。
- Relationship 不简化为亲密度数值，也不塞入 Preference Schema。
- Memory 由独立 Provider 管理，Preference 只保存必要证据引用。
- Reflection 只能向各领域模块提交 Proposal，不能直接修改状态。
- Proactivity 需要全局节流、安静时段、去重和宿主能力选择。
- Embodiment 只消费语义 Guidance，并映射为文字、声音、表情或动作。
- 跨宿主一致性必须同时包含隐私投影，而不是复制同一段 Prompt。
- 每项新能力都需独立验证，不能因为长期愿景而提前建设空平台。

## 20. 设计结论

本项目采用以下定位：

> Preference Core 是第一块可验证、可复用、用户可控的领域核心；完整 Companion System 将来由多个边界清晰的领域模块组合而成。

这既保留了跨 AIRI、编码 Agent、聊天产品和机器人载体的长期愿景，也让第一阶段可以通过真实用户、第二宿主和 Memory/RAG 基线被证伪。
