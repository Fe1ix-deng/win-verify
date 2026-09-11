'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile: defaultExecFile } = require('node:child_process');

function execFileAsync(execFile, command, args) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, stdout = '', stderr = '') => {
      if (settled) return;
      settled = true;
      if (error) {
        error.stdout = String(stdout || '');
        error.stderr = String(stderr || '');
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    };

    try {
      execFile(command, args, { encoding: 'utf8' }, finish);
    } catch (error) {
      finish(error);
    }
  });
}

function decodeXml(value) {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function plistString(dict, key) {
  const pattern = new RegExp(`<key>${key}</key>\\s*<string>([\\s\\S]*?)</string>`);
  const match = dict.match(pattern);
  return match ? decodeXml(match[1]) : null;
}

function parseAttachPlist(plist) {
  const dictionaries = String(plist).match(/<dict>[\s\S]*?<\/dict>/g) || [];
  for (const dictionary of dictionaries) {
    const deviceNode = plistString(dictionary, 'dev-entry');
    const mountPoint = plistString(dictionary, 'mount-point');
    if (deviceNode && mountPoint) return { deviceNode, mountPoint };
  }

  const error = new Error('hdiutil attach 返回的 plist 缺少设备节点或挂载点');
  error.code = 'ATTACH_PLIST_INVALID';
  throw error;
}

async function findAppBundle(rootPath, appName = null, fsModule = fs) {
  const entries = await fsModule.promises.readdir(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory() && entry.name.endsWith('.app')) {
      if (!appName || entry.name === appName) return entryPath;
      continue;
    }
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      const nested = await findAppBundle(entryPath, appName, fsModule);
      if (nested) return nested;
    }
  }
  return null;
}

async function readMacAppMetadata(appPath, execFile) {
  const infoPlist = path.join(appPath, 'Contents', 'Info.plist');
  let result;
  try {
    result = await execFileAsync(execFile, '/usr/bin/plutil', [
      '-convert',
      'json',
      '-o',
      '-',
      '--',
      infoPlist,
    ]);
  } catch (error) {
    error.code = error.code || 'INFO_PLIST_READ_FAILED';
    throw error;
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    error.code = 'INFO_PLIST_INVALID';
    throw error;
  }
}

