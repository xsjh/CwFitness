# 已安排动作卡片：拖拽排序与右上角操作区测试报告

日期：2026-09-16

## 覆盖范围

- **拖拽排序**：已安排动作卡片可互相拖拽换位，落点沿目标卡片的槽位插入，其余卡片依次顺移。
- **操作区收拢**：✎（编辑目标）与「移除」合入卡片右上角的 `.card-actions` 集群；`sortMode` 下的 ↑↓ 排序箭头仍留在卡片下部的 `.ex-actions`。
- **拖拽态反馈**：拖动中的卡片降透明度，悬停的落点卡片换成强调色描边。
- **内部控件保护**：从卡片内的输入框、按钮、`summary`/`details` 上起手的拖拽不劫持卡片拖动。

## 验证结果

- 组件层 `npx vitest run`：**14 个测试文件、107 项测试全部通过**
  （新增 2 项：`reorders Planned Exercises by dragging one card onto another`、
  `does not start a drag from a control inside the card`）。
  `tests/plan-editor.test.tsx` 的 `data-testid="planned-row"` 契约未变。
- 类型与静态检查：`npx tsc --noEmit` 无输出；`npx eslint app/plan-editor.tsx` 无告警。
- 浏览器实测（Chromium，真实 dev server，1440×1000）：
  - 拖拽前 `["杠铃深蹲","卧推","硬拉","引体向上"]` → 拖拽后 `["引体向上","杠铃深蹲","卧推","硬拉"]`。
  - 刷新页面后顺序不变（`reloaded` 与 `after` 一致），说明写入已落库，而非仅本地重排。
  - 移除键位置：`inCard=true, rightGap=10, topGap=10` —— 位于卡片右上角内侧。
  - `console_errors=0`。
- CSS 语法自检：空选择器 / 双逗号 / 逗号接右括号 / 行首裸组合符均为 0，花括号 **855/855** 配平。

## 改动范围

- `app/plan-editor.tsx`：新增 `reordered()` 辅助函数、`draggingPlannedId` / `dropTargetId` 两个 state、
  `dropPlannedExercise()` / `endPlannedDrag()` 两个处理函数；`<article>` 加 `draggable` 与全套拖拽事件，
  新增 `data-dragging` / `data-drop-target` 属性；拆出 `.card-actions` 容器并把移除键移入，删除原先 `.ex-top` 包裹层。
- `app/globals.css`：`.exercise` 加 `position:relative` 与拖拽过渡、`cursor:grab/grabbing`、两个拖拽态规则；
  新增 `.card-actions` 绝对定位规则；`.remove-planned` 去掉自身绝对定位；`h4` 的 `padding-right` 58px → 86px；
  新增 `.ex-actions:empty{display:none}`（非 sortMode 下不占位）。
- `tests/plan-editor.test.tsx`：新增 2 项拖拽测试（jsdom 无 `DataTransfer`，用 `fireEvent` + 手搓替身）。

## 未覆盖 / 已知事项

- 拖拽态的视觉反馈（`data-dragging` 降透明度、`data-drop-target` 高亮）已确认 CSS 规则存在，
  但 Playwright 鼠标拖拽中截图时机偏早，未取到稳定的中间态截图，因此仅由规则存在性佐证。
- `tests/browser/welcome-experience.spec.ts` 的欢迎页渐显断言失败与本改动无关
  （该 spec 与 `app/welcome-experience.tsx` 本次均未触碰），未纳入本次修复范围。
