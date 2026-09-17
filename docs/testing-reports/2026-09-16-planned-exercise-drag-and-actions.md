# 已安排动作卡片：拖拽排序与右上角操作区测试报告

日期：2026-09-16

## 覆盖范围

- **拖拽排序**：已安排动作卡片可拖拽换位；卡片全程跟随鼠标，其它卡片实时避让出空位。
- **操作区收拢**：✎（编辑目标）与「移除」合入卡片右上角的 `.card-actions` 集群；`sortMode` 下的 ↑↓ 排序箭头仍留在卡片下部的 `.ex-actions`。
- **拖拽态反馈**：拖动中的卡片浮起（阴影 + 轻微降透明度 + 提高层级），落点处相邻卡片滑动让位。
- **内部控件保护**：从卡片内的输入框、按钮、`summary`/`details` 上按下的手势不劫持卡片拖动。

## 实现要点

用**手动指针拖拽**取代了 HTML5 原生 `drag`。原生的拖拽幽灵图由浏览器绘制、按系统光标频率刷新，
既做不到「卡片吸在鼠标上」，其 `dragover` / `dragleave` 的疏密与抖动也没法驱动实时的避让动画。

- 按下后把卡片提升为 `position` 层（`z-index:40` + 阴影），位移只用 `transform`，列表永不重排，
  相邻卡片的几何因此在整段手势里保持可测。
- 命中判定读 DOM 顺序而非 React state：`source.ts().remove()` → `insertBefore()` 后，DOM 顺序就是屏幕上的排列，
  所以每次都重新测量、按最新顺序判定落点。
- 落点是**边界**而不是卡片：`dropSlotFor()` 按指针到各卡片中线的距离取最近者，得到「第 i 张与第 i+1 张之间」这样的边界；
  被拖动的卡片本身从搜索中排除，否则它会永远赢过指针真正想去的槽位。
- 相邻卡片的避让：记住移动前的 rect，插入后重测得新 rect，把差值写成 `transform`，
  由 160ms 的 `--ease` 过渡把「让位」滑出来。

## 验证结果

- 组件层 `npx vitest run`：**14 个测试文件、108 项测试全部通过**
  （`tests/plan-editor.test.tsx` 13 项，含 3 项拖拽测试）。
  `tests/plan-editor.test.tsx` 的 `data-testid="planned-row"` 契约未变。
- 类型与静态检查：`npx tsc --noEmit` 无输出；`npx eslint app/plan-editor.tsx tests/plan-editor.test.tsx` 无 error 无 warning。
- 浏览器实测（Chromium，真实 dev server，1440×1000），一次真实鼠标拖拽：
  - **跟随鼠标**：指针 `x=503`，被拖卡片 `left=463`，抓取时相对左上角的 40px 偏移全程保持（`grabOffsetPreserved=yes`）。
  - **卡片在指针下**：`cardUnderPointer` 返回 `{name:"卧推", dragging:"true"}` —— 指针下的正是被拖动的那张。
  - **顺序真的变了**：`["杠铃深蹲","卧推","硬拉","引体向上"]` → `["卧推","杠铃深蹲","硬拉","引体向上"]`。
  - **已落库**：刷新后 `reloaded` 与实际顺序一致。
  - 中间态截图（`.scratch/float-midway.png`）可见「卧推」浮起跟随、原槽位由「杠铃深蹲」向右滑入。
  - `console_errors=0`。
- CSS 语法自检：空选择器 / 双逗号 / 逗号接右括号 / 行首裸组合符均为 0，花括号 **855/855** 配平。

## 改动范围

- `app/plan-editor.tsx`：
  - 新增 `plannedCards()`（按 DOM 顺序取卡片）、`moveSiblings()`（把让位写成 transform）、
    `dropSlotFor()`（指针位置 → 落点边界）三个模块级函数；删除已被取代的 `reordered()`。
  - `drag` state（`{id, committed}`）替代原先的 `draggingPlannedId` / `dropTargetId`；
    新增 `pointerAt` 与 `reorderTarget` 两个 ref。
  - `beginPlannedDrag()` 处理按下；一个 `useEffect` 承载整段手势的 document 级
    `pointermove` / `pointerup` / `pointercancel` / `Escape` 监听。
  - 移除 `<article>` 上的 `draggable` 与 `onDragStart/Over/Leave/Drop/End`，改为 `onPointerDown`；
    新增 `data-planned-id` 供命中判定使用；补回被误删的 `key={planned.id}`。
  - 拆出 `.card-actions` 容器并把移除键移入，删除原先 `.ex-top` 包裹层。
- `app/globals.css`：`.exercise` 加 `position:relative`、`cursor:grab`、`touch-action:none`、`cursor:grabbing`；
  `body.is-dragging-card` 的抓取光标与禁选中；`[data-dragging]` 改为浮起样式
  （阴影 + `.92` 透明度 + `z-index:40` + `will-change:transform`，去掉旧的 `.45`）；
  **删除** `[data-drop-target]` 描边规则（避让动画已取代高亮）；
  新增 `.card-actions` 绝对定位规则；`.remove-planned` 去掉自身绝对定位；`h4` 的 `padding-right` 58px → 86px；
  新增 `.ex-actions:empty{display:none}`（非 sortMode 下不占位）。
- `tests/plan-editor.test.tsx`：`stubCardLayout()` 给出十字网格几何（jsdom 的 rect 全是 0），
  `dragCard()` / `pointerMove()` 驱动 press → move → release；3 项拖拽测试。

## 未覆盖 / 已知事项

- **触屏未实测**：`touch-action:none` 已禁用卡片上的浏览器默认手势，但只在鼠标指针下验证过。
- **键盘排序**：拖拽仅指针可用；`sortMode` 下的 ↑↓ 按钮仍是键盘与无障碍路径。
- **「原地小抖动」测试偏弱**：卡片间距远大于任何有意义的抖动幅度，所以小位移必然落在原槽位边界上，
  该行为由 `dropSlotFor()` 的中线判定保证，测试无法与它解耦地单独验证；已保留断言但其保护价值有限。
- `tests/browser/welcome-experience.spec.ts` 的欢迎页渐显断言失败与本改动无关
  （该 spec 与 `app/welcome-experience.tsx` 本次均未触碰），未纳入本次修复范围。
