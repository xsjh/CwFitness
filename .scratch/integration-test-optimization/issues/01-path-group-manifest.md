# 01: Path-group manifest

**What to build:** A single reviewable declarative manifest that maps file path globs to test groups, lists paths that escalate to the full run, and pins the always-on health-smoke group. After this lands, anyone can read one file and understand what the selector picks for any given change. This is the sole seam that defines "what does `fast` actually run for me?".

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Manifest file exists at the agreed location (`tests/selectors/path-groups.json`) and parses as JSON with no errors.
- [x] At minimum, the groups `auth`, `plans`, `sessions`, `progress`, `browser-core`, `@cross-browser`, and `health-smoke` are defined, each with a non-empty `match` array.
- [x] The `escalate-full` list covers every path described in spec §"升级规则与边界" (any file under `tests/`, `scripts/`, the test runtime configs, `prisma/**`, `package.json` / lockfile, `next.config.ts`, etc.).
- [x] Each group's `match` glob covers both the source files that trigger the group and the test specs that belong to it, so the same glob drives selection and discovery.
- [x] Schema is documented inline (top-of-file comment or a sibling `path-groups.schema.md`) so a new contributor can add a group without reading the resolver code.
- [x] Choosing JSON over TypeScript is a deliberate pick made in this ticket; the trade-off (no comments vs. no compile step) is recorded in the manifest's doc comment.
