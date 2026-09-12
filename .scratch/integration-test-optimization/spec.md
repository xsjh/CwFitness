# 集成测试优化

依据 ADR-0004，将集成验证拆成「快速验证（日常门槛）」与「完整回归（合并与监控）」两条路径，按变更范围自动选测而非全量跑，目标是不再让选择器遗漏降低质量保证，也不再让日常 PR 等到 25 分钟。

## Problem Statement

现在 `npm test` 一律跑完整集成：Prisma 启 Postgres、`next dev` 启服务器、`tests/plans-api.test.mjs` 走真实 HTTP、Playwright 跑 Chromium/Firefox/WebKit 三套。一次冷启动远超十分钟，导致：

- 每次改一行都要等 20+ 分钟，得不到反馈。开发者要么跳过、要么养成不跑测试的习惯，要么攒批改——这三者都让测试覆盖率名存实亡。
- 改动确实只动到一处（例如只改 `lib/email.ts`），但仍要拉起 Postgres、服务器和三个浏览器引擎。选择器不存在，分摊式慢也没有意义。
- 把超时拉长并不能提升信心：选择器和测试基础设施的变化本应触发完整回归，但现状是无差别全跑，无法区分「快速失败」和「真正可疑」。
- 没有按阶段（数据库启动、迁移、HTTP、各浏览器项目、清理）看耗时，超标时只能猜。

肠胃遇到的问题：日常交付被全量套件拖慢，又不敢真的去精简——怕漏选路径时质量塌方。

## Solution

引入按「变更路径」选择测试组的运行器，让 `npm test` 默认只跑「核心健康检查 + 命中变更路径的测试组」，`npm run test:full` 跑全部集成。路径到测试组的关系由一份**单一、可审查、声明式清单**集中维护；任何无法可靠归类的改动（测试基础设施、依赖、CI 配置、Prisma schema、迁移）一律升级为完整回归——这是用「偶尔慢」换「不会因选择器遗漏而漏测」。

时间预算先以「阶段耗时可见信号」形式呈现，连续两周稳定后再升级为 CI 硬门禁；完整回归先做「本地可重复」再下沉到合并前与夜间监控；选择性 + 复用服务仍超预算时，才考虑「严格隔离后的 Chromium 并行化」。

## User Stories

1. 作为维护者，我想运行 `npm test` 时得到一个 10 分钟以内的反馈，知道自己的改动至少通过核心健康检查与命中路径的测试组，以便我可以继续做下一件事。
2. 作为维护者，我想让运行器自动根据我改动的文件挑出要跑的测试组，而不是我手工指定，以便选择器遗漏被设计为不可能。
3. 作为维护者，我想在改动了无法可靠归类的区域时（依赖、`tests/`、`scripts/test-integration.mjs`、`playwright.config.ts`、`vitest.config.ts`、`prisma/schema.prisma`、任何迁移）自动跑完整回归，以便测试基础设施退化时不会带着静默的伪绿进 main。
4. 作为维护者，我想看到阶段耗时（数据库启动、迁移、HTTP 套件、Chromium/Firefox/WebKit、清理），知道哪一段在拖后腿，以便超预算时知道先优化哪里，而不是只看一个总时长。
5. 作为 CI，我想在每个 PR 上跑快速验证、在合并前与夜间跑完整回归，以便快速反馈与高质量门禁各自占据最适合的位置。
6. 作为新加入的维护者，我想通过「一份声明式清单」理解每条路径对应哪一组测试，而不是去读完所有 spec 文件才搞清楚选择器逻辑，以便改动能就地更新清单而不是偷偷漏掉。
7. 作为长期维护者，我想把 10 分钟 / 25 分钟这两个数字设为 CI 硬门禁而不是建议，但我希望先有两周的可见信号再硬卡，以便硬卡能基于真实数据而不是猜测。
8. 作为维护者，我想完整回归可以本地重复跑（同一个 `npm run test:full` 命令不止在 CI 能用），以便失败可以先在本地复现再修。
9. 作为维护者，我想选择性执行 + 复用服务器 / 数据库仍是首选优化路径；只有当它仍然超预算时，再去考虑严格隔离的 Chromium 并行化，以便不被过早优化分散注意力。

## Implementation Decisions

### 测试分层与入口

仓库现有三层测试是默认骨架，本规格不重设它们：

