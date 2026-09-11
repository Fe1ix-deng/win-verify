'use strict';

const { execFileSync: defaultExecFileSync } = require('node:child_process');

const WINDOWS_CURRENT_VERSION_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion';

function getWindowsBuild({
  platform = process.platform,
  execFileSync = defaultExecFileSync,
} = {}) {
  if (platform !== 'win32') return undefined;

  try {
    const output = execFileSync('reg', [
      'query',
      WINDOWS_CURRENT_VERSION_KEY,
      '/v',
      'CurrentBuildNumber',
    ], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const match = String(output).match(/CurrentBuildNumber\s+REG_\w+\s+(\d+)/i);
    const build = match ? Number(match[1]) : NaN;
    return Number.isInteger(build) && build > 0 ? build : undefined;
  } catch {
    return undefined;
  }
}

function normalizeArch(nodeArch = process.arch) {
  const value = String(nodeArch).toLowerCase();
  if (value === 'x64' || value === 'amd64') return 'x64';
  if (value === 'arm64') return 'arm64';
  if (value === 'ia32' || value === 'x86') return 'x86';
  return 'unknown';
}

function detectTarget({
  platform = process.platform,
  arch = process.arch,
  env = process.env,
  windowsBuild,
  windowsBuildReader,
  execFileSync,
} = {}) {
  const nativeArch = platform === 'win32'
    ? (env && (env.PROCESSOR_ARCHITEW6432 || env.PROCESSOR_ARCHITECTURE)) || arch
    : arch;
  let buildValue = windowsBuild;
  let attemptedWindowsBuildRead = false;
  if (buildValue === undefined && platform === 'win32') {
    attemptedWindowsBuildRead = true;
    try {
      if (typeof windowsBuildReader === 'function') {
        buildValue = windowsBuildReader();
      } else if (env !== process.env && env) {
        // Environment values remain available for deterministic unit-test fixtures.
        buildValue = env.WINDOWS_BUILD || env.OS_BUILD;
      } else {
        buildValue = getWindowsBuild({ platform, execFileSync });
      }
    } catch {
      buildValue = undefined;
    }
  }
  const parsedBuild = buildValue === undefined || buildValue === null || buildValue === ''
    ? undefined
    : Number(buildValue);
  const target = {
    platform,
    arch: normalizeArch(nativeArch),
    isWindows: platform === 'win32',
    ...(Number.isInteger(parsedBuild) && parsedBuild > 0 ? { windowsBuild: parsedBuild } : {}),
  };
  if (attemptedWindowsBuildRead) {
    Object.defineProperty(target, 'windowsBuildRead', {
      value: true,
      enumerable: false,
    });
  }
  return target;
}

function getUnsupportedTargetReason(target) {
  if (!target) return '无法识别当前平台';
  if (target.platform === 'darwin') {
    if (target.arch === 'arm64') return null;
    if (target.arch === 'x64') return 'macOS Intel/x64 本阶段不实现，保持 not-tested';
    return 'macOS 仅支持 Apple Silicon arm64 实验版';
  }
  if (target.isWindows !== true) return '当前系统不是 Windows';
  if (target.arch === 'unknown') return 'Windows 原生架构未知，无法安全选择安装包';
  if (target.arch !== 'x64' && target.arch !== 'arm64') {
    return 'Windows x86（32 位）没有官方安装包';
  }
  return null;
}

function getTargetStatus(target) {
  if (target && target.platform === 'darwin' && target.arch === 'arm64') return 'experimental';
  if (target && target.platform === 'darwin' && target.arch === 'x64') return 'not-tested';
  if (target && target.isWindows === true && (target.arch === 'x64' || target.arch === 'arm64')) return 'supported';
  return 'unsupported';
}

function getWindowsCompatibilityReason(target) {
  if (!target || target.isWindows !== true) return null;
  if (!Number.isInteger(target.windowsBuild)) {
    if (target.windowsBuildRead === true) {
      return '无法确认 Windows 版本，继续前请确认系统支持 MSIX';
    }
    return null;
  }
  if (target.windowsBuild < 17763) {
    return '当前 Windows 版本低于 Windows 10 1809，Claude/Codex MSIX 可能无法运行';
  }
  return null;
}

module.exports = {
  detectTarget,
  getWindowsBuild,
  getUnsupportedTargetReason,
  getTargetStatus,
  getWindowsCompatibilityReason,
  normalizeArch,
};
