# 02: Selector resolver module

**What to build:** A pure resolver module that, given a parsed manifest, a base ref, and a list of changed paths (or `--force-full`), returns the resolved groups plus the mode (`fast` or `full`) and a human-readable reason. No I/O, no subprocesses, no fixture on disk — easy to test and easy to compose into a runner later.

**Blocked by:** 01 (Path-group manifest).

**Status:** resolved

- [ ] Module lives at `scripts/test-selector.mjs` and exports `resolveGroups({manifest, base, changedPaths, force})` returning `{mode: "fast" | "full", groups: string[], reason: string}`.
- [ ] Empty `changedPaths` returns `{mode: "fast", groups: ["health-smoke", "browser-core"], reason: "no-changes"}`.
- [ ] Any `changedPaths` entry whose path matches an `escalate-full` glob returns `{mode: "full", reason: "escalate:<matching-pattern>"}`.
- [ ] Manifest parse error or missing file returns `{mode: "full", reason: "manifest:<err-message>"}`.
- [ ] `force: true` (the resolved form of the `--force-full` CLI flag) returns `{mode: "full", reason: "force-full"}` regardless of inputs.
- [ ] For non-empty changes outside `escalate-full`, returns `{mode: "fast", groups: [...selected+always-on], reason: "selected"}` with groups in stable order.
- [ ] Module performs no external I/O — operates entirely on the inputs passed in; the runner ticket (06) does the subprocess / git work.

## Answer

Implemented pure `resolveGroups` in `scripts/test-selector.mjs`; CLI I/O remains outside the resolver.
