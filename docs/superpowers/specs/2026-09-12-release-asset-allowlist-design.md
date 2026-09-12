# GitHub Release Asset Allowlist Design

## Problem

The experimental macOS release workflow currently copies build and validation evidence into `release-assets/final` and explicitly publishes those files through `softprops/action-gh-release`. This mixes public installer downloads with CI diagnostics.

The root cause is not an uncontrolled directory glob. The workflow's explicit upload list is too broad and treats internal evidence as public release assets.

## Goal

Every combined Windows and experimental macOS GitHub Release must publish exactly these five files:

1. `ai-installer-win-x64.exe`
2. `ai-installer-win-arm64.exe`
3. `ai-installer-macos-arm64`
4. `SHA256SUMS.txt`
5. `THIRD-PARTY-NOTICES.md`

No build logs, validation reports, evidence files, exit-code files, or status documents may be attached to the GitHub Release.

## Design

The release job will keep `release-assets/final` as the public staging directory. It will copy only the three installers and third-party notices into that directory, then generate `SHA256SUMS.txt` from the three staged installers.

Before publishing, the workflow will compare the sorted names of every regular file in `release-assets/final` against a fixed five-file allowlist. Any missing or additional file will fail the job before `softprops/action-gh-release` runs.

The release action's `files` input will also contain only the same five explicit paths. This gives two independent controls: the staging directory assertion catches accidental additions, and the action input prevents unrelated downloaded artifacts from being published.

`BUILD-STATUS.md` will no longer be generated as an asset. Its user-relevant status information remains in the GitHub Release body. Build and installation evidence will remain available in the existing temporary GitHub Actions artifacts for 14 days.

## Testing

Add a Node test that reads `.github/workflows/release-all.yml` and verifies:

- the release action lists exactly the five approved paths;
- diagnostic and evidence filenames are absent from the release action's `files` block;
- the workflow contains a strict public staging-directory allowlist check.

Run the repository test suite and parse the workflow as text using narrowly scoped markers around the release action. The test should fail if a future change adds a sixth public asset without updating the intended contract.

## Non-Goals

- Removing or reducing CI validation evidence.
- Changing installer filenames or supported architectures.
- Editing the already-published `v0.2.0-macos-arm64-experimental.2` Release through the GitHub UI or API.
- Changing the standard Windows-only release workflow.

## Rollout

Merge the workflow and test changes to `main`. The fix applies to newly created tags. Cleaning the existing `v0.2.0-macos-arm64-experimental.2` attachments is a separate explicit cloud deletion action and requires confirmation at the time of deletion.