- **Vitest 单元层**：`tests/**/*.test.ts(x)`、`tests/setup.ts`、`vitest.config.ts`。在 `npm test` 与 `npm run test:full` 中保持一致运行。
- **HTTP 集成层**：`tests/plans-api.test.mjs`（Node `node:test`），跑真实 `next dev` + 真实 Postgres。
- **浏览器层**：`tests/browser/*.spec.ts`，Playwright 三个 projects（`chromium`、`firefox`、`webkit`），`firefox`/`webkit` 仅 grep `@cross-browser`。

新加的脚本 `scripts/test-selector.mjs` 实现路径选择 + 调度，与现有 `scripts/test-integration.mjs` 并存而非改写：

- `npm test`：
  1. `vitest run`
  2. 由 `scripts/test-selector.mjs fast` 拉起 `next dev` + Postgres，**只跑 HTTP 套件的核心健康检查子集** + 当前变更路径命中的测试组。
- `npm run test:full`：
  1. `vitest run`
  2. 调 `scripts/test-selector.mjs full`，等价于今天的 `scripts/test-integration.mjs`，但阶段耗时上报。

### 选择器（最高单一新增接缝）

新增一份「声明式清单」`tests/selectors/path-groups.json`（或等价 `.ts` 形式），结构示意：

```jsonc
{
  "groups": {
    "auth":          { "match": ["lib/auth.ts", "app/api/auth/**", "tests/browser/account-smoke.spec.ts"] },
    "plans":         { "match": ["lib/plans/**", "app/api/plans/**", "tests/plans-api.test.mjs"] },
    "sessions":      { "match": ["lib/workout-sessions.ts", "app/api/sessions/**", "tests/browser/workout-session.spec.ts"] },
    "progress":      { "match": ["lib/progress/**", "app/api/progress/**", "tests/browser/progress-view.spec.ts"] },
    "browser-core":  { "match": ["tests/browser/**"], "always": true },
    "@cross-browser":{ "match": ["tests/browser/cross-browser.spec.ts"], "engines": ["firefox", "webkit"] }
  },
  "escalate-full": [
    "package.json", "package-lock.json",
    "scripts/test-integration.mjs", "scripts/test-selector.mjs",
    "vitest.config.ts", "playwright.config.ts", "tests/setup.ts", "tests/helpers/**",
    "prisma/**", "next.config.ts"
  ]
}
```

选择算法（默认 base = `HEAD~1`，可通过 `TEST_BASE` 覆盖）：

```
changed = git diff --name-only --diff-filter=ACMRT $base
if any(path matches escalate-full glob): run full
else:
  groups = union of group names whose match glob intersects changed
  groups ∪ always-on groups (browser-core)
  run vitest + HTTP smoke + selected groups
```

选择器是这版唯一的「新增接缝」。所有阶段耗时、调用方法、健康检查集都在脚本内部聚合，不再扩散到 `package.json` 之外。

### 健康检查子集（默认核心）

`fast` 路径下，HTTP 套件不跑全集，只跑：

- 一个账号注册 + 登录回归（`account-smoke` 的子集）。
- `GET /api/plans` 未授权时返回 401。
- 数据库读路径：列出空计划 / 列出已有计划，确保 schema 迁移可用。

健康检查子集本身也是 selector 清单里的一个 group (`health-smoke`)，便于手工维护与扩展。

### 阶段耗时与可见信号

`scripts/test-selector.mjs` 在下列每个阶段开始与结束时打毫秒级时间戳并在 stdout 输出一段结构化汇总（每行一条，易于 grep）：

```
[selector] phase=db-start duration_ms=...
[selector] phase=migrate duration_ms=...
[selector] phase=server-boot duration_ms=...
[selector] phase=vitest duration_ms=...
[selector] phase=http-smoke duration_ms=...
[selector] phase=browser-chromium duration_ms=...
[selector] phase=browser-firefox duration_ms=...
[selector] phase=browser-webkit duration_ms=...
[selector] phase=teardown duration_ms=...
[selector] total duration_ms=... selected_groups=[...]
```

预算（目标是，不是一开始就硬卡）：

- `npm test`：10 分钟（核心健康检查 + 命中变更的组）。
- `npm run test:full`：25 分钟（HTTP 全集 + 三浏览器）。

两套预算**先在 PR 评论或本地输出里以警告形式呈现**，连续两周稳定后再作为 CI 硬门禁上线。

