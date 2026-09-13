# 欢迎页原则飘带单元测试 — 2026-09-13

**命令：** `npx vitest run`
**结果：** 通过 52，失败 0

| 目标 | 用例数 | 通过 | 失败 |
| --- | --- | --- | --- |
| `app/welcome-experience.tsx` | 16 | 16 | 0 |

## 已覆盖

- 原则区渲染三段无缝重复内容，并显式区分左右移动方向。
- 飘带文案仅使用 CwFitness 已有的 Workout Plan、Workout Day、Workout Session、Exercise 与 Plan Progress 词汇。
- 原则区同时覆盖视口上下边缘时显示飘带，离开该范围时隐藏飘带。
- 向左和向右的滚动变换均保持在一个内容段内，向右移动不会暴露左侧空白。
- 组件卸载时清除飘带的行内变换与可见性状态。

## 未覆盖

- 不同浏览器中的实际视觉连续性与固定定位效果 — 由 `tests/browser/welcome-experience.spec.ts` 覆盖。
- `prefers-reduced-motion` 下的最终 CSS 合成效果 — 需要真实浏览器计算样式。

## 覆盖率

| 文件 | 行 | 分支 |
| --- | --- | --- |
| `app/welcome-experience.tsx` | 65.27% | 48.05% |

全项目 V8 覆盖率为：语句 26.84%、分支 19.84%、函数 24.72%、行 30.54%。`app/api/` 主要由 HTTP 集成测试覆盖，因此这里的全项目数字仅代表 Vitest 可见的覆盖下限。
