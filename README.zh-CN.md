# Companion Preference Engine

面向陪伴智能体的本地优先、宿主无关偏好治理引擎。

[English README](README.md) · [Apache-2.0](LICENSE) · [贡献指南](CONTRIBUTING.md) · [安全策略](SECURITY.md)

> **开发预览版 — M0.5 检查点已通过**
>
> 本仓库是实验性的核心库，不是聊天产品；目前还没有 runtime 进程、UI、
> MCP 服务、HTTP 服务、SQLite 后端或 AIRI adapter。

## 为什么做它

对话记忆回答的是“应该保留哪些事实或事件”。陪伴还需要回答“在当前上下文
里，应该如何陪伴这个用户”。本项目把这个决策从具体 LLM 和宿主中拆出来：

```text
宿主证据 / 用户明确输入
          │
          ▼
     候选 + 来源
          │  用户确认 / 拒绝 / 抑制
          ▼
     受治理的生效偏好
          │
          ▼
  作用域解析 + 解释 + 投影状态
```

引擎默认保守：连接设置默认拒绝；写操作带 revision fence 且可幂等重放；审计
和 mutation receipt 不包含内容；删除证据时会清理引用并生成 tombstone。

## 已实现内容

- 基于 Valibot 的严格宿主无关 contracts：身份、偏好、审计、HTTP envelope
  和 MCP 来源元数据。
- 候选生命周期：提议、确认、拒绝、删除、抑制、修改、撤销，以及用户显式
  设置偏好。
- 支持 host、domain、workspace、global 的作用域偏好解析，提供确定性排序
  和解释结果。
- 内存仓储参考实现：返回值隔离、action replay、类型化 revision/slot 冲突、
  严格审计事件和分阶段回滚。
- 本地连接设置、adapter 投影真相、无内容策略审计、证据 tombstone、候选
  引用清理，以及可选的依赖偏好撤销。
- 一个确定性的合成终端演练：展示候选确认、按作用域生效和撤销。它是交互
  检查点，不是模型能力或聊天体验。

当前实现是可嵌入的基础层，不是完成的陪伴 agent。

## 快速开始

依赖：

- Node.js 24.19.0（见 `.node-version`）
- pnpm 10.34.5

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run build
```

`pnpm run check` 会运行全部 Vitest、所有 workspace 的类型检查和
`git diff --check`。当前没有 `pnpm dev`，因为 runtime 和 UI package 尚未实现。

本地重放 M0.5 终端演练：

```bash
pnpm --filter @companion-preference/m0-terminal demo
```

它只使用合成数据、Fake Observer、内存状态和固定模板。请先阅读已记录的
[M0.5 检查点](docs/m0p5-experience-checkpoint.md)，不要将它视为真实产品或模型
效果证据。

## Package 结构

```text
packages/contracts      公共 schemas、类型和确定性 fixtures
packages/preference-core
  lifecycle             候选/偏好状态迁移
  resolver              作用域与 authority 解析
  explain               可读的解析解释
  repository            宿主无关仓储 port 与错误
  in-memory-repository  本地参考实现
packages/observer       Fake Observer 与宿主无关的 Observer port
evals                   合成评测数据、基线与指标
apps/m0-terminal        确定性的 M0.5 交互演练
docs/plans              设计、实现、路由和预览计划
```

两个 package 当前都是 private workspace package。公开预览以源码为主；在
runtime 和持久化契约稳定之前，暂不发布 npm。

## 隐私与安全边界

- 核心不会发起网络请求，也不包含宿主集成。
- 连接策略默认拒绝：观察、学习、应用三项都必须显式开启。
- 审计、mutation receipt、策略决策和删除 tombstone 不保存对话文本、偏好
  value、projection 或请求 payload。
- 证据只存在进程内，删除前可能包含原始内容；导出的 snapshot 必须按敏感
  数据处理。
- 删除会移除 live evidence、生成无内容 tombstone、删除仅依赖该证据的 pending
  candidate、清理保留引用，并可在显式请求时撤销依赖它的生效偏好。

这些是当前预览的实现和测试边界，不代表未来 adapter 会自动安全。接入前请读
[SECURITY.md](SECURITY.md)。

## 验证

开发预览由以下命令门禁：

```bash
pnpm run check
pnpm run build
```

GitHub Actions 会在 push 和 pull request 上重复执行这两个命令。测试覆盖
contracts、生命周期、作用域解析、解释、仓储原子行为和隐私/删除不变量。

## 路线图

M0.5 交互检查点已经通过。后续层次会与核心分开推进：

1. 带明确 snapshot/migration 语义的本地 runtime 和持久化 adapter。
2. 第一个接入 AIRI 的宿主 adapter，再扩展到其他陪伴宿主。
3. 用于查看生效偏好、来源、抑制、删除和投影真相的 inspector。
4. 复用同一 contracts 和隐私门禁的可选 MCP/HTTP adapter。

这些层目前都没有实现。设计和验收标准见 [`docs/plans/`](docs/plans/)。

## 贡献

提交 issue 或 pull request 前请阅读[贡献指南](CONTRIBUTING.md)。安全问题请按
[安全策略](SECURITY.md)处理，不要公开发 issue。

## License

本项目使用 [Apache License 2.0](LICENSE)。