### 升级规则与边界

- 任何命中 `escalate-full` 任一 glob 的改动 → 强制 `full`，即使是「日常改动」。
- 任何不在明确 glob 中的路径，默认视为「通用安全」：只跑核心健康检查 + Vitest；浏览器层仅跑显式命中的组。
- 选择器解析失败（JSON 损坏、glob 不匹配、Playwright grep 错误）→ 退化为 `full`，并把退化的原因写进日志。
- `--force-full` 让维护者手动指定，等价于命中 `escalate-full`。
- CI 上：
  - 每个 PR：`npm test`（快速验证）。
  - 合并 `main` 前、夜间监控：`npm run test:full`。
  - 至少两周内，`test:full` 必须能在本地重复跑（不依赖 CI 专属缓存），失败先在本地复现再修。

### 不在本规格做的事

- 不引入跨机器、跨容器的分布式测试。
- 不修改 `lib/**` 与 `app/**` 任何领域逻辑。
- 不在浏览器层强行并行；只有在「选择性 + 复用服务」两条优化路径都已落地、但 `full` 仍超 25 分钟的前提下，才进入下一轮调研。
- 不重写 `tests/plans-api.test.mjs`；它仍是 HTTP 套件的承载者，只是在 `fast` 路径下只跑其健康检查子集。

## Testing Decisions

**判断测试好坏的标准**：只验证外部可观察行为（HTTP 状态、关键路径返回 JSON、浏览器侧可访问元素、Playwright 端到端断言）；不依赖模块私有实现、不依赖具体的 Prisma client 调用次数、不断言 `lib/*` 内部状态。

**选择器自身的测试**（新文件 `tests/test-selector.test.mjs` 或同等的 Vitest 单元）：

- 给定一份固定 fixture 改动列表 → 期望返回正确的 group 集合（含 `always`）。
- 命中 `escalate-full` 任一 glob → 期望返回 full。
- 空改动（base == HEAD）→ 期望返回 health-smoke + browser-core。
- 选择器 JSON 损坏 → 期望返回 full 并打退化原因。
- `--force-full` → 期望返回 full。

**接缝的优先**：HTTP 集成层之上复用现有接缝（`tests/plans-api.test.mjs`、`tests/browser/**`、Vitest），不改领域层、不改 Prisma 模型。**单一新增接缝**：`tests/selectors/path-groups.json`（或 `.ts`）与 `scripts/test-selector.mjs`。

**Prior art**：

- ADR-0001（server-authoritative-sync）的「回归按路径选测」是同一思路的雏形，本规格是它的实现版。
- `tests/plans-api.test.mjs` 已经是「真实 next dev + 真实 Postgres」的 HTTP 集成套件；保留。
- `tests/browser/cross-browser.spec.ts` 用 `@cross-browser` tag 已经体现了「按 tag 跑特定浏览器」的过滤思想；selector 直接复用同样的 tag 机制。

## Out of Scope

- 分布式测试或容器化并行。
- 浏览器严格隔离（每 spec 各自启 dev server）；仅在选择器 + 服务复用未达预算时下一轮考虑。
- 自动修复或自动跳过失败用例的策略。
- 把 Vitest 单元层挪出 `fast` 路径（它本就秒级，没必要进一步分层）。
- 改造 `lib/*` 或 `app/*` 任何领域逻辑以迁就测试。
- 把 Playwright 三个 projects 的 schema 改写为 `@cross-browser` 之外的其他结构。

## Further Notes

- 对应 ADR：`docs/adr/0004-integration-test-optimization.md`。本规格不重写 ADR，只把它落到代码层的单一接缝上。
- 落地的实现工单放在 `.scratch/integration-test-optimization/issues/` 下，子工单准备好后挂 `ready-for-agent`。
- 仓库约定提示（避免踩坑）：
  - 提交前看 `git status`，不要 `git add -A`；本规格涉及多个新文件，每一个都要单独 commit。
  - Bash 工具里 `npm run` 会挂，用 `node scripts/test-selector.mjs` 直接跑底层；本仓库 CI 在 PowerShell 用 `npm.cmd`，本地可任意。
  - 测试报告统一写到 `docs/testing-reports/<YYYY-MM-DD>-<主题>.md`，本规格实施期间产生的报告也走这个路径。
- 用户/模型身份：本规格默认视角是「肠胃」指代的用户；执行时由具体维护者接手。
