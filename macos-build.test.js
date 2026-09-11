'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = __dirname;

test('package scripts define an arm64-only macOS build', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['build:macos:arm64'], 'pkg install-all.js --target node18-macos-arm64 --output dist/ai-installer-macos-arm64');
  assert.equal(packageJson.scripts['build:macos'], 'npm run build:macos:arm64');
  assert.equal(Object.keys(packageJson.scripts).some((name) => /macos.*x64|x64.*macos/i.test(name)), false);
});

test('macOS workflow pushes only the experimental branch and validates a real install', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'package-macos-arm64.yml'), 'utf8');
  assert.match(workflow, /push:\s*\n\s+branches:\s*\n\s+- feature\/macos-arm64-experimental/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /runs-on:\s*macos-15/);
  assert.match(workflow, /build:macos:arm64/);
  assert.match(workflow, /--ci/);
  assert.match(workflow, /uname -a/);
  assert.match(workflow, /uname -m/);
  assert.match(workflow, /sw_vers/);
  assert.match(workflow, /node --version/);
  assert.match(workflow, /npm --version/);
  assert.match(workflow, /df -h/);
  assert.match(workflow, /test \"\$\(uname -m\)\" = arm64/);
  assert.match(workflow, /SHA256SUMS\.txt/);
  assert.match(workflow, /macos-install-validation\.log/);
  assert.match(workflow, /plutil/);
  assert.match(workflow, /file/);
  assert.match(workflow, /lipo -info/);
  assert.match(workflow, /codesign --verify --deep --strict --verbose=4/);
  assert.match(workflow, /spctl --assess --type execute --verbose=4/);
  assert.match(workflow, /launch=not-tested/);
  assert.match(workflow, /ai-installer-macos-arm64-experimental/);
  assert.doesNotMatch(workflow, /macos-(?:13|14)-x64|x64|Intel|Rosetta/i);
  assert.match(workflow, /signed|unsigned/i);
  assert.match(workflow, /No Release|not a Release|temporary/i);
});
