# macOS Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于已审计的 Apple Silicon 包级证据，实现 `darwin/arm64` 实验性安装流程，同时保持现有 Windows 行为零回归；真实启动证据仍按报告保持 `blocked`，不得据此宣称正式支持。

**Architecture:** 保留 `install-all.js` 作为编排入口；把 macOS target/manifest、DMG 安装清理、Bundle/Gatekeeper/启动验证分别置于可注入的小边界中。下载与 SHA-256 复用现有逻辑，但 checksum 成功变成 macOS 安装硬前置；所有系统命令使用可替换的 `execFile`/`spawn`。

**Tech Stack:** Node.js built-ins (`https`, `fs`, `child_process`, `crypto`, `os`, `path`), macOS `hdiutil`/`ditto`/`plutil`/`codesign`/`spctl`/`open`/`pgrep`, Node test runner。

## Global Constraints

- macOS Apple Silicon 当前状态为 `experimental / implementation-in-progress`；2026-09-10 决策覆盖“启动验收完成前禁止修改代码”的阶段门槛，但不覆盖真实报告事实或正式发布门槛。
- macOS Intel/x64 本阶段完全后置，保持 `not-tested`，不实现安装路径，不生成 Intel 产物，不使用 Rosetta 作为证据。
- 支持矩阵按 `darwin/arm64`、`darwin/x64` 和软件逐项决定；不得用 DMG 存在或 HTTP 200 代替安装证据。
- 下载完整且 SHA-256 匹配是安装硬前置；不匹配、截断、缺失或歧义时删除/保留策略必须明确且不得安装。
- 不自动 `sudo`；优先用户可写目录，写 `/Applications` 失败时明确提示并退出。
- DMG 使用只读挂载，所有路径在 `finally` 中卸载并清理。
- Gatekeeper/签名失败不得绕过；必须显示未安装和人工复核提示。
- 不修改现有 Windows manifest/安装语义；`npm test` 和 Windows 真机回归必须通过。
- 本计划不包含 macOS Release、tag 或 Windows Release 修改；允许生成仅供 GitHub Actions 验证的未签名 macOS 测试 artifact，并在报告中明确其不是 Release。

---

### Task 1: Real macOS Evidence Baseline

**Files:**
- Create: `docs/superpowers/2026-09-08-macos-real-validation-report.md`
- Modify: none
- Test: validation commands recorded in the report

**Interfaces:**
- Consumes: release URLs and digests from `docs/superpowers/2026-09-08-macos-support-feasibility-report.md`.
- Produces: per-software/per-architecture evidence rows used to constrain the experimental manifest. The 2026-09-10 decision allows the experimental arm64 implementation before independent launch evidence is complete.

- [x] **Step 1: Prepare clean hosts**

Use one clean Apple Silicon macOS host and, for x64 support, one Intel macOS host or an explicitly supported Intel VM. Record macOS version, Darwin version, Node version, and architecture.

- [x] **Step 2: Download and verify each candidate**

For every selected software/architecture, download the exact pinned URL, record HTTP redirects and final byte count, calculate SHA-256 with `shasum -a 256`, and compare to the release checksum. Reject Claude's prior 131 MB partial file.

- [x] **Step 3: Inspect package and app metadata**

Mount DMGs read-only or extract ZIP fallback, run `file`/`lipo -info`, then read `CFBundleIdentifier`, `CFBundleExecutable`, and `LSMinimumSystemVersion` with `plutil`. Record the discovered `.app` path and do not infer values from Windows.

- [x] **Step 4: Install, Gatekeeper-check, and launch**

Copy to a user-writable application directory or `/Applications` only after explicit permission is available. Run `codesign --verify --deep --strict`, `spctl --assess --type execute`, and `/usr/bin/open`; record `pgrep`/exit status. Treat any failure as blocked and do not enable that row.

- [x] **Step 5: Review the baseline**

The 2026-09-08 and 2026-09-09 reports provide the implementation baseline. Keep the three independent arm64 launch rows `blocked` and all Intel rows `not-tested`; the 2026-09-10 decision allows implementation to proceed without changing those reports.

### Task 2: Add macOS Target and Manifest Tests First

**Files:**
- Create: `macos-support.test.js`
- Modify: `platform-support.test.js`, `software-manifest.test.js`
- Test: `npm test -- --test-name-pattern='macOS|darwin'`

**Interfaces:**
- Consumes: Task 1's audited `darwin/arm64` package rows and fixed URLs/digests.
- Produces: failing tests that require explicit `darwin` target selection and per-architecture manifest fields (`url`, `filename`, `installerType`, `checksumUrl`, `architecture`, `bundleId`, `installPath`).

- [x] **Step 1: Write target-selection tests**

Assert `detectTarget({ platform: 'darwin', arch: 'arm64' })` and `detectTarget({ platform: 'darwin', arch: 'x64' })` preserve `isWindows: false`; retain Windows x64/ARM64 and x86 rejection tests.

- [x] **Step 2: Write manifest isolation tests**

For each enabled row, assert `getArtifact` selects `darwin` assets, returns the expected installer type and metadata, and never falls back to `win32` when the target is `darwin`.

