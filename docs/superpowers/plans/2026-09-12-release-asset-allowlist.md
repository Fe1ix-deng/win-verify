# GitHub Release Asset Allowlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure combined Windows and experimental macOS GitHub Releases publish exactly three installers, one checksum manifest, and the third-party notices file.

**Architecture:** Keep CI diagnostics in the existing GitHub Actions artifacts, but treat `release-assets/final` as a strictly validated public staging directory. Enforce the five-file contract both in a Node workflow test and in the release job immediately before `softprops/action-gh-release` runs.

**Tech Stack:** GitHub Actions YAML, Bash, Node.js 20 built-in test runner, `node:assert/strict`

## Global Constraints

- The public Release asset list is exactly `ai-installer-win-x64.exe`, `ai-installer-win-arm64.exe`, `ai-installer-macos-arm64`, `SHA256SUMS.txt`, and `THIRD-PARTY-NOTICES.md`.
- Build logs, validation reports, evidence files, exit-code files, and status documents remain outside the GitHub Release.
- GitHub Actions validation artifacts and their 14-day retention remain unchanged.
- Installer filenames, supported architectures, and the Windows-only release workflow remain unchanged.
- The already-published `v0.2.0-macos-arm64-experimental.2` Release is not edited by this code change.

---

### Task 1: Add a Release asset contract test

**Files:**
- Create: `release-workflow.test.js`
- Read: `.github/workflows/release-all.yml`

**Interfaces:**
- Consumes: the `softprops/action-gh-release@v2` step and the public staging-directory validation script in `.github/workflows/release-all.yml`.
- Produces: repository tests that fail when the release action exposes any file outside the five-file allowlist or when the staging-directory assertion is removed.

- [ ] **Step 1: Write the failing test**

Create `release-workflow.test.js`:

```js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflow = fs.readFileSync(
  path.join(__dirname, '.github', 'workflows', 'release-all.yml'),
  'utf8',
);

const expectedReleasePaths = [
  'release-assets/final/ai-installer-win-x64.exe',
  'release-assets/final/ai-installer-win-arm64.exe',
  'release-assets/final/ai-installer-macos-arm64',
  'release-assets/final/SHA256SUMS.txt',
  'release-assets/final/THIRD-PARTY-NOTICES.md',
];

function getReleaseFiles() {
  const actionStart = workflow.indexOf('uses: softprops/action-gh-release@v2');
  assert.notEqual(actionStart, -1, 'release action must exist');

  const action = workflow.slice(actionStart);
  const match = action.match(/\n\s+files:\s*\|\n((?:\s{12}\S.*\n)+)/);
  assert.ok(match, 'release action must define a literal files block');

  return match[1]
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim());
}

test('combined release publishes exactly the public asset allowlist', () => {
  assert.deepEqual(getReleaseFiles(), expectedReleasePaths);
});

test('combined release validates the complete public staging directory', () => {
  assert.match(workflow, /expected-release-files\.txt/);
  assert.match(workflow, /actual-release-files\.txt/);
  assert.match(workflow, /find release-assets\/final -maxdepth 1 -type f/);
  assert.match(workflow, /LC_ALL=C sort/);
  assert.match(workflow, /diff -u release-assets\/expected-release-files\.txt release-assets\/actual-release-files\.txt/);
});

test('combined release does not publish CI evidence or logs', () => {
  const releaseFiles = getReleaseFiles().join('\n');
  assert.doesNotMatch(releaseFiles, /evidence|validation|exit-code|BUILD-STATUS|\.log/i);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
node --test release-workflow.test.js
```

Expected: FAIL because the current release action lists evidence/log files and the strict staging-directory manifest check does not exist.

- [ ] **Step 3: Commit the failing contract test**

```bash
git add release-workflow.test.js
git commit -m "test: define public release asset allowlist"
```

### Task 2: Restrict and validate public Release assets

**Files:**
- Modify: `.github/workflows/release-all.yml`
- Test: `release-workflow.test.js`

**Interfaces:**
- Consumes: the three downloaded installer artifacts and repository `THIRD-PARTY-NOTICES.md`.
- Produces: a `release-assets/final` directory containing exactly the five approved public files and a release action that uploads exactly those paths.

- [ ] **Step 1: Remove CI evidence from the public staging directory**

In `Assemble and verify final release files`, retain only these copies before checksum generation:

```bash
mkdir -p release-assets/final
cp release-assets/x64/ai-installer-win-x64.exe release-assets/final/
cp release-assets/arm64/ai-installer-win-arm64.exe release-assets/final/
cp release-assets/macos/ai-installer-macos-arm64 release-assets/final/
cp THIRD-PARTY-NOTICES.md release-assets/final/
```

Delete every copy of `release-evidence-*`, `file-evidence.txt`, `build-evidence-*`, `runner-evidence-*`, `print-target-*`, `preexisting-apps.txt`, validation files, logs, and exit-code files into `release-assets/final`.

- [ ] **Step 2: Add the strict staging-directory allowlist assertion**

After generating and verifying `SHA256SUMS.txt`, add:

```bash
cat > release-assets/expected-release-files.txt <<'EOF'
SHA256SUMS.txt
THIRD-PARTY-NOTICES.md
ai-installer-macos-arm64
ai-installer-win-arm64.exe
ai-installer-win-x64.exe
EOF
find release-assets/final -maxdepth 1 -type f -exec basename {} \; \
  | LC_ALL=C sort > release-assets/actual-release-files.txt
diff -u release-assets/expected-release-files.txt release-assets/actual-release-files.txt
```

The expected list is already in `LC_ALL=C` lexical order. Keep both manifest files outside `release-assets/final` so they cannot become release attachments.

- [ ] **Step 3: Remove `BUILD-STATUS.md` generation and narrow the release action**

Delete the `Write build status explanation` step. Replace the release action's `files` block with:

```yaml
files: |
  release-assets/final/ai-installer-win-x64.exe
  release-assets/final/ai-installer-win-arm64.exe
  release-assets/final/ai-installer-macos-arm64
  release-assets/final/SHA256SUMS.txt
  release-assets/final/THIRD-PARTY-NOTICES.md
```

Add the workflow-run link to the existing Release body so operational status remains available without a separate attachment:

```yaml
构建验证：
- GitHub Actions：${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```bash
node --test release-workflow.test.js
```

Expected: 3 tests pass and 0 tests fail.

- [ ] **Step 5: Run the full regression suite and workflow whitespace check**

Run:

```bash
npm test
git diff --check
```

Expected: all repository tests pass; `git diff --check` produces no output.

- [ ] **Step 6: Review the effective asset contract**

Run:

```bash
sed -n '/Assemble and verify final release files/,/Create unsigned macOS arm64 experimental pre-release/p' .github/workflows/release-all.yml
git diff -- .github/workflows/release-all.yml release-workflow.test.js
```

Expected: only the five approved files enter `release-assets/final` and the release action's `files` block contains exactly those five paths.

- [ ] **Step 7: Commit the workflow fix**

```bash
git add .github/workflows/release-all.yml
git commit -m "fix: restrict public release assets"
```

Do not stage the pre-existing modifications in `docs/superpowers/plans/2026-09-08-macos-support-implementation-plan.md` or `docs/superpowers/specs/2026-09-08-macos-support-design.md`.