function makeMacError(message, code, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

async function checkArm64Executable(executablePath, execFile) {
  let output;
  try {
    output = await execFileAsync(execFile, '/usr/bin/file', [executablePath]);
  } catch (error) {
    throw makeMacError(`无法读取主可执行文件架构: ${error.message}`, 'ARCHITECTURE_CHECK_FAILED', { cause: error });
  }
  if (!/\barm64\b/i.test(output.stdout)) {
    throw makeMacError(`应用主可执行文件不包含 arm64 架构: ${executablePath}`, 'ARCHITECTURE_MISMATCH');
  }
}

async function verifyMacApp({
  appPath,
  expected,
  execFile = defaultExecFile,
  fsModule = fs,
  verifySecurity = true,
} = {}) {
  if (!appPath || !expected) throw new TypeError('appPath 和 expected 是必需参数');
  const metadata = await readMacAppMetadata(appPath, execFile);

  if (metadata.CFBundleIdentifier !== expected.bundleId) {
    throw makeMacError(
      `Bundle ID 校验失败: 期望 ${expected.bundleId}，实际 ${metadata.CFBundleIdentifier || '未提供'}`,
      'BUNDLE_ID_MISMATCH',
    );
  }
  if (metadata.CFBundleExecutable !== expected.bundleExecutable) {
    throw makeMacError(
      `主可执行文件校验失败: 期望 ${expected.bundleExecutable}，实际 ${metadata.CFBundleExecutable || '未提供'}`,
      'BUNDLE_EXECUTABLE_MISMATCH',
    );
  }
  if (expected.minimumSystemVersion && metadata.LSMinimumSystemVersion !== expected.minimumSystemVersion) {
    throw makeMacError(
      `最低 macOS 版本校验失败: 期望 ${expected.minimumSystemVersion}，实际 ${metadata.LSMinimumSystemVersion || '未提供'}`,
      'MINIMUM_SYSTEM_VERSION_MISMATCH',
    );
  }

  const executablePath = path.join(appPath, 'Contents', 'MacOS', expected.bundleExecutable);
  try {
    await fsModule.promises.access(executablePath, fsModule.constants.X_OK || fs.constants.F_OK);
  } catch (error) {
    throw makeMacError(`找不到主可执行文件: ${executablePath}`, 'EXECUTABLE_MISSING', { cause: error });
  }

  if (expected.architecture === 'arm64' || expected.architecture === 'universal') {
    await checkArm64Executable(executablePath, execFile);
  }

  const signature = { codesign: 'skipped', spctl: 'skipped' };
  if (verifySecurity) {
    try {
      await execFileAsync(execFile, '/usr/bin/codesign', [
        '--verify',
        '--deep',
        '--strict',
        appPath,
      ]);
      signature.codesign = 'passed';
    } catch (error) {
      throw makeMacError(`无法验证应用签名，未继续安装: ${error.message}`, 'SIGNATURE_INVALID', { cause: error });
    }

    try {
      await execFileAsync(execFile, '/usr/sbin/spctl', [
        '--assess',
        '--type',
        'execute',
        appPath,
      ]);
      signature.spctl = 'passed';
    } catch (error) {
      throw makeMacError(`Gatekeeper 校验失败，未继续安装: ${error.message}`, 'GATEKEEPER_REJECTED', { cause: error });
    }
  }

  return {
    bundleId: metadata.CFBundleIdentifier,
    bundleExecutable: metadata.CFBundleExecutable,
    minimumSystemVersion: metadata.LSMinimumSystemVersion || null,
    executablePath,
    signature,
  };
}

async function ensureMacAppNotRunning(executableName, execFile) {
  try {
    await execFileAsync(execFile, '/usr/bin/pgrep', ['-x', executableName]);
  } catch (error) {
    if (error && error.code === 1) return;
    throw makeMacError(`无法检查应用运行状态: ${error.message}`, 'RUNNING_CHECK_FAILED', { cause: error });
  }
  throw makeMacError(
    `${executableName} 正在运行，请退出后重试；安装器不会强制结束应用`,
    'APP_RUNNING',
    { status: 'blocked' },
  );
}

async function installDmg({
  dmgPath,
  appName,
  installDir = path.join(os.homedir(), 'Applications'),
  expected,
  execFile = defaultExecFile,
  fsModule = fs,
  platform = process.platform,
  verifySecurity = true,
} = {}) {
  if (platform !== 'darwin') throw new Error('DMG 安装仅支持 macOS 平台');
  if (!dmgPath || !expected) throw new TypeError('dmgPath 和 expected 是必需参数');

  const workDir = await fsModule.promises.mkdtemp(path.join(os.tmpdir(), 'cc-switch-macos-'));
  let attached = null;
  let result;
  let failure = null;

  try {
    await fsModule.promises.mkdir(installDir, { recursive: true });
    const attachResult = await execFileAsync(execFile, '/usr/bin/hdiutil', [
      'attach',
      '-readonly',
      '-nobrowse',
      '-plist',
      dmgPath,
    ]);
    attached = parseAttachPlist(attachResult.stdout);

    const mountedAppPath = await findAppBundle(attached.mountPoint, appName, fsModule);
    if (!mountedAppPath) {
      throw makeMacError(`挂载点中未找到 ${appName || '.app'}`, 'APP_NOT_FOUND');
    }

    const sourceMetadata = await verifyMacApp({
      appPath: mountedAppPath,
      expected,
      execFile,
      fsModule,
      verifySecurity,
    });
    await ensureMacAppNotRunning(expected.bundleExecutable, execFile);

    const destinationAppPath = path.join(installDir, appName || path.basename(mountedAppPath));
    await execFileAsync(execFile, '/usr/bin/ditto', [mountedAppPath, destinationAppPath]);
    const destinationMetadata = await verifyMacApp({
      appPath: destinationAppPath,
      expected,
      execFile,
      fsModule,
      verifySecurity,
    });

    result = {
      appPath: destinationAppPath,
      mountPoint: attached.mountPoint,
      metadata: destinationMetadata,
      sourceMetadata,
    };
  } catch (error) {
    failure = error;
  }

  if (attached) {
    try {
      await execFileAsync(execFile, '/usr/bin/hdiutil', ['detach', attached.deviceNode, '-force']);
      const info = await execFileAsync(execFile, '/usr/bin/hdiutil', ['info']);
      if (info.stdout.includes(attached.deviceNode)) {
        throw makeMacError(`DMG 卸载后仍检测到设备节点: ${attached.deviceNode}`, 'DETACH_FAILED');
      }
    } catch (error) {
      if (failure) {
        failure.cleanupError = error;
      } else {
        failure = error;
      }
    }
  }

  try {
    await fsModule.promises.rm(workDir, { recursive: true, force: true });
  } catch (error) {
    if (failure) {
      failure.cleanupError = failure.cleanupError || error;
    } else {
      failure = makeMacError(`无法清理临时目录: ${error.message}`, 'TEMP_CLEANUP_FAILED', { cause: error });
    }
  }

  if (failure) throw failure;
  return result;
}

module.exports = {
  ensureMacAppNotRunning,
  findAppBundle,
  installDmg,
  parseAttachPlist,
  verifyMacApp,
};
