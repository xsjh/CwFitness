# 已安排动作卡片：拖拽排序、网格吸附与让位测试报告

日期：2026-09-16

## 覆盖范围

- **拖拽排序**：已安排动作卡片可拖拽换位；拖动中的卡片吸附到网格。
- **网格可见性**：网格只在拖动期间显示（`data-dragging-grid`），松手即清除。
- **吸附到格点**：卡片跟随指针，但落点量化到最近格点，不会停在两格之间。
- **邻卡让位**：被拖卡片进入某个格子时，占着该格的卡片让到被拖卡片原来的格子里，
  两者交换 DOM 位置；其余卡片只需位移一次。
- **顺序按网格排列**：松手时直接读 DOM 顺序提交，因此提交的顺序就是屏幕上的排列。
- **操作区收拢**：✎（编辑目标）与「移除」合入卡片右上角的 `.card-actions`。
- **内部控件保护**：从卡片内的输入框、按钮、`summary`/`details` 上按下的手势不劫持拖动。

## 实现要点

用**手动指针拖拽**取代 HTML5 原生 `drag`。原生的拖拽幽灵图由浏览器绘制、按系统光标频率刷新，
既做不到「卡片吸在鼠标上」，其 `dragover` / `dragleave` 的疏密与抖动也没法驱动实时的避让。

用**格子（cell）语义**取代了原先的**边界（boundary）语义**：

- `readLattice()` 从卡片的静止 rect 推出格子中心线 `columns[]` / `rows[]` 与两个方向的步长
  `columnStep` / `rowStep`。两个步长分开推导，因为一个格子「宽 = 卡片宽 + 间距」「高 = 卡片高 + 间距」，
  而卡片宽高不等。
- `readOrigins()` 把每张卡片映射成 `{left, top, column, row}`，即它在格子坐标里的位置。
- `snapToGrid()` 把被拖卡片的落点量化到**最近格点**。**关键：量化以第一个格子为原点，不是以 0 为原点。**
- `coveredOrigin()` 找出目标格子上的卡片，两者**交换 DOM 位置**。
- 每个手势只测一次几何：位移全程只用 `transform`，列表不重排，所以相邻卡片的 rect 在整段手势里保持可测。
- 网格画成 `background-image` 的多个 `linear-gradient` 层，而不是覆盖层元素——
  覆盖层要么吞掉指针，要么需要 `pointer-events:none`（无障碍套件会把它读成「只在 hover 显示」的控件）。

## 验证结果

- 组件层 `npx vitest run`：**14 个测试文件、112 项测试全部通过**
  （`tests/plan-editor.test.tsx` 17 项，含 6 项拖拽测试）。
- 类型与静态检查：`npx tsc --noEmit` 无输出；`npx eslint app/plan-editor.tsx tests/plan-editor.test.tsx` 无 error 无 warning。
- 浏览器实测（Chromium，真实 dev server，1440×950，4 张卡片）：
  - **网格只在拖动时可见**：`gridBefore=null` → 按住时 `gridDuringDrag=true` 且 `gridLayers=4`
    （4 层 = 4 个格子轮廓）→ 松手后 `gridAfter=null`、`backgroundAfter=none`。
  - **吸附精确落在格点**：静止列 `columns=[438,663,888,1113]`、`columnStep=225`；
    被拖卡片最终 `heldLeft=438`、`heldOnColumn=true`、`heldColumnDelta=0`；垂直方向 `heldTopDelta=2`（零漂移）。
  - **邻卡真的让位**：拖动中 `orderDuringDrag=["卧推","杠铃深蹲","硬拉","引体向上"]`，
    即「卧推」已进入第一格、「杠铃深蹲」让到第二格。
  - **顺序按网格落库**：松手后 `orderAfter` 与刷新后 `orderReloaded` 一致。
  - **无残留**：松手后 `leftoverTransforms` 与 `leftoverDragging` 全部为空。
  - 中间态截图 `.scratch/grid-midway.png` 可见四个格子轮廓、被拖卡片浮起跟随。
