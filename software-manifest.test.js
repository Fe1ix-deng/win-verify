'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { getArtifact } = require('./software-manifest');

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

test('unsupported platform and x86 return no artifact', () => {
  assert.equal(getArtifact('cc-switch', { platform: 'win32', arch: 'x86' }), null);
  assert.equal(getArtifact('claude', { platform: 'darwin', arch: 'x64' }), null);
  assert.equal(getArtifact('unknown', { platform: 'win32', arch: 'x64' }), null);
});
