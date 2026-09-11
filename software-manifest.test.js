'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { getArtifact, SOFTWARE_MANIFEST } = require('./software-manifest');

test('getArtifact returns CC Switch x64 and ARM64 MSI artifacts', () => {
  assert.deepEqual(getArtifact('cc-switch', { platform: 'win32', arch: 'x64' }), {
    name: 'CC Switch',
    url: 'https://dl.ccswitch.io/v3.20.1/CC-Switch-v3.20.1-Windows.msi',
    filename: 'CC-Switch-v3.20.1-Windows.msi',
    installerType: 'msi',
    checksumUrl: null,
    checksumMode: null,
  });
  assert.deepEqual(getArtifact('cc-switch', { platform: 'win32', arch: 'arm64' }), {
    name: 'CC Switch',
    url: 'https://dl.ccswitch.io/v3.20.1/CC-Switch-v3.20.1-Windows-arm64.msi',
    filename: 'CC-Switch-v3.20.1-Windows-arm64.msi',
    installerType: 'msi',
    checksumUrl: null,
    checksumMode: null,
  });
});

test('getArtifact returns Claude and Codex architecture-specific MSIX artifacts', () => {
  const claudeX64 = getArtifact('claude', { platform: 'win32', arch: 'x64' });
  assert.equal(claudeX64.url, 'https://claudeapp.agentsmirror.com/latest/win-x64');
  assert.equal(claudeX64.filename, 'Claude-win-x64.msix');

  const claude = getArtifact('claude', { platform: 'win32', arch: 'arm64' });
  assert.equal(claude.url, 'https://claudeapp.agentsmirror.com/latest/win-arm64');
  assert.equal(claude.filename, 'Claude-win-arm64.msix');
  assert.equal(claude.installerType, 'msix');
  assert.equal(claude.checksumUrl, 'https://claudeapp.agentsmirror.com/latest/checksums');

  const codex = getArtifact('codex', { platform: 'win32', arch: 'x64' });
  assert.equal(codex.url, 'https://codexapp.agentsmirror.com/latest/win-x64');
  assert.equal(codex.filename, 'Codex-Windows-x64.msix');
  assert.equal(codex.checksumUrl, 'https://codexapp.agentsmirror.com/latest/checksums');

  const codexArm64 = getArtifact('codex', { platform: 'win32', arch: 'arm64' });
  assert.equal(codexArm64.url, 'https://codexapp.agentsmirror.com/latest/win-arm64');
  assert.equal(codexArm64.filename, 'Codex-Windows-arm64.msix');
});

test('Codex ARM64 never selects the generic /win alias', () => {
  const artifact = getArtifact('codex', { platform: 'win32', arch: 'arm64' });
  assert.equal(artifact.url, 'https://codexapp.agentsmirror.com/latest/win-arm64');
  assert.notEqual(artifact.url, 'https://codexapp.agentsmirror.com/latest/win');
});

test('getArtifact returns the audited CC Switch macOS arm64 DMG', () => {
  assert.deepEqual(getArtifact('cc-switch', { platform: 'darwin', arch: 'arm64' }), {
    name: 'CC Switch',
    url: 'https://github.com/farion1231/cc-switch/releases/download/v3.20.2/CC-Switch-v3.20.2-macOS.dmg',
    filename: 'CC-Switch-v3.20.2-macOS.dmg',
    installerType: 'dmg',
    checksumUrl: null,
    checksumMode: 'fixed',
    size: 28111538,
    sha256: '847327c8acf320b8f3e1122676dd3921ff4dc7aa02ed1974579c8d7b00894dec',
    architecture: 'arm64',
    sourceRelease: 'https://github.com/farion1231/cc-switch/releases/tag/v3.20.2',
    bundleId: 'com.ccswitch.desktop',
    bundleExecutable: 'cc-switch',
    appName: 'CC Switch.app',
    installPath: '~/Applications/CC Switch.app',
    minimumSystemVersion: '12.0',
  });
});

test('getArtifact returns the audited Claude and Codex macOS arm64 DMGs', () => {
  const claude = getArtifact('claude', { platform: 'darwin', arch: 'arm64' });
  assert.deepEqual(claude, {
    name: 'Claude Desktop',
    url: 'https://github.com/Wangnov/claude-app-mirror/releases/download/claude-app-v1.46388.4/Claude-mac-universal.dmg',
    filename: 'Claude-mac-universal.dmg',
    installerType: 'dmg',
    checksumUrl: 'https://github.com/Wangnov/claude-app-mirror/releases/download/claude-app-v1.46388.4/SHA256SUMS.txt',
    checksumMode: 'fixed',
    size: 353897855,
    sha256: 'c5451dba21b8bf4232f8feffbff946dc7be4d6a64ee22d3190954e16f62444c9',
    architecture: 'universal',
    sourceRelease: 'https://github.com/Wangnov/claude-app-mirror/releases/tag/claude-app-v1.46388.4',
    bundleId: 'com.anthropic.claudefordesktop',
    bundleExecutable: 'Claude',
    appName: 'Claude.app',
    installPath: '~/Applications/Claude.app',
    minimumSystemVersion: '12.0',
  });

  const codex = getArtifact('codex', { platform: 'darwin', arch: 'arm64' });
  assert.deepEqual(codex, {
    name: 'Codex',
    url: 'https://github.com/Wangnov/codex-app-mirror/releases/download/codex-app-26.901.51231/Codex-mac-arm64.dmg',
    filename: 'Codex-mac-arm64.dmg',
    installerType: 'dmg',
    checksumUrl: 'https://github.com/Wangnov/codex-app-mirror/releases/download/codex-app-26.901.51231/SHA256SUMS-macos.txt',
    checksumMode: 'fixed',
    size: 643007873,
    sha256: 'b6ffed73d581047862e85de5b4d322ba431004949a5338736e7059182dff6082',
    architecture: 'arm64',
    sourceRelease: 'https://github.com/Wangnov/codex-app-mirror/releases/tag/codex-app-26.901.51231',
    bundleId: 'com.openai.codex',
    bundleExecutable: 'ChatGPT',
    appName: 'ChatGPT.app',
    installPath: '~/Applications/ChatGPT.app',
    minimumSystemVersion: '13.0',
  });
});

test('macOS manifest exposes only arm64 installable entries and retains no Intel install path', () => {
  for (const id of ['cc-switch', 'claude', 'codex']) {
    assert.equal(SOFTWARE_MANIFEST[id].macos.arm64.architecture === 'arm64' || SOFTWARE_MANIFEST[id].macos.arm64.architecture === 'universal', true);
    assert.equal(getArtifact(id, { platform: 'darwin', arch: 'x64' }), null);
  }
  assert.equal(SOFTWARE_MANIFEST.codex.macos.arm64.bundleExecutable, 'ChatGPT');
});

test('unsupported platform and x86 return no artifact', () => {
  assert.equal(getArtifact('cc-switch', { platform: 'win32', arch: 'x86' }), null);
  assert.equal(getArtifact('claude', { platform: 'darwin', arch: 'x64' }), null);
  assert.equal(getArtifact('unknown', { platform: 'win32', arch: 'x64' }), null);
});