- [x] **Step 3: Run the focused tests and verify failure**

The focused tests were implemented with the target and manifest changes; the final suite reports the macOS assertions passing while the existing Windows tests remain runnable.

### Task 3: Implement DMG Install and Verification Boundaries

**Files:**
- Create: `macos-installer.js`
- Create: `macos-installer.test.js`
- Modify: `install-all.js`
- Test: `node --test macos-installer.test.js install-all.test.js`

**Interfaces:**
- Consumes: validated artifact metadata from Task 2.
- Produces: `installDmg({ dmgPath, appName, installDir, execFile, fsModule }) -> Promise<{ appPath, mountPoint }>` with guaranteed detach/temporary-directory cleanup; `verifyMacApp({ appPath, expected }) -> Promise<metadata>`.

- [x] **Step 1: Write cleanup and command tests**

Assert `hdiutil attach -nobrowse -readonly`, app discovery, `ditto`, and `hdiutil detach` arguments; assert detach runs when copy, metadata, or Gatekeeper checks fail; assert no `sudo` command is spawned.

- [x] **Step 2: Implement the smallest injectable command wrapper**

Use `execFile` with argument arrays for `hdiutil`, `ditto`, `plutil`, `codesign`, `spctl`, and `open`. Never build a shell command string from a download path.

- [x] **Step 3: Add metadata and Gatekeeper failure states**

Return structured errors for bundle mismatch, minimum-system mismatch, invalid signature, and `spctl` failure. The caller must log that installation was not continued and must not advise disabling Gatekeeper.

- [x] **Step 4: Run focused tests**

Run `node --test macos-installer.test.js install-all.test.js`; expected: PASS with Windows tests unchanged.

### Task 4: Integrate Checksum-First macOS Flow Without Windows Regression

**Files:**
- Modify: `platform-support.js`
- Modify: `software-manifest.js`
- Modify: `install-all.js`
- Modify: `install-all.test.js`, `platform-support.test.js`, `software-manifest.test.js`
- Test: `npm test`

**Interfaces:**
- Consumes: Task 2 manifest and Task 3 installer/verification APIs.
- Produces: macOS flow that runs `download -> required checksum -> install -> cleanup -> metadata -> optional Gatekeeper/launch evidence`, while existing Windows flow remains behaviorally identical.

- [x] **Step 1: Add checksum hard-precondition tests**

Mock a checksum mismatch and assert the cached DMG is removed, no macOS command runs, and the result is `partially-supported`/`blocked` with an actionable message. Mock a matching checksum and assert install begins only afterward.

- [x] **Step 2: Add dry-run and non-darwin isolation tests**

Assert `--dry-run` performs no mount/copy/open and Windows targets never call macOS commands. Assert `--print-target` emits correct darwin JSON.

- [x] **Step 3: Implement target dispatch and messages**

Route only validated `darwin` artifacts to the macOS installer. Keep unsupported/unvalidated rows visible as feasibility-only; do not silently choose a Windows asset.

- [x] **Step 4: Run complete regression tests**

Run `npm test`, `node --check install-all.js`, `node --check macos-installer.js`, and the existing PE verifier tests. Expected: all prior Windows tests plus new macOS unit tests pass.

### Task 5: Update Documentation Constraint and Verification Workflow

**Files:**
- Modify: `AGENTS.md` (one status constraint only)
- Modify: `docs/superpowers/2026-09-08-macos-support-design.md` (record accepted scope)
- Create: `.github/workflows/package-macos-arm64.yml`
- Create: `docs/superpowers/2026-09-10-macos-arm64-implementation-report.md`
- Test: documentation review and `git diff --check`

**Interfaces:**
- Consumes: completed real-host evidence and regression results.
- Produces: explicit experimental status, a manual Apple Silicon workflow, and an implementation report without changing historical validation reports.

- [x] **Step 1: Update the project status constraints**

Record the 2026-09-10 decision in `AGENTS.md` and the design/plan documents. Do not add macOS to the official support list and do not change Windows decisions.

- [x] **Step 2: Add the manual arm64 workflow**

Build the unsigned macOS arm64 installer with a macOS arm64 runner, run tests and static checks, generate `SHA256SUMS.txt`, and upload a temporary artifact. Record `launch not-tested` when the runner cannot provide a reliable GUI launch assertion. Do not add an Intel matrix entry.

- [x] **Step 3: Reconcile support matrix**

Keep the three application launch rows `blocked` and Intel rows `not-tested`; report implementation status separately as experimental.

- [x] **Step 4: Write the implementation report**

Create `docs/superpowers/2026-09-10-macos-arm64-implementation-report.md` with modified files, support matrix, source URLs, checksum handling, DMG cleanup, target paths, unsigned installer guidance, tests, workflow results, artifact status, and explicit no Release/no tag confirmation.

- [x] **Step 5: Verify repository hygiene**

Run `git diff --check`, `git status --short`, and confirm no macOS Release artifact, tag, GitHub Release, or Windows Release file changed. A temporary workflow artifact is allowed and must be reported as non-Release evidence.
