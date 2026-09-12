'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');
const binaryPath = path.join(distDir, '.ai-installer-macos-arm64');
const imageRoot = path.join(distDir, '.ai-installer-macos-image');
const dmgPath = path.join(distDir, 'ai-installer-macos-arm64.dmg');
const launcherPath = path.join(imageRoot, 'AI Installer.command');
const pkgPath = path.join(repoRoot, 'node_modules', '.bin', 'pkg');

function run(command, args) {
  execFileSync(command, args, { cwd: repoRoot, stdio: 'inherit' });
}

function remove(pathname) {
  fs.rmSync(pathname, { recursive: true, force: true });
}

if (process.platform !== 'darwin') {
  throw new Error('macOS DMG 构建仅支持在 macOS 上执行');
}

if (!fs.existsSync(pkgPath)) {
  throw new Error(`找不到 pkg CLI: ${pkgPath}`);
}

remove(binaryPath);
remove(imageRoot);
remove(dmgPath);
fs.mkdirSync(imageRoot, { recursive: true });

try {
  run(pkgPath, [
    'install-all.js',
    '--target',
    'node18-macos-arm64',
    '--output',
    binaryPath,
  ]);

  fs.writeFileSync(
    launcherPath,
    '#!/bin/bash\n'
      + 'set -e\n'
      + 'SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"\n'
      + 'exec "$SCRIPT_DIR/.ai-installer-macos-arm64" "$@"\n',
    'utf8',
  );
  fs.chmodSync(launcherPath, 0o755);
  fs.renameSync(binaryPath, path.join(imageRoot, '.ai-installer-macos-arm64'));

  run('/usr/bin/hdiutil', [
    'create',
    '-volname',
    'AI Installer',
    '-srcfolder',
    imageRoot,
    '-ov',
    '-format',
    'UDZO',
    dmgPath,
  ]);
} finally {
  remove(binaryPath);
  remove(imageRoot);
}

process.stdout.write(`Created ${dmgPath}\n`);
