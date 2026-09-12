# 欢迎页滚动动效 单元测试 — 2026-09-12

**命令：** `.\\node_modules\\.bin\\vitest.cmd run` 与 `.\\node_modules\\.bin\\vitest.cmd run --coverage`
**结果：** 通过 41，失败 0

| 目标 | 用例数 | 通过 | 失败 |
| --- | --- | --- | --- |
| `app/welcome-experience.tsx` | 5 | 5 | 0 |

## 已覆盖

- 公共欢迎页为 User 保留了开始 Workout Plan 的注册入口和主导航。
- Workout Plan、Workout Session 与 Plan Progress 示意内容仍使用既有产品术语。
- Hero 不属于滚动动效目标；其下方的内容拥有不同的滚动动效语义。
- 页面在正常与强制动效场景下继续使用 Lenis 的滚动惯性配置。
- 所有下方滚动目标在触发前均保持 `filter: none` 和 `opacity: 1`，不会继承模糊或淡入入场；该断言也覆盖被强制动效的 `prefers-reduced-motion` 环境。

## 浏览器回归

**命令：** `node .\\node_modules\\@playwright\\test\\cli.js test welcome-experience.spec.ts --project=chromium`
**结果：** 通过 3，失败 0

## 未覆盖

- 浏览器中滚动经过每一个区块时的像素级过渡效果 — 这需要 Playwright 的真实视口与滚动验证。
- `prefers-reduced-motion` 下每种 CSS 过渡的视觉终态 — 单元测试只验证 DOM 行为，生产构建已通过。

## 覆盖率

| 文件 | 行 | 分支 |
| --- | --- | --- |
| `app/welcome-experience.tsx` | 92.85% | 53.57% |
