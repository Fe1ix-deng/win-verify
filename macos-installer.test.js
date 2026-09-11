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

function createExecFile({
  mountPoint,
  running = false,
  copyError = null,
  copyErrorAfterPartial = false,
  detachError = null,
  attachOutput = null,
  metadata = EXPECTED,
  destinationMetadata = null,
  destinationPath = null,
  codesignError = null,
  spctlError = null,
  infoOutputs = null,
} = {}) {
  const calls = [];
  let infoCallCount = 0;
  const execFile = (command, args, _options, callback) => {
    calls.push({ command, args });
    const finish = (error, stdout = '') => process.nextTick(() => callback(error, stdout, ''));

    if (command === '/usr/bin/hdiutil' && args[0] === 'attach') {
      finish(null, attachOutput || attachPlist(mountPoint));
      return;
    }
    if (command === '/usr/bin/hdiutil' && args[0] === 'detach') {
      finish(detachError, 'disk ejected');
      return;
    }
    if (command === '/usr/bin/hdiutil' && args[0] === 'info') {
      const output = infoOutputs
        ? infoOutputs[Math.min(infoCallCount++, infoOutputs.length - 1)]
        : 'framework\ndriver';
      finish(null, output);
      return;
    }
    if (command === '/usr/bin/pgrep') {
      finish(running ? null : Object.assign(new Error('not running'), { code: 1 }), running ? '1234\n' : '');
      return;
    }
    if (command === '/usr/bin/plutil') {
      const metadataForPath = destinationMetadata
        && destinationPath
        && args.at(-1).startsWith(destinationPath)
        ? destinationMetadata
        : metadata;
      finish(null, JSON.stringify({
        CFBundleIdentifier: metadataForPath.bundleId,
        CFBundleExecutable: metadataForPath.bundleExecutable,
        LSMinimumSystemVersion: '12.0',
      }));
      return;
    }
    if (command === '/usr/bin/file') {
      finish(null, `${args[0]}: Mach-O universal binary with 2 architectures: [x86_64] [arm64]`);
      return;
    }
    if (command === '/usr/bin/codesign') {
      finish(codesignError, 'accepted');
      return;
    }
    if (command === '/usr/sbin/spctl') {
      finish(spctlError, 'accepted');
      return;
    }
    if (command === '/usr/bin/ditto') {
      if (copyError) {
        if (copyErrorAfterPartial) {
          fs.promises.cp(args[0], args[1], { recursive: true }).then(
            () => finish(copyError),
            (error) => finish(error),
          );
          return;
        }
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
  const ditto = calls.find(({ command }) => command === '/usr/bin/ditto');
  assert.equal(ditto.args[1], result.appPath);
  assert.equal(calls.some(({ command }) => command === '/bin/mv'), false);
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

test('installDmg detaches when attach output is malformed but exposes mount details', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'macos-attach-malformed-'));
  const mountPoint = path.join(root, 'mounted');
  await fs.promises.mkdir(mountPoint, { recursive: true });
  const malformedAttach = '<plist><dict><key>dev-entry</key><string>/dev/disk5s1</string>';
  const { execFile, calls } = createExecFile({ mountPoint, attachOutput: malformedAttach });

  await assert.rejects(
    installDmg({
      dmgPath: path.join(root, 'installer.dmg'),
      appName: EXPECTED.appName,
      installDir: path.join(root, 'Applications'),
      expected: EXPECTED,
      execFile,
      fsModule: fs,
    }),
    (error) => error.code === 'ATTACH_PLIST_INVALID',
  );
  assert.equal(calls.some(({ command, args }) => command === '/usr/bin/hdiutil' && args[0] === 'detach' && args[1] === '/dev/disk5s1'), true);
});

test('installDmg removes a partial temporary application after ditto fails', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'macos-partial-copy-'));
  const mountPoint = path.join(root, 'mounted');
  const installDir = path.join(root, 'Applications');
  await fs.promises.mkdir(mountPoint, { recursive: true });
  await createMountedApp(mountPoint);
  const copyError = Object.assign(new Error('copy failed after partial write'), { code: 'COPY_FAILED' });
  const { execFile, calls } = createExecFile({ mountPoint, copyError, copyErrorAfterPartial: true });

  await assert.rejects(
    installDmg({
      dmgPath: path.join(root, 'installer.dmg'),
      appName: EXPECTED.appName,
      installDir,
      expected: EXPECTED,
      execFile,
      fsModule: fs,
    }),
    /copy failed after partial write/,
  );
  const ditto = calls.find(({ command }) => command === '/usr/bin/ditto');
  assert.equal(await fs.promises.access(ditto.args[1]).then(() => true, () => false), false);
  assert.equal(await fs.promises.access(path.join(installDir, EXPECTED.appName)).then(() => true, () => false), false);
});

