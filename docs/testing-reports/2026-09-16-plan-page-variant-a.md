# 计划页重做（变体 A）测试报告

日期：2026-09-16

## 覆盖范围

- 计划页两列布局（左「计划」栏 + 右当前计划详情）与训练日 chip 条。
- 每个计划独立记忆上次选中的训练日，不再每次都退回第一个。
- 训练日与已安排动作的排序：箭头藏在「调整顺序」开关之后，排序提交完整 id 列表并带版本号。
- 行内修改计划名称（不弹独立对话框）。
- 删除训练日 / 已安排动作改用自研确认浮层，替掉 `window.confirm`。
- 收起的进度 recap：默认折叠，展开后才显示最近记录与进阶建议。
- 归档托盘：归档计划、恢复计划、归档态下「开始训练」给出阻止原因而不是灰按钮。
- 主题色（accentColor）与封面（coverKey）功能端到端删除。

## 验证结果

- 单元层 `npx vitest run`：14 个测试文件、105 项测试全部通过。
- 单元层新增 `tests/plan-editor.test.tsx`：10 项测试，覆盖训练日记忆、排序箭头、自研确认浮层、
  归档阻止文案、搜索选动作、recap 折叠、行内改名。
- API 层 `node --test tests/plans-api.test.mjs`：29 项全部通过，其中新增 2 项：
  视觉字段不再被读写 / 只带视觉字段的 PATCH 返回 400、已安排动作排序带版本且拒绝过期重放（409）。
- 浏览器层计划页流程（Chromium）：8 项全部通过，覆盖
  `workout-session.spec.ts`、`account-smoke.spec.ts`、`backup-privacy.spec.ts`。
- `npx tsc --noEmit`：通过。
- `npx eslint .`：0 error（13 个既有 warning，均为 `<img>` 与 `.scratch` 临时脚本噪音）。

## 说明

- 全量浏览器套件（52 项）未完整跑完：`welcome-experience.spec.ts` 存在一个既有失败
  （`.welcome-image-break` 的图片渐显动画断言），该 spec 与 `app/welcome-experience.tsx` 均未在本次改动中触碰，
  与计划页无关联，未纳入本次交付范围。
