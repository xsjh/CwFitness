# 跨浏览器稳定化单元测试 — 2026-09-12

**命令：** `node .\\node_modules\\vitest\\vitest.mjs run --coverage`
**结果：** 通过 36，失败 0（9 个测试文件）

| 目标 | 用例数 | 通过 | 失败 |
| --- | --- | --- | --- |
| 既有 Vitest 单元层 | 36 | 36 | 0 |

## 已覆盖

- 现有单元层继续验证 Workout Session、离线队列、认证与工作区公共行为；本次跨浏览器改动位于 Playwright 配置和浏览器测试辅助层，须由完整浏览器套件验证。

## 未覆盖

- `tests/browser/helpers/layout.ts` 的视口与仅悬停控件检查 —— 它们直接读取真实浏览器布局和计算样式，Vitest 没有等价的浏览器引擎；由 Playwright Chromium、Firefox 和 WebKit 套件覆盖。

## 覆盖率

| 文件范围 | 行 | 分支 |
| --- | --- | --- |
| Vitest 全部文件 | 21.58% | 14.95% |

`app/api/` 的真实 HTTP 行为由集成套件覆盖，未计入上述 Vitest 覆盖率。
