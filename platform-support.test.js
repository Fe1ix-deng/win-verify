'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  detectTarget,
  getWindowsBuild,
  getUnsupportedTargetReason,
  getWindowsCompatibilityReason,
  normalizeArch,
} = require('./platform-support');

test('getWindowsBuild parses CurrentBuildNumber from registry output', () => {
  const output = 'CurrentBuildNumber    REG_SZ    17763\r\n';
  const build = getWindowsBuild({
    platform: 'win32',
    execFileSync: () => output,
  });
  assert.equal(build, 17763);
});

test('getWindowsBuild returns undefined when registry lookup fails', () => {
  const build = getWindowsBuild({
    platform: 'win32',
    execFileSync: () => { throw new Error('reg unavailable'); },
  });
  assert.equal(build, undefined);
});

test('normalizeArch maps supported Node architecture values', () => {
  assert.equal(normalizeArch('x64'), 'x64');
  assert.equal(normalizeArch('arm64'), 'arm64');
  assert.equal(normalizeArch('ia32'), 'x86');
});

test('normalizeArch marks unknown values as unknown', () => {
  assert.equal(normalizeArch('mips64'), 'unknown');
  assert.equal(normalizeArch('AMD64'), 'x64');
  assert.equal(normalizeArch('ARM64'), 'arm64');
  assert.equal(normalizeArch('x86'), 'x86');
});

test('detectTarget reports Windows target and architecture', () => {
  assert.deepEqual(detectTarget({ platform: 'win32', arch: 'arm64' }), {
    platform: 'win32',
    arch: 'arm64',
    isWindows: true,
  });
});

test('detectTarget prefers native Windows architecture environment variables', () => {
  assert.equal(detectTarget({
    platform: 'win32',
    arch: 'ia32',
    env: { PROCESSOR_ARCHITEW6432: 'AMD64', PROCESSOR_ARCHITECTURE: 'x86' },
  }).arch, 'x64');
  assert.equal(detectTarget({
    platform: 'win32',
    arch: 'ia32',
    env: { PROCESSOR_ARCHITECTURE: 'ARM64' },
  }).arch, 'arm64');
  assert.equal(detectTarget({
    platform: 'win32',
    arch: 'ia32',
    env: { PROCESSOR_ARCHITECTURE: 'x86' },
  }).arch, 'x86');
});

test('detectTarget marks unknown native architecture and reads injected build', () => {
  const target = detectTarget({
    platform: 'win32',
    arch: 'ia32',
    env: { PROCESSOR_ARCHITECTURE: 'MIPS64', WINDOWS_BUILD: '17763' },
  });
  assert.equal(target.arch, 'unknown');
  assert.equal(target.windowsBuild, 17763);
});

test('detectTarget reads Windows build through an injected system reader', () => {
  const target = detectTarget({
    platform: 'win32',
    arch: 'x64',
    windowsBuildReader: () => 17763,
  });
  assert.equal(target.windowsBuild, 17763);
});

test('detectTarget wires the injected registry command into Windows build detection', () => {
  const target = detectTarget({
    platform: 'win32',
    arch: 'x64',
    execFileSync: () => 'CurrentBuildNumber    REG_SZ    17763\r\n',
  });
  assert.equal(target.windowsBuild, 17763);
});

test('detectTarget reports non-Windows target', () => {
  assert.deepEqual(detectTarget({ platform: 'darwin', arch: 'x64' }), {
    platform: 'darwin',
    arch: 'x64',
    isWindows: false,
  });
});

test('detectTarget defaults to the current process values', () => {
  const target = detectTarget();
  assert.equal(target.platform, process.platform);
  assert.equal(target.arch, normalizeArch(process.arch));
  assert.equal(target.isWindows, process.platform === 'win32');
});

test('getUnsupportedTargetReason explains unsupported targets', () => {
  assert.equal(getUnsupportedTargetReason({ platform: 'win32', arch: 'x86', isWindows: true }), 'Windows x86（32 位）没有官方安装包');
  assert.equal(getUnsupportedTargetReason({ platform: 'darwin', arch: 'x64', isWindows: false }), '当前系统不是 Windows');
  assert.equal(getUnsupportedTargetReason({ platform: 'win32', arch: 'x64', isWindows: true }), null);
  assert.equal(getUnsupportedTargetReason({ platform: 'win32', arch: 'arm64', isWindows: true }), null);
  assert.equal(getUnsupportedTargetReason({ platform: 'win32', arch: 'unknown', isWindows: true }), 'Windows 原生架构未知，无法安全选择安装包');
});

test('getWindowsCompatibilityReason flags builds before Windows 10 1809', () => {
  assert.match(getWindowsCompatibilityReason({ platform: 'win32', isWindows: true, windowsBuild: 17134 }), /Windows 10 1809/);
  assert.equal(getWindowsCompatibilityReason({ platform: 'win32', isWindows: true, windowsBuild: 17763 }), null);
  assert.equal(getWindowsCompatibilityReason({ platform: 'win32', isWindows: true }), null);
  assert.match(getWindowsCompatibilityReason({
    platform: 'win32',
    isWindows: true,
    windowsBuildRead: true,
  }), /无法确认 Windows 版本/);
});
