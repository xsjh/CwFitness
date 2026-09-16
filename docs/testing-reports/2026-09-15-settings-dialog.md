# 头像设置弹窗测试报告

日期：2026-09-15

## 覆盖范围

- 主导航不再显示“设置”，设置入口移动到头像二级菜单。
- 点击“偏好设置”后打开设置弹窗，并保留设置保存、隐私、备份恢复和删除用户能力。
- 弹窗支持关闭按钮、点击遮罩与 `Escape` 键关闭；关闭后焦点回到头像菜单入口。
- 桌面与移动视口下，设置弹窗及其控件不超出视口且不互相重叠。

## 验证结果

- `node node_modules/vitest/vitest.mjs run --coverage`：13 个测试文件、94 项测试全部通过。
- `node scripts/test-integration.mjs`：27 项 API 集成测试、52 项 Playwright 浏览器测试全部通过。
- `node node_modules/typescript/bin/tsc --noEmit`：通过。
- ESLint（本次涉及的 TypeScript/TSX 文件）：通过。
- `node node_modules/next/dist/bin/next build`：生产构建通过，15 个页面生成成功。

## 覆盖率

- Statements：29.57%（698/2360）
- Branches：21.74%（393/1807）
- Functions：28.29%（161/569）
- Lines：33.53%（617/1840）
