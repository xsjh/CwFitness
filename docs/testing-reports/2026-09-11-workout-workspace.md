# app/workout-workspace.tsx 单元测试 — 2026-09-11

**命令：** `npx vitest run`
**结果：** 通过 3，失败 0（1 个测试文件）

| 目标 | 用例数 | 通过 | 失败 |
| --- | --- | --- | --- |
| `app/workout-workspace.tsx` | 3 | 3 | 0 |

## 已覆盖

- 后台刷新收到 `401 Unauthorized` 时把鉴权丢失的回调抛出去，调用方拿到信号后再走登录。
- 加载保护资源时按 plans → exercises → active session → sessions → settings → backup → privacy 的顺序串行请求，plans 还在路上时不会并发发出后面的请求。
- 用户点击「开始训练」、`/api/workout-sessions` 成功返回新 Session 之后，紧接着的 `/api/plans` 即使 500，UI 也照样进入训练视图并把「记录完成」按钮渲染成可点击 —— 这是 commit `3711f87` 修的回归点。

## 未覆盖

- `WorkoutWorkspace` 大部分渲染分支（计划列表、训练视图、历史视图、设置页、隐私页等）—— 它们是组件层 + Playwright 集成层一起兜的领域，单测里只走 mock fetch 的最小路径。
- IndexedDB 持久化与离线队列 —— 由 `tests/browser/offline-sync.spec.ts` 在真实 Chromium 里跑，不属于单测范围。
- 训练计时器、节流心跳、编辑设备抢占 —— 跨多个 effect，单测里 stub fetch 没法真实驱动；属于集成层。

## 覆盖率

| 文件 | 行 | 分支 | 函数 | 语句 |
| --- | --- | --- | --- | --- |
| `app/workout-workspace.tsx` | 35.49% | 31.51% | 24.56% | 40.8% |

本次运行后的整体单测覆盖率：`lib/` 与 `app/` 合计行覆盖 15.96%。`app/api/` 由 HTTP 集成套件覆盖，不计入该数字。