test('installDmg removes an application when destination verification fails', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'macos-destination-verify-'));
  const mountPoint = path.join(root, 'mounted');
  const installDir = path.join(root, 'Applications');
  await fs.promises.mkdir(mountPoint, { recursive: true });
  await createMountedApp(mountPoint);
  const destinationAppPath = path.join(installDir, EXPECTED.appName);
  const { execFile, calls } = createExecFile({
    mountPoint,
    destinationMetadata: { ...EXPECTED, bundleId: 'wrong.destination.bundle' },
    destinationPath: destinationAppPath,
  });

  await assert.rejects(
    installDmg({
      dmgPath: path.join(root, 'installer.dmg'),
      appName: EXPECTED.appName,
      installDir,
      expected: EXPECTED,
      execFile,
      fsModule: fs,
    }),
    (error) => error.code === 'BUNDLE_ID_MISMATCH',
  );
  assert.equal(await fs.promises.access(destinationAppPath).then(() => true, () => false), false);
});

test('installDmg blocks a destination claimed concurrently without overwriting it', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'macos-dangling-symlink-'));
  const installDir = path.join(root, 'Applications');
  const destinationAppPath = path.join(installDir, EXPECTED.appName);
  const userDataPath = path.join(destinationAppPath, 'user-data.txt');
  const fsModule = {
    constants: fs.constants,
    promises: {
      ...fs.promises,
      async mkdir(target, options) {
        if (target === destinationAppPath) {
          await fs.promises.mkdir(target, { recursive: true });
          await fs.promises.writeFile(userDataPath, 'user-owned');
          throw Object.assign(new Error('destination exists'), { code: 'EEXIST' });
        }
        return fs.promises.mkdir(target, options);
      },
    },
  };
  await fs.promises.mkdir(installDir, { recursive: true });
  await createMountedApp(root);
  const { execFile, calls } = createExecFile({ mountPoint: root });

  await assert.rejects(
    installDmg({
      dmgPath: path.join(root, 'installer.dmg'),
      appName: EXPECTED.appName,
      installDir,
      expected: EXPECTED,
      execFile,
      fsModule,
    }),
    (error) => error.code === 'APP_EXISTS' && error.status === 'blocked' && error.appPath === destinationAppPath,
  );
  assert.equal(calls.some(({ command, args }) => command === '/usr/bin/hdiutil' && args[0] === 'detach'), true);
  assert.equal(calls.some(({ command }) => command === '/usr/bin/ditto'), false);
  assert.equal(await fs.promises.readFile(userDataPath, 'utf8'), 'user-owned');
});

test('installDmg preserves a user path if it replaces the claimed destination', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'macos-move-delete-race-'));
  const mountPoint = path.join(root, 'mounted');
  const installDir = path.join(root, 'Applications');
  const destinationAppPath = path.join(installDir, EXPECTED.appName);
  const userDataPath = path.join(destinationAppPath, 'user-data.txt');
  await fs.promises.mkdir(mountPoint, { recursive: true });
  await createMountedApp(mountPoint);
  let destinationLstatCount = 0;
  const fsModule = {
    constants: fs.constants,
    promises: {
      ...fs.promises,
      async lstat(target) {
        if (target === destinationAppPath) {
          destinationLstatCount += 1;
          if (destinationLstatCount === 4) {
            await fs.promises.rm(target, { recursive: true, force: true });
            await fs.promises.mkdir(target, { recursive: true });
            await fs.promises.writeFile(userDataPath, 'user-replaced');
          }
        }
        return fs.promises.lstat(target);
      },
      async rm(target, options) {
        if (target === destinationAppPath) {
          throw new Error('cleanup must be skipped after replacement');
        }
        return fs.promises.rm(target, options);
      },
    },
  };
  const { execFile } = createExecFile({
    mountPoint,
    destinationMetadata: { ...EXPECTED, bundleId: 'wrong.destination.bundle' },
    destinationPath: destinationAppPath,
  });

  await assert.rejects(
    installDmg({
      dmgPath: path.join(root, 'installer.dmg'),
      appName: EXPECTED.appName,
      installDir,
      expected: EXPECTED,
      execFile,
      fsModule,
    }),
    (error) => error.code === 'BUNDLE_ID_MISMATCH',
  );
  assert.equal(await fs.promises.readFile(userDataPath, 'utf8'), 'user-replaced');
});

