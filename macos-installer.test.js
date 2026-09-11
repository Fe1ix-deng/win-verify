'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  findAppBundle,
  installDmg,
  parseAttachPlist,
  verifyMacApp,
} = require('./macos-installer');

const EXPECTED = {
  architecture: 'arm64',
  bundleId: 'com.ccswitch.desktop',
  bundleExecutable: 'cc-switch',
  appName: 'CC Switch.app',
};

function attachPlist(mountPoint = '/Volumes/CC Switch', device = '/dev/disk5s1') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>system-entities</key><array>
<dict><key>dev-entry</key><string>${device}</string><key>mount-point</key><string>${mountPoint}</string></dict>
</array></dict></plist>`;
}

function createExecFile({ mountPoint, running = false, copyError = null, detachError = null, metadata = EXPECTED } = {}) {
  const calls = [];
  const execFile = (command, args, _options, callback) => {
    calls.push({ command, args });
    const finish = (error, stdout = '') => process.nextTick(() => callback(error, stdout, ''));

    if (command === '/usr/bin/hdiutil' && args[0] === 'attach') {
      finish(null, attachPlist(mountPoint));
      return;
    }
    if (command === '/usr/bin/hdiutil' && args[0] === 'detach') {
      finish(detachError, 'disk ejected');
      return;
    }
    if (command === '/usr/bin/hdiutil' && args[0] === 'info') {
      finish(null, 'framework\ndriver');
      return;
    }
    if (command === '/usr/bin/pgrep') {
      finish(running ? null : Object.assign(new Error('not running'), { code: 1 }), running ? '1234\n' : '');
      return;
    }
    if (command === '/usr/bin/plutil') {
      finish(null, JSON.stringify({
        CFBundleIdentifier: metadata.bundleId,
        CFBundleExecutable: metadata.bundleExecutable,
        LSMinimumSystemVersion: '12.0',
      }));
      return;
    }
    if (command === '/usr/bin/file') {
      finish(null, `${args[0]}: Mach-O universal binary with 2 architectures: [x86_64] [arm64]`);
      return;
    }
    if (command === '/usr/bin/codesign' || command === '/usr/sbin/spctl') {
      finish(null, 'accepted');
      return;
    }
    if (command === '/usr/bin/ditto') {
      if (copyError) {
        finish(copyError);
        return;
      }
      fs.promises.cp(args[0], args[1], { recursive: true }).then(
        () => finish(null),
        (error) => finish(error),
      );
      return;
    }
    throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
  };
  return { execFile, calls };
}

async function createMountedApp(root, appName = 'CC Switch.app') {
  const appPath = path.join(root, appName);
  await fs.promises.mkdir(path.join(appPath, 'Contents', 'MacOS'), { recursive: true });
  await fs.promises.writeFile(path.join(appPath, 'Contents', 'Info.plist'), 'fixture');
  const executablePath = path.join(appPath, 'Contents', 'MacOS', 'cc-switch');
  await fs.promises.writeFile(executablePath, 'fixture');
  await fs.promises.chmod(executablePath, 0o755);
  return appPath;
}

test('parseAttachPlist extracts the real device node and mount point', () => {
  assert.deepEqual(parseAttachPlist(attachPlist('/Volumes/Test', '/dev/disk9s1')), {
    deviceNode: '/dev/disk9s1',
    mountPoint: '/Volumes/Test',
  });
});

test('findAppBundle locates the requested app without guessing a volume name', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'macos-find-'));
  const appPath = await createMountedApp(root);
  assert.equal(await findAppBundle(root, 'CC Switch.app'), appPath);
});

test('verifyMacApp validates Bundle ID, executable, and arm64 slice', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'macos-verify-'));
  const appPath = await createMountedApp(root);
  const { execFile, calls } = createExecFile({ mountPoint: root });

  const result = await verifyMacApp({ appPath, expected: EXPECTED, execFile, fsModule: fs });

  assert.deepEqual(result, {
    bundleId: EXPECTED.bundleId,
    bundleExecutable: EXPECTED.bundleExecutable,
    minimumSystemVersion: '12.0',
    executablePath: path.join(appPath, 'Contents', 'MacOS', 'cc-switch'),
    signature: { codesign: 'passed', spctl: 'passed' },
  });
  assert.equal(calls.some(({ command }) => command === 'sudo'), false);
});

test('installDmg attaches read-only, copies to the user app directory, and detaches', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'macos-install-'));
  const mountPoint = path.join(root, 'mounted');
  const installDir = path.join(root, 'Applications');
  await fs.promises.mkdir(mountPoint, { recursive: true });
  await createMountedApp(mountPoint);
  const { execFile, calls } = createExecFile({ mountPoint });

  const result = await installDmg({
    dmgPath: path.join(root, 'installer.dmg'),
    appName: EXPECTED.appName,
    installDir,
    expected: EXPECTED,
    execFile,
    fsModule: fs,
  });

  assert.equal(result.appPath, path.join(installDir, EXPECTED.appName));
  const attach = calls.find(({ command, args }) => command === '/usr/bin/hdiutil' && args[0] === 'attach');
  assert.deepEqual(attach.args.slice(1, 4), ['-readonly', '-nobrowse', '-plist']);
  assert.equal(attach.args[4], path.join(root, 'installer.dmg'));
  assert.equal(calls.some(({ command, args }) => command === '/usr/bin/ditto' && args[1] === result.appPath), true);
  assert.equal(calls.some(({ command, args }) => command === '/usr/bin/hdiutil' && args[0] === 'detach' && args[1] === '/dev/disk5s1'), true);
});

test('installDmg blocks an existing user application without mounting or overwriting it', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'macos-existing-app-'));
  const installDir = path.join(root, 'Applications');
  const existingAppPath = path.join(installDir, EXPECTED.appName);
  await fs.promises.mkdir(existingAppPath, { recursive: true });
  const { execFile, calls } = createExecFile({ mountPoint: root });

  await assert.rejects(
    installDmg({
      dmgPath: path.join(root, 'installer.dmg'),
      appName: EXPECTED.appName,
      installDir,
      expected: EXPECTED,
      execFile,
      fsModule: fs,
    }),
    (error) => error.code === 'APP_EXISTS' && error.status === 'blocked' && error.appPath === existingAppPath,
  );
  assert.equal(calls.some(({ command }) => command === '/usr/bin/hdiutil'), false);
  assert.equal(await fs.promises.access(existingAppPath).then(() => true, () => false), true);
});

test('installDmg blocks a running app without killing it and still detaches', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'macos-running-'));
  const mountPoint = path.join(root, 'mounted');
  await fs.promises.mkdir(mountPoint, { recursive: true });
  await createMountedApp(mountPoint);
  const { execFile, calls } = createExecFile({ mountPoint, running: true });

  await assert.rejects(
    installDmg({
      dmgPath: path.join(root, 'installer.dmg'),
      appName: EXPECTED.appName,
      installDir: path.join(root, 'Applications'),
      expected: EXPECTED,
      execFile,
      fsModule: fs,
    }),
    (error) => error.code === 'APP_RUNNING' && error.status === 'blocked',
  );
  assert.equal(calls.some(({ command }) => command === 'kill' || command === 'pkill'), false);
  assert.equal(calls.some(({ command, args }) => command === '/usr/bin/hdiutil' && args[0] === 'detach'), true);
});

test('installDmg detaches when ditto fails', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'macos-copy-failure-'));
  const mountPoint = path.join(root, 'mounted');
  await fs.promises.mkdir(mountPoint, { recursive: true });
  await createMountedApp(mountPoint);
  const { execFile, calls } = createExecFile({
    mountPoint,
    copyError: Object.assign(new Error('copy failed'), { code: 'COPY_FAILED' }),
  });

  await assert.rejects(
    installDmg({
      dmgPath: path.join(root, 'installer.dmg'),
      appName: EXPECTED.appName,
      installDir: path.join(root, 'Applications'),
      expected: EXPECTED,
      execFile,
      fsModule: fs,
    }),
    /copy failed/,
  );
  assert.equal(calls.some(({ command, args }) => command === '/usr/bin/hdiutil' && args[0] === 'detach'), true);
});

test('installDmg detaches when no app bundle is found', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'macos-app-missing-'));
  const mountPoint = path.join(root, 'mounted');
  await fs.promises.mkdir(mountPoint, { recursive: true });
  const { execFile, calls } = createExecFile({ mountPoint });

  await assert.rejects(
    installDmg({
      dmgPath: path.join(root, 'installer.dmg'),
      appName: EXPECTED.appName,
      installDir: path.join(root, 'Applications'),
      expected: EXPECTED,
      execFile,
      fsModule: fs,
    }),
    (error) => error.code === 'APP_NOT_FOUND',
  );
  assert.equal(calls.some(({ command, args }) => command === '/usr/bin/hdiutil' && args[0] === 'detach'), true);
});

test('installDmg reports detach failure while preserving the original install error', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'macos-detach-failure-'));
  const mountPoint = path.join(root, 'mounted');
  await fs.promises.mkdir(mountPoint, { recursive: true });
  await createMountedApp(mountPoint);
  const { execFile } = createExecFile({
    mountPoint,
    copyError: new Error('copy failed'),
    detachError: Object.assign(new Error('detach failed'), { code: 'DETACH_FAILED' }),
  });

  await assert.rejects(
    installDmg({
      dmgPath: path.join(root, 'installer.dmg'),
      appName: EXPECTED.appName,
      installDir: path.join(root, 'Applications'),
      expected: EXPECTED,
      execFile,
      fsModule: fs,
    }),
    (error) => /copy failed/.test(error.message) && error.cleanupError.code === 'DETACH_FAILED',
  );
});

test('installDmg removes its temporary work directory after a successful install', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'macos-temp-cleanup-'));
  const mountPoint = path.join(root, 'mounted');
  await fs.promises.mkdir(mountPoint, { recursive: true });
  await createMountedApp(mountPoint);
  const { execFile } = createExecFile({ mountPoint });
  let createdWorkDir;
  let removedWorkDir;
  const fsModule = {
    constants: fs.constants,
    promises: {
      ...fs.promises,
      async mkdtemp(prefix) {
        createdWorkDir = await fs.promises.mkdtemp(prefix);
        return createdWorkDir;
      },
      async rm(target, options) {
        removedWorkDir = target;
        return fs.promises.rm(target, options);
      },
    },
  };

  await installDmg({
    dmgPath: path.join(root, 'installer.dmg'),
    appName: EXPECTED.appName,
    installDir: path.join(root, 'Applications'),
    expected: EXPECTED,
    execFile,
    fsModule,
  });
  assert.equal(removedWorkDir, createdWorkDir);
  assert.equal(await fs.promises.access(createdWorkDir).then(() => true, () => false), false);
});

test('verifyMacApp rejects a Bundle ID mismatch', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'macos-bundle-mismatch-'));
  const appPath = await createMountedApp(root);
  const { execFile } = createExecFile({
    mountPoint: root,
    metadata: { ...EXPECTED, bundleId: 'wrong.bundle' },
  });

  await assert.rejects(
    verifyMacApp({ appPath, expected: EXPECTED, execFile, fsModule: fs }),
    (error) => error.code === 'BUNDLE_ID_MISMATCH',
  );
});
