# lib/driver-retry.ts 单元测试 — 2026-09-11

**命令：** `npx vitest run`
**结果：** 通过 7，失败 0（1 个测试文件）

| 目标 | 用例数 | 通过 | 失败 |
| --- | --- | --- | --- |
| `lib/driver-retry.ts` | 7 | 7 | 0 |

## 已覆盖

- 把 PostgreSQL 08P01 报错「Bind 消息给的参数数量和已预备语句不匹配」识别成瞬时驱动错误，并且只识别错误对象（字符串、空值、非对象都不算）。
- 把 Prisma 错误码 `P1017`（server has closed the connection）和 `P1001`（can't reach database server）按 code 和按 message 两条路径都识别为瞬时错误，并且不会把 `P2002` 这类「语句已经跑过、被数据库拒收」也当成瞬时错误重放。
- `retryTransientDriverError` 遇到瞬时错误重放一次操作并把第二次的成功结果返回。
- 重放预算耗尽（默认 `attempts = 2`）时把最后一次的错误原样抛出，不会悄悄吞掉。
- 与领域无关的失败（如唯一约束冲突）只跑一次，立即抛出 —— 重放不会让本该失败的请求变成成功。

## 未覆盖

- `RETRY_DELAY_MS = 50` 的等待时长 —— 是实现细节，单测不需要锁。
- 把 `driver-retry` 包到上层 API handler 的部分 —— 由 HTTP 集成套件对真实服务覆盖，不属于单测范围。

## 覆盖率

| 文件 | 行 | 分支 | 函数 | 语句 |
| --- | --- | --- | --- | --- |
| `lib/driver-retry.ts` | 100% | 100% | 100% | 100% |

本次运行后的整体单测覆盖率：`lib/` 与 `app/` 合计行覆盖 15.96%（`lib/driver-retry.ts` 加入后比上次的 15.67% 略高）。`app/api/` 由 HTTP 集成套件覆盖，不计入该数字。
