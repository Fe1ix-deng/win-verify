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

function plistValues(plist, key) {
  const pattern = new RegExp(`<key>${key}</key>\\s*<string>([\\s\\S]*?)</string>`, 'g');
  return [...String(plist).matchAll(pattern)].map((match) => decodeXml(match[1]));
}

function plistString(dict, key) {
  const pattern = new RegExp(`<key>${key}</key>\\s*<string>([\\s\\S]*?)</string>`);
  const match = dict.match(pattern);
  return match ? decodeXml(match[1]) : null;
}

function parsePlistDictionaryTree(plist) {
  const roots = [];
  const stack = [];
  let currentKey = null;
  const tokenPattern = /<dict>|<\/dict>|<key>([\s\S]*?)<\/key>|<string>([\s\S]*?)<\/string>/g;
  for (const match of String(plist).matchAll(tokenPattern)) {
    if (match[0] === '<dict>') {
      const node = { values: {}, children: [] };
      if (stack.length > 0) stack.at(-1).children.push(node);
      else roots.push(node);
      stack.push(node);
      currentKey = null;
      continue;
    }
    if (match[0] === '</dict>') {
      stack.pop();
      currentKey = null;
      continue;
    }
    if (match[1] !== undefined) {
      currentKey = decodeXml(match[1]);
      continue;
    }
    if (match[2] !== undefined && stack.length > 0 && currentKey) {
      stack.at(-1).values[currentKey] = decodeXml(match[2]);
      currentKey = null;
    }
  }
  return roots;
}

function parseHdiutilInfoEntries(plist) {
  const entries = [];
  const visit = (node, inheritedImagePath = null) => {
    const imagePath = node.values['image-path'] || inheritedImagePath;
    if (node.values['dev-entry'] && node.values['mount-point']) {
      entries.push({
        imagePath,
        deviceNode: node.values['dev-entry'],
        mountPoint: node.values['mount-point'],
      });
    }
    for (const child of node.children) visit(child, imagePath);
  };
  for (const root of parsePlistDictionaryTree(plist)) visit(root);
  return entries;
}

