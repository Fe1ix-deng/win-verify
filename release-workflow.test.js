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
