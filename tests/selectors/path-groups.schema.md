# Path-group manifest schema

`path-groups.json` is deliberately JSON rather than TypeScript: it needs no compile step and is easy to review as data. JSON cannot carry comments, so this sibling documents its shape.

```json
{ "groups": { "group-name": { "match": ["source/path/**", "tests/browser/group.spec.ts"], "always": false, "engines": ["firefox", "webkit"] } }, "escalate-full": ["scripts/**"] }
```

Every group needs a non-empty `match` array. Include both source triggers and the browser spec files the group owns: the selector uses this same array for change selection and test discovery. Set `always` only for baseline groups. Put every change that cannot be safely selected into `escalate-full`.