- CSS 语法自检：空选择器 / 双逗号 / 逗号接右括号 / 行首裸组合符均为 0，花括号配平。

## 本轮修掉的两个缺陷

### 1. 吸附用了错误的网格原点（本轮 bug 根因）

`snapToGrid` 最初写成 `Math.round(value / step) * step`，即**从 0 起算**。但列表有页面左边距，
真实格点是 `438 / 663 / 888 / 1113`，不是 225 的整数倍。于是：

- 指针在 `wanted.left=643` 时，`round(643/225)*225 = 675` —— 一个**从来没有卡片待过**的位置；
- 被拖卡片与邻卡之间「谁占哪个格」的判定同样在这个假格点上做，导致卡片在前半段完全不动、
  越过某个点后突然跳一格，且最终停在格点旁 12px 处。

修法：量化改为**以第一个格子为原点**（`round((value - base) / step) * step + base`，`base = columns[0]`）。

**这个 bug 之所以能躲过 112 项测试**：`tests/plan-editor.test.tsx` 的 `stubCardLayout()` 把格子放在
`index * STRIDE`，即格点恰好在 0 / 100 / 200 —— 恰好是「从 0 起算」和「从首格起算」两种算法结果一致的
唯一一种布局。已把 stub 的网格原点改成非零且非步长倍数（`GRID_ORIGIN = {left:38, top:17}`），
并新增测试 `lands the carried card on a real cell of the list, not on a multiple of the cell pitch`。
**该测试已用旧实现反验证：改回 `base = 0` 时它会失败（`Number of calls: 0`）。**

### 2. 卡片拖动时未跟随指针

`move` 里的 transform 重算原本只写一遍。交换格子后 `restLeft` / `restTop` 已更新为新格子，
但 transform 仍表达的是旧格子，卡片会「弹回」旧列直到指针再动一次。已抽出局部函数
`placeCarried(card, wanted)`，在交换后立即以同一个 `wanted` 复用一次。

## 改动范围

- `app/plan-editor.tsx`：
  - 新增模块级 `readLattice()` / `snapToGrid()` / `readOrigins()` / `coveredOrigin()` / `gridLayers()`
    与 `Lattice` / `DragOrigin` 类型；`GRID_STROKE` / `GRID_INSET` 两个常量。
  - `paintGrid()` / `clearGrid()` 两个 `useCallback`，由拖拽 effect 在按下与每次交换后调用。
  - 拖拽 effect 重写为「格子 + 交换」模型；新增局部函数 `slotBox()` / `slideInto()` / `placeCarried()`。
  - `drag` state 由 `{id, committed}` 改为 `{id, slot}`；新增 `listRef` / `gridShown`。
  - `.ex-list` 加 `ref={listRef}` 与 `data-dragging-grid`。
- `app/globals.css`：新增一条
  `.plan-view .exercise:not([data-dragging]){transition:...,transform 160ms var(--ease)}`，
  让邻卡让位能滑出来、被拖卡片自身不参与过渡。
- `tests/plan-editor.test.tsx`：`stubCardLayout()` 加入非零且非步长倍数的网格原点；
  新增 2 项测试（网格原点、拖动期间网格可见）。

## 未覆盖 / 已知事项

- **触屏未实测**：`touch-action:none` 已禁用卡片上的浏览器默认手势，但只在鼠标指针下验证过。
- **键盘排序**：拖拽仅指针可用；`sortMode` 下的 ↑↓ 按钮仍是键盘与无障碍路径。
- **`favicon.ico` 404**：浏览器自动请求站点图标，而项目未提供 icon 文件。
  实测 `favicon.ico` / `icon.png` / `apple-icon.png` / `favicon.png` 均 404。
  与本次改动无关，未纳入修复范围。
- **`tests/browser/welcome-experience.spec.ts` 的欢迎页渐显断言失败**为本轮之前既有，
  该 spec 与 `app/welcome-experience.tsx` 本次均未触碰，未纳入本次修复范围。
