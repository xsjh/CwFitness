# 沉浸式训练页面测试报告

日期：2026-09-15

## 覆盖范围

- 开始或继续训练后隐藏主导航与账号菜单，不再动态增加“训练”标签。
- 训练完成后回到历史页面并恢复主导航。
- 放弃训练后回到今日页面并恢复主导航。
- 账号菜单改版后的登录、退出和重新登录浏览器流程。

## 验证结果

- `node node_modules/vitest/vitest.mjs run --coverage`：13 个测试文件、93 项测试全部通过。
- API 集成测试：27 项全部通过。
- Playwright Chromium 与 WebKit 相关流程：7 项全部通过。
- Playwright Firefox 跨浏览器流程：3 项全部通过（需在沙箱外运行，以允许 Firefox 创建标签页子进程）。
- `node node_modules/typescript/bin/tsc --noEmit`：通过。
- ESLint（本次涉及的 TypeScript/TSX 文件）：通过。
- `node node_modules/next/dist/bin/next build`：生产构建通过，15 个页面生成成功。

## 覆盖率

- Statements：28.71%（671/2337）
- Branches：21.03%（378/1797）
- Functions：27.22%（153/562）
- Lines：32.51%（593/1824）

