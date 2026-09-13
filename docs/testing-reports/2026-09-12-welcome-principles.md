# 欢迎页产品原则卡片单元测试 — 2026-09-12

**命令：** `node node_modules/vitest/vitest.mjs run --coverage`
**结果：** 通过 49，失败 0

| 目标 | 用例数 | 通过 | 失败 |
| --- | --- | --- | --- |
| `app/welcome-experience.tsx` | 13 | 13 | 0 |

## 已覆盖

- 欢迎页将五条产品原则渲染为两轮、共十张连续液体卡片。
- 产品原则轨道带有独立的滚动进场观察点，不影响 Workout Plan、Workout Session 与 Plan Progress 的既有动效。
- 真实浏览器验证轨道使用线性 marquee，并确认指针悬停时单张卡片轻微放大。

## 未覆盖

- CSS 动画的主观张力、不同屏幕尺寸下的视觉节奏与触摸设备上的手感需要人工视觉检查；自动化测试已验证动画配置和悬停后的渲染矩阵。

## 覆盖率

| 文件 | 行 | 分支 |
| --- | --- | --- |
| `app/welcome-experience.tsx` | 98.80% | 84.84% |