function parseAttachPlist(plist) {
  const dictionaries = String(plist).match(/<dict>[\s\S]*?<\/dict>/g) || [];
  for (const dictionary of dictionaries) {
    const deviceNode = plistString(dictionary, 'dev-entry');
    const mountPoint = plistString(dictionary, 'mount-point');
    if (deviceNode && mountPoint) return { deviceNode, mountPoint };
  }

  const deviceNode = plistValues(plist, 'dev-entry')[0] || null;
  const mountPoint = plistValues(plist, 'mount-point')[0] || null;
  if (deviceNode && mountPoint) return { deviceNode, mountPoint };

  const error = new Error('hdiutil attach 返回的 plist 缺少设备节点或挂载点');
  error.code = 'ATTACH_PLIST_INVALID';
  if (deviceNode) error.deviceNode = deviceNode;
  if (mountPoint) error.mountPoint = mountPoint;
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

async function ensureMacInstallDestinationAvailable(appPath, fsModule) {
  try {
    await fsModule.promises.lstat(appPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') return;
    throw makeMacError(`无法检查用户应用目录中的目标路径: ${appPath}`, 'INSTALL_PATH_CHECK_FAILED', { cause: error });
  }
  throw makeMacError(
    `目标应用已存在，请先确认并移除后重试；安装器不会覆盖 ${appPath}`,
    'APP_EXISTS',
    { status: 'blocked', appPath },
  );
}

async function claimMacInstallDestination(appPath, fsModule) {
  try {
    await fsModule.promises.mkdir(appPath);
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      throw makeMacError(
        `目标应用已存在，请先确认并移除后重试；安装器不会覆盖 ${appPath}`,
        'APP_EXISTS',
        { status: 'blocked', appPath },
      );
    }
    throw makeMacError(`无法创建用户应用目录: ${appPath}`, 'INSTALL_PATH_CREATE_FAILED', { cause: error });
  }

  try {
    const stat = await fsModule.promises.lstat(appPath);
    return { dev: stat.dev, ino: stat.ino };
  } catch (error) {
    throw makeMacError(`无法确认用户应用目录: ${appPath}`, 'INSTALL_PATH_CHECK_FAILED', { cause: error });
  }
}

function sameFileIdentity(expected, actual) {
  return Boolean(
    expected
      && actual
      && Number.isInteger(expected.dev)
      && Number.isInteger(expected.ino)
      && expected.dev === actual.dev
      && expected.ino === actual.ino,
  );
}

async function pathExists(appPath, fsModule) {
  try {
    await fsModule.promises.lstat(appPath);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
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

  const knownDestinationAppPath = appName ? path.join(installDir, appName) : null;
  if (knownDestinationAppPath) {
    await ensureMacInstallDestinationAvailable(knownDestinationAppPath, fsModule);
  }

  const workDir = await fsModule.promises.mkdtemp(path.join(os.tmpdir(), 'cc-switch-macos-'));
  let attached = null;
  let result;
  let failure = null;
  let destinationAppPath = knownDestinationAppPath;
  let destinationCreated = false;
  let destinationIdentity = null;

  let beforeAttached = [];
  try {
    const info = await execFileAsync(execFile, '/usr/bin/hdiutil', ['info', '-plist']);
    beforeAttached = parseHdiutilInfoEntries(info.stdout);
  } catch {
    beforeAttached = [];
  }

  const recoverAttachedImage = async (partial = null) => {
    if (partial && (partial.deviceNode || partial.mountPoint)) return partial;
    try {
      const info = await execFileAsync(execFile, '/usr/bin/hdiutil', ['info', '-plist']);
      const current = parseHdiutilInfoEntries(info.stdout);
      const beforeKeys = new Set(beforeAttached.map(({ deviceNode, mountPoint }) => `${deviceNode}\n${mountPoint}`));
      const newEntries = current.filter(({ deviceNode, mountPoint }) => !beforeKeys.has(`${deviceNode}\n${mountPoint}`));
      return newEntries.find((entry) => entry.imagePath === dmgPath) || newEntries[0] || null;
    } catch {
      return null;
    }
  };

  try {
    await fsModule.promises.mkdir(installDir, { recursive: true });
    let attachResult;
    try {
      attachResult = await execFileAsync(execFile, '/usr/bin/hdiutil', [
        'attach',
        '-readonly',
        '-nobrowse',
        '-plist',
        dmgPath,
      ]);
    } catch (error) {
      try {
        attached = parseAttachPlist(error.stdout || error.stderr || '');
      } catch (parseError) {
        if (parseError.deviceNode || parseError.mountPoint) {
          attached = {
            deviceNode: parseError.deviceNode || null,
            mountPoint: parseError.mountPoint || null,
          };
        }
      }
      attached = await recoverAttachedImage(attached);
      throw error;
    }
    try {
      attached = parseAttachPlist(attachResult.stdout);
    } catch (error) {
      attached = {
        deviceNode: error.deviceNode || null,
        mountPoint: error.mountPoint || null,
      };
      attached = await recoverAttachedImage(attached);
      throw error;
    }

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

    destinationAppPath = destinationAppPath || path.join(installDir, path.basename(mountedAppPath));
    await ensureMacInstallDestinationAvailable(destinationAppPath, fsModule);
    destinationIdentity = await claimMacInstallDestination(destinationAppPath, fsModule);
    destinationCreated = true;
    await execFileAsync(execFile, '/usr/bin/ditto', [mountedAppPath, destinationAppPath]);
    await verifyMacApp({
      appPath: destinationAppPath,
      expected,
      execFile,
      fsModule,
      verifySecurity,
    });
    const installedMetadata = await verifyMacApp({
      appPath: destinationAppPath,
      expected,
      execFile,
      fsModule,
      verifySecurity,
    });

    result = {
      appPath: destinationAppPath,
      mountPoint: attached.mountPoint,
      metadata: installedMetadata,
      sourceMetadata,
    };
  } catch (error) {
    failure = error;
  }

  if (attached && (attached.deviceNode || attached.mountPoint)) {
    const detachTarget = attached.deviceNode || attached.mountPoint;
    try {
      await execFileAsync(execFile, '/usr/bin/hdiutil', ['detach', detachTarget, '-force']);
      const info = await execFileAsync(execFile, '/usr/bin/hdiutil', ['info']);
      const stillAttached = (attached.deviceNode && info.stdout.includes(attached.deviceNode))
        || (attached.mountPoint && info.stdout.includes(attached.mountPoint));
      if (stillAttached) {
        throw makeMacError(`DMG 卸载后仍检测到设备节点或挂载点: ${detachTarget}`, 'DETACH_FAILED');
      }
    } catch (error) {
      if (failure) {
        failure.cleanupError = error;
      } else {
        failure = error;
      }
    }
  }

  if (failure && destinationCreated) {
    try {
      let currentIdentity = null;
      try {
        const currentStat = await fsModule.promises.lstat(destinationAppPath);
        currentIdentity = { dev: currentStat.dev, ino: currentStat.ino };
      } catch (error) {
        if (error && error.code !== 'ENOENT') throw error;
      }
      if (sameFileIdentity(destinationIdentity, currentIdentity)) {
        await fsModule.promises.rm(destinationAppPath, { recursive: true, force: true });
      } else if (currentIdentity) {
        failure.cleanupError = makeMacError(
          `检测到用户应用目录已被替换，跳过清理以保护 ${destinationAppPath}`,
          'APP_CLEANUP_SKIPPED',
        );
      }
    } catch (error) {
      if (failure) {
        failure.cleanupError = failure.cleanupError || error;
      } else {
        failure = makeMacError(`无法清理应用临时路径: ${error.message}`, 'APP_CLEANUP_FAILED', { cause: error });
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
  claimMacInstallDestination,
  ensureMacAppNotRunning,
  findAppBundle,
  installDmg,
  parseAttachPlist,
  verifyMacApp,
};
