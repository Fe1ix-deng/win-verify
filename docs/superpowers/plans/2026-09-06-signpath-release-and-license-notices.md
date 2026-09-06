# SignPath, GitHub Release, and License Notices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish auditable third-party notices and a tag-triggered GitHub Release path that works unsigned while SignPath Foundation reviews the OV signing application.

**Architecture:** Keep signing approval independent from release automation. The unsigned path builds the already validated x64/ARM64 executables, verifies PE headers and SHA-256, and publishes those exact files plus `SHA256SUMS.txt` to a GitHub Release. A future SignPath job can be inserted between build verification and release publication without changing the installer or its upstream download behavior.

**Tech Stack:** GitHub Actions, `pkg@5.8.1`, `actions/upload-artifact@v4`, GitHub Release tooling, SignPath Foundation integration after approval.

## Global Constraints

- Use OV code signing, not EV.
- SignPath Foundation's free open-source signing program is the selected provider; its HSM holds the private key.
- The SignPath application is pending and must not block unsigned releases or other development.
- Until SignPath approval, release executables are unsigned and `SHA256SUMS.txt` is the integrity mechanism.
- Publish formal GitHub Releases from version tags; do not use temporary Actions artifacts as the public download channel.
- Publish only Windows x64 and ARM64; never publish x86.
- Do not create or overwrite `ai-installer.exe`.
- Preserve the exact upstream MIT texts and retrieval metadata in `THIRD-PARTY-NOTICES.md`.
- Keep this provenance statement unchanged in SignPath materials and product documentation: `本工具本身不构建、不修改、不托管 Claude/Codex 的官方二进制文件，安装包分别来自上述三个项目各自发布的 GitHub Release。`

---

### Task 1: Audit Project Policy and License Notices

**Files:**
- Create: `AGENTS.md`
- Create: `THIRD-PARTY-NOTICES.md`

- [ ] **Step 1: Verify the three upstream license sources**

Fetch only the `main/LICENSE` files from:

```text
https://github.com/farion1231/cc-switch/blob/main/LICENSE
https://github.com/Wangnov/claude-app-mirror/blob/main/LICENSE
https://github.com/Wangnov/codex-app-mirror/blob/main/LICENSE
```

Record retrieval date `2026-09-06`, preserve each complete text and its copyright line verbatim, and do not normalize the copyright year or author.

- [ ] **Step 2: Check notice coverage**

Require each notice section to include the project name, repository URL, release source URL, license source URL, retrieval date, license name, and full MIT text. Require the exact provenance statement in the document introduction.

- [ ] **Step 3: Check project policy coverage**

Require `AGENTS.md` to state x64/ARM64-only packaging, OV + SignPath Foundation, unsigned interim releases, tag-triggered GitHub Releases, checksum requirements, no legacy alias, and the three MIT dependencies.

### Task 2: Add an Unsigned Tag-Triggered Release Workflow

**Files:**
- Create: `.github/workflows/release-windows.yml`
- Do not modify: `.github/workflows/windows-verify.yml` or the existing packaging-validation workflow

**Interfaces:**
- Trigger: pushed tags matching `v*.*.*`.
- Release assets: `ai-installer-win-x64.exe`, `ai-installer-win-arm64.exe`, `SHA256SUMS.txt`.
- Release body must state `未签名` while SignPath approval is pending.

- [ ] **Step 1: Build one architecture per fresh Windows runner**

Use `windows-latest` and `windows-11-arm`, run `npm ci`, `npm test`, the corresponding build script, PE verifier, and direct packaged `--print-target` check. Do not use `node dist\\*.exe --print-target`.

- [ ] **Step 2: Generate evidence from exact build files**

For each executable record byte size, PE machine, target JSON, and SHA-256. Fail if the expected file is missing or if any x86 file is generated.

- [ ] **Step 3: Publish a GitHub Release only after both builds pass**

Download or transfer the exact two build outputs to a release job, recompute hashes there, generate `SHA256SUMS.txt`, and create the release using the pushed tag. Do not publish a release if either architecture job fails.

- [ ] **Step 4: Add a future signing insertion point without enabling signing now**

Keep the release job's input contract explicit: it consumes two verified executables and emits the three release assets. Do not add placeholder SignPath project IDs, secrets, or unsigned-to-signed claims.

### Task 3: Prepare SignPath Foundation Application Materials

**Files:**
- Create: `docs/superpowers/2026-09-06-signpath-application-notes.md`

- [ ] **Step 1: Document the requested OV signing scope**

State that the project requests the SignPath Foundation free open-source program for OV code signing, with private keys held by SignPath in HSM and signing initiated from GitHub Actions.

- [ ] **Step 2: Document project provenance and distribution**

Reuse the exact provenance sentence from `AGENTS.md` and `THIRD-PARTY-NOTICES.md`. Link to the repository, the three upstream MIT projects, the validation report, and the unsigned release workflow.

- [ ] **Step 3: Record the application state without blocking releases**

Mark the application as `pending` until the user submits it and SignPath responds. Do not claim approval, certificate issuance, or signed artifacts before external confirmation.

### Task 4: Add Signed Release Integration Only After Approval

**Files:**
- Modify: `.github/workflows/release-windows.yml` only after SignPath supplies the exact approved integration values
- Modify: `AGENTS.md` and release documentation with the approval date and public signing policy

- [ ] **Step 1: Require explicit external approval evidence**

Before changing the workflow, record the SignPath project/organization identifiers and approved repository/workflow integration supplied by SignPath. Never invent these values.

- [ ] **Step 2: Sign the two architecture-specific executables**

Insert signing after PE/hash verification and before final release checksum generation. Fail closed if signing returns an error or either output is not Authenticode-verifiable.

- [ ] **Step 3: Recompute release hashes after signing**

Generate `SHA256SUMS.txt` from the signed files, and make the release body distinguish signed status from the unsigned interim policy.

- [ ] **Step 4: Preserve an auditable unsigned fallback**

If SignPath is unavailable, do not silently publish a file as signed. Either stop the signed path or explicitly use the previously documented unsigned release path with an `未签名` notice.

## Final Verification

```bash
git diff --check
npm test
node --test scripts/verify-pe.test.js
node --check install-all.js
node --check scripts/verify-pe.js
```

The release workflow must be reviewed for tag filtering, architecture mapping, exact asset names, checksum generation after the final file transformation, and absence of signing secrets until SignPath approval exists.
