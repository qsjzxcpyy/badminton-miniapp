# WeChat Cloud MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a native WeChat mini program backed by cloud functions and cloud database while preserving the existing Vue prototype.

**Architecture:** Keep the Vue/Vite prototype untouched. Add a native mini program and one cloud function. The cloud function owns database access, hides player levels from public data, authorizes creator operations by OpenID, and uses revision writes for score updates. Reuse the scheduler algorithm in CommonJS form inside the cloud function.

**Tech Stack:** WeChat Mini Program, WeChat Cloud Development, Node.js cloud function, cloud database, Node test runner.

---

### Task 1: Domain and authorization

**Files:** `cloudfunctions/match/logic.js`, `cloudfunctions/match/tests/logic.test.js`

- [ ] Write tests for public level hiding, creator-only admin, non-negative scores, and ranking recalculation.
- [ ] Run the tests red.
- [ ] Implement pure validation, public snapshot, ranking, and mutations.
- [ ] Re-run the tests green.

### Task 2: Persistence and scheduler

**Files:** `cloudfunctions/match/index.js`, `cloudfunctions/match/package.json`, `cloudfunctions/match/scheduler.cjs`, `scripts/package-scheduler.cjs`, `cloudfunctions/match/tests/scheduler.test.js`

- [ ] Add scheduler packaging and validity tests.
- [ ] Implement cloud-function dispatch with OpenID, invite-code lookup, creator checks, and conditional revision writes.
- [ ] Run domain and scheduler tests.

### Task 3: Native mini program

**Files:** `miniprogram/app.js`, `miniprogram/app.json`, `miniprogram/app.wxss`, `miniprogram/config.js`, `miniprogram/pages/index/*`, `project.config.json`

- [ ] Add create/join, match, schedule, ranking, and creator admin flows.
- [ ] Call the cloud function for mutations and poll public snapshots while visible.
- [ ] Never show levels outside creator admin.
- [ ] Configure the developer tool roots and environment placeholder.

### Task 4: Verification and handoff

**Files:** `README-wechat-cloud.md`

- [ ] Run Node tests, scheduler regressions, and Vue build.
- [ ] Inspect native project files and document deployment, permissions, and experience QR steps.
- [ ] Clearly distinguish local verification from real multi-device cloud verification.