/*
 * Keep the replacement test above focused on the ownership check. This
 * fixture intentionally rejects any recursive cleanup of the replacement.
 */
test('installDmg does not use mv for destination ownership', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'macos-no-mv-'));
  const mountPoint = path.join(root, 'mounted');
  const installDir = path.join(root, 'Applications');
  await fs.promises.mkdir(mountPoint, { recursive: true });
  await createMountedApp(mountPoint);
  const { execFile, calls } = createExecFile({ mountPoint });

  await installDmg({
    dmgPath: path.join(root, 'installer.dmg'),
    appName: EXPECTED.appName,
    installDir,
    expected: EXPECTED,
    execFile,
    fsModule: fs,
  });
  assert.equal(calls.some(({ command }) => command === '/bin/mv'), false);
});

function infoPlist(imagePath, device = '/dev/disk5s1', mountPoint = '/Volumes/Recovered') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>images</key><array><dict>
<key>image-path</key><string>${imagePath}</string>
<key>system-entities</key><array><dict><key>dev-entry</key><string>${device}</string><key>mount-point</key><string>${mountPoint}</string></dict></array>
</dict></array></dict></plist>`;
}

test('installDmg detaches a newly attached image when attach plist has no details', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'macos-attach-recovery-'));
  const dmgPath = path.join(root, 'installer.dmg');
  const malformedAttach = '<plist><dict><key>unexpected</key><string>value</string></dict></plist>';
  const { execFile, calls } = createExecFile({
    mountPoint: path.join(root, 'mounted'),
    attachOutput: malformedAttach,
    infoOutputs: [
      infoPlist('/tmp/other.dmg', '/dev/disk4s1', '/Volumes/Other'),
      infoPlist(dmgPath),
      'framework\ndriver',
    ],
  });

  await assert.rejects(
    installDmg({
      dmgPath,
      appName: EXPECTED.appName,
      installDir: path.join(root, 'Applications'),
      expected: EXPECTED,
      execFile,
      fsModule: fs,
    }),
    (error) => error.code === 'ATTACH_PLIST_INVALID',
  );
  assert.equal(calls.some(({ command, args }) => command === '/usr/bin/hdiutil' && args[0] === 'detach' && args[1] === '/dev/disk5s1'), true);
});

test('installDmg stops before copying when codesign rejects the app', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'macos-codesign-reject-'));
  const mountPoint = path.join(root, 'mounted');
  const { execFile, calls } = createExecFile({
    mountPoint,
    codesignError: Object.assign(new Error('invalid signature'), { code: 1 }),
  });
  await fs.promises.mkdir(mountPoint, { recursive: true });
  await createMountedApp(mountPoint);

  await assert.rejects(
    installDmg({
      dmgPath: path.join(root, 'installer.dmg'),
      appName: EXPECTED.appName,
      installDir: path.join(root, 'Applications'),
      expected: EXPECTED,
      execFile,
      fsModule: fs,
    }),
    (error) => error.code === 'SIGNATURE_INVALID',
  );
  assert.equal(calls.some(({ command }) => command === '/usr/bin/ditto'), false);
  assert.equal(calls.some(({ command, args }) => command === '/usr/bin/hdiutil' && args[0] === 'detach'), true);
});

test('installDmg stops before copying when Gatekeeper rejects the app', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'macos-spctl-reject-'));
  const mountPoint = path.join(root, 'mounted');
  const { execFile, calls } = createExecFile({
    mountPoint,
    spctlError: Object.assign(new Error('rejected'), { code: 1 }),
  });
  await fs.promises.mkdir(mountPoint, { recursive: true });
  await createMountedApp(mountPoint);

  await assert.rejects(
    installDmg({
      dmgPath: path.join(root, 'installer.dmg'),
      appName: EXPECTED.appName,
      installDir: path.join(root, 'Applications'),
      expected: EXPECTED,
      execFile,
      fsModule: fs,
    }),
    (error) => error.code === 'GATEKEEPER_REJECTED',
  );
  assert.equal(calls.some(({ command }) => command === '/usr/bin/ditto'), false);
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
