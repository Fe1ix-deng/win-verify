'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  fetchText,
  installMsix,
  installSoftware,
  INSTALL_PATH,
  main,
  SOFTWARE_CONFIG,
  summarizeInstallResults,
  waitForExit,
} = require('./install-all');
const { detectTarget } = require('./platform-support');

async function writeMacArtifact(destination, size) {
  await fs.promises.writeFile(destination, 'dmg');
  await fs.promises.truncate(destination, size);
}

test('waitForExit waits for a keypress before closing readline', async () => {
  const input = new EventEmitter();
  const output = {
    text: '',
    write(chunk) {
      this.text += chunk;
      return true;
    },
    isTTY: true,
    isRaw: false,
    setRawMode(raw) {
      this.isRaw = raw;
    },
  };
  let readlineClosed = false;
  let createdWith;
  const readlineModule = {
    emitKeypressEvents(stream) {
      assert.equal(stream, input);
    },
    createInterface(options) {
      createdWith = options;
      return {
        close() {
          readlineClosed = true;
        },
      };
    },
  };

  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = (raw) => {
    input.isRaw = raw;
  };

  const waiting = waitForExit({ input, output, readlineModule });
  let resolved = false;
  waiting.then(() => {
    resolved = true;
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(resolved, false);
  assert.match(output.text, /按任意键退出\.\.\./);
  assert.equal(createdWith.input, input);
  assert.equal(createdWith.output, output);
  assert.equal(input.isRaw, true);

  input.emit('keypress', 'x', { name: 'x' });
  await waiting;

  assert.equal(readlineClosed, true);
  assert.equal(input.isRaw, false);
});

test('fetchText follows relative HTTP redirects and returns the final body', async () => {
  const calls = [];
  const fakeHttpsGet = (url, _options, callback) => {
    calls.push(url);
    const request = new EventEmitter();
    request.setTimeout = () => request;
    process.nextTick(() => {
      const response = new EventEmitter();
      response.setEncoding = () => {};
      response.resume = () => {};
      if (calls.length === 1) {
        response.statusCode = 302;
        response.headers = { location: '/r2/checksums' };
      } else {
        response.statusCode = 200;
        response.headers = {};
      }
      callback(response);
      if (response.statusCode === 200) response.emit('data', 'checksum text');
      response.emit('end');
    });
    return request;
  };

  assert.equal(await fetchText('https://codexapp.agentsmirror.com/latest/checksums', fakeHttpsGet), 'checksum text');
  assert.deepEqual(calls, [
    'https://codexapp.agentsmirror.com/latest/checksums',
    'https://codexapp.agentsmirror.com/r2/checksums',
  ]);
});

test('fetchText rejects after the redirect limit', async () => {
  const fakeHttpsGet = (url, _options, callback) => {
    const request = new EventEmitter();
    request.setTimeout = () => request;
    process.nextTick(() => {
      const response = new EventEmitter();
      response.statusCode = 302;
      response.headers = { location: url };
      response.setEncoding = () => {};
      response.resume = () => {};
      callback(response);
      response.emit('end');
    });
    return request;
  };
  await assert.rejects(fetchText('https://example.com/checksums', fakeHttpsGet), /重定向次数过多/);
});

test('SOFTWARE_CONFIG identifies manifest-backed installers', () => {
  assert.deepEqual(SOFTWARE_CONFIG.map((config) => ({
    id: config.id,
    name: config.name,
    autoInstall: config.autoInstall,
    needsManualStep: config.needsManualStep || false,
  })), [
    {
      id: 'cc-switch',
      name: 'CC Switch',
      autoInstall: true,
      needsManualStep: false,
    },
    {
      id: 'claude',
      name: 'Claude Desktop',
      autoInstall: true,
      needsManualStep: false,
    },
    {
      id: 'codex',
      name: 'Codex',
      autoInstall: true,
      needsManualStep: false,
    },
  ]);
});

test('CC Switch MSI uses its per-user installation path', () => {
  assert.equal(
    INSTALL_PATH,
    path.win32.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'CC Switch', 'CC-Switch.exe'),
  );
  assert.equal(INSTALL_PATH.includes('Program Files'), false);
});

test('dry-run completion points to install-all.js', () => {
  const output = execFileSync(process.execPath, [
    '-e',
    "console.log(require('./install-all').DRY_RUN ? 'node install-all.js' : 'real')",
    '--',
    '--dry-run',
  ], { encoding: 'utf8' });

  assert.match(output, /node install-all\.js/);
});

test('--print-target emits target JSON without starting installation', () => {
  const output = execFileSync(process.execPath, ['install-all.js', '--print-target'], {
    cwd: path.dirname(__filename),
    env: {
      ...process.env,
      HOME: path.join(os.tmpdir(), 'installer-print-target-home'),
      USERPROFILE: path.join(os.tmpdir(), 'installer-print-target-home'),
    },
    encoding: 'utf8',
    timeout: 2_000,
  });

  const target = JSON.parse(output);
  assert.deepEqual(target, detectTarget());
  assert.equal(typeof target.platform, 'string');
  assert.equal(typeof target.arch, 'string');
  assert.equal(typeof target.isWindows, 'boolean');
  assert.doesNotMatch(output, /下载|安装|https?:\/\//);
});

function captureConsoleOutput() {
  const lines = [];
  const originalLog = console.log;
  console.log = (...args) => { lines.push(args.join(' ')); };
  return {
    lines,
    restore() {
      console.log = originalLog;
    },
  };
}

test('main CI mode collects three successful results without waiting for keyboard input', async () => {
  const output = captureConsoleOutput();
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;
  let waitCalled = false;
  try {
    const summary = await main({
      ci: true,
      install: async () => ({ status: 'installed' }),
      wait: async () => {
        waitCalled = true;
      },
    });

    assert.equal(waitCalled, false);
    assert.equal(summary.overall, 'passed');
    assert.equal(process.exitCode, 0);
    assert.match(output.lines.join('\n'), /CC Switch: installed/);
    assert.match(output.lines.join('\n'), /Claude Desktop: installed/);
    assert.match(output.lines.join('\n'), /Codex: installed/);
    assert.match(output.lines.join('\n'), /overall: passed/);
  } finally {
    output.restore();
    process.exitCode = originalExitCode;
  }
});

test('main CI mode exits non-zero when any result is failed', async () => {
  const output = captureConsoleOutput();
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;
  let index = 0;
  try {
    const summary = await main({
      ci: true,
      install: async () => ({ status: ['installed', 'failed', 'installed'][index++] }),
      wait: async () => { throw new Error('CI mode must not wait'); },
    });

    assert.equal(summary.overall, 'failed');
    assert.equal(process.exitCode, 1);
    assert.match(output.lines.join('\n'), /Claude Desktop: failed/);
    assert.match(output.lines.join('\n'), /失败的软件: Claude Desktop/);
    assert.match(output.lines.join('\n'), /overall: failed/);
  } finally {
    output.restore();
    process.exitCode = originalExitCode;
  }
});

test('main CI mode exits non-zero and explains blocked applications', async () => {
  const output = captureConsoleOutput();
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;
  let index = 0;
  try {
    const summary = await main({
      ci: true,
      install: async () => ({ status: ['installed', 'blocked', 'installed'][index++] }),
      wait: async () => { throw new Error('CI mode must not wait'); },
    });

    assert.equal(summary.overall, 'failed');
    assert.equal(process.exitCode, 1);
    assert.match(output.lines.join('\n'), /Claude Desktop: blocked/);
    assert.match(output.lines.join('\n'), /阻塞的软件: Claude Desktop/);
    assert.match(output.lines.join('\n'), /退出对应应用后重试/);
  } finally {
    output.restore();
    process.exitCode = originalExitCode;
  }
});

test('experimental is support metadata, not an installation success status', () => {
  const summary = summarizeInstallResults(SOFTWARE_CONFIG.map((config) => ({
    config,
    result: { status: config.id === 'claude' ? 'experimental' : 'installed' },
  })));

  assert.equal(summary.overall, 'failed');
  assert.deepEqual(summary.failed.map(({ config }) => config.name), ['Claude Desktop']);
});

test('ordinary mode keeps the interactive wait after reporting a real summary', async () => {
  const output = captureConsoleOutput();
  let waitCalled = false;
  try {
    const summary = await main({
      ci: false,
      install: async () => ({ status: 'already-installed' }),
      wait: async () => {
        waitCalled = true;
      },
    });

    assert.equal(summary.overall, 'passed');
    assert.equal(waitCalled, true);
    assert.match(output.lines.join('\n'), /overall: passed/);
  } finally {
    output.restore();
  }
});

test('Claude and Codex configurations use automatic installation', () => {
  const codex = SOFTWARE_CONFIG.find((config) => config.name === 'Codex');
  const claude = SOFTWARE_CONFIG.find((config) => config.name === 'Claude Desktop');

  assert.equal(codex.id, 'codex');
  assert.equal(codex.autoInstall, true);
  assert.equal(codex.needsManualStep, undefined);
  assert.equal(claude.autoInstall, true);
});

test('MSIX installation is dispatched through installMsix', () => {
  const source = fs.readFileSync('./install-all.js', 'utf8');

  assert.match(source, /installMsix\(destPath, spawnProcess, target\.platform\)/);
  assert.doesNotMatch(source, /spawnProcess\(destPath, \[\], \{\s*stdio: 'ignore',\s*detached: true,\s*\}\)/);
  assert.doesNotMatch(source, /installer\.unref\(\)/);
});

test('Claude configuration uses the architecture manifest and automatic MSIX flow', () => {
  const claude = SOFTWARE_CONFIG.find((config) => config.name === 'Claude Desktop');

  assert.equal(claude.id, 'claude');
  assert.equal(claude.autoInstall, true);
});

test('installMsix rejects non-Windows platforms without spawning', async () => {
  let spawnCount = 0;

  await assert.rejects(
    installMsix('/tmp/installer.msix', () => { spawnCount += 1; }, 'darwin'),
    /MSIX 安装仅支持 Windows 平台/,
  );
  assert.equal(spawnCount, 0);
});

test('installMsix invokes PowerShell with the raw MSIX path for x64 and ARM64', async () => {
  const invocations = [];
  const fakeSpawn = (command, args, options) => {
    invocations.push({ command, args, options });
    const child = new EventEmitter();
    process.nextTick(() => child.emit('close', 0));
    return child;
  };

  for (const msixPath of ['C:\\Temp\\Claude-win-x64.msix', 'C:\\Temp\\Codex-Windows-arm64.msix']) {
    await installMsix(msixPath, fakeSpawn, 'win32');
  }

  assert.deepEqual(invocations.map(({ command, args, options }) => ({ command, args, options })), [
    {
      command: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        "Add-AppxPackage -Path 'C:\\Temp\\Claude-win-x64.msix' -ErrorAction Stop",
      ],
      options: { stdio: 'inherit' },
    },
    {
      command: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        "Add-AppxPackage -Path 'C:\\Temp\\Codex-Windows-arm64.msix' -ErrorAction Stop",
      ],
      options: { stdio: 'inherit' },
    },
  ]);
});

test('installMsix resolves on PowerShell exit code 0 and rejects non-zero exit codes', async () => {
  const fakeSpawn = (_command, _args, _options) => {
    const child = new EventEmitter();
    process.nextTick(() => child.emit('close', 17));
    return child;
  };

  await assert.rejects(
    installMsix('C:\\Temp\\installer.msix', fakeSpawn, 'win32'),
    (error) => error.exitCode === 17 && /退出码: 17/.test(error.message),
  );
});

test('installMsix converts PowerShell error events into readable errors', async () => {
  const fakeSpawn = (_command, _args, _options) => {
    const child = new EventEmitter();
    process.nextTick(() => child.emit('error', new Error('powershell unavailable')));
    return child;
  };

  await assert.rejects(
    installMsix('C:\\Temp\\installer.msix', fakeSpawn, 'win32'),
    /无法启动 MSIX 安装: powershell unavailable/,
  );
});

test('dry-run MSIX installation logs PowerShell without spawning', () => {
  const output = execFileSync(process.execPath, [
    '-e',
    "require('./install-all').installMsix('C:\\\\Temp\\\\installer.msix', () => { throw new Error('spawned'); }, 'win32')",
    '--',
    '--dry-run',
  ], { encoding: 'utf8' });

  assert.match(output, /Add-AppxPackage -Path 'C:\\Temp\\installer\.msix' -ErrorAction Stop/);
  assert.match(output, /C:\\Temp\\installer\.msix/);
  assert.doesNotMatch(output, /spawned/);
});

test('Claude and Codex installSoftware use PowerShell MSIX installation on Windows', async () => {
  const invocations = [];
  const fakeSpawn = (command, args, options) => {
    invocations.push({ command, args, options });
    const child = new EventEmitter();
    process.nextTick(() => child.emit('close', 0));
    return child;
  };
  const fakeHttpsGet = (_url, _options, callback) => {
    const request = new EventEmitter();
    request.setTimeout = () => request;
    process.nextTick(() => {
      const response = new EventEmitter();
      response.statusCode = 200;
      response.setEncoding = () => {};
      callback(response);
      response.emit('data', '');
      response.emit('end');
    });
    return request;
  };

  for (const config of SOFTWARE_CONFIG.filter((entry) => entry.id === 'claude' || entry.id === 'codex')) {
    const downloadDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'installer-msix-'));
    await installSoftware(config, fakeSpawn, {
      target: { platform: 'win32', arch: 'x64', isWindows: true },
      downloadDir,
      downloadFile: async (_url, destination) => fs.promises.writeFile(destination, 'msix'),
      httpsGet: fakeHttpsGet,
    });
  }

  assert.equal(invocations.length, 2);
  assert.deepEqual(invocations.map((invocation) => invocation.command), ['powershell.exe', 'powershell.exe']);
  assert.match(invocations[0].args.find((arg) => /Claude-win-x64\.msix/.test(arg)), /Claude-win-x64\.msix/);
  assert.match(invocations[1].args.find((arg) => /Codex-Windows-x64\.msix/.test(arg)), /Codex-Windows-x64\.msix/);
});

test('installSoftware stores manifest downloads in the user Downloads folder', () => {
  const source = fs.readFileSync('./install-all.js', 'utf8').replace(/\r\n/g, '\n');
  const downloadDirPattern = /downloadDir = options\.downloadDir \|\| \(isMacOs\n\s*\? await fs\.promises\.mkdtemp\([\s\S]*?\n\s*: path\.join\(os\.homedir\(\), 'Downloads', 'AI工具安装包'\)\);/g;

  assert.equal(source.match(downloadDirPattern)?.length, 1);
  assert.equal(source.includes("path.join(os.tmpdir(), 'cc-switch-installer')"), false);
  assert.equal(source.includes('destPath = path.join(downloadDir, artifact.filename);'), true);
});

test('installSoftware skips unsupported Windows x86 before download', async () => {
  let downloaded = false;
  await installSoftware(SOFTWARE_CONFIG[0], undefined, {
    target: { platform: 'win32', arch: 'x86', isWindows: true },
    downloadFile: async () => { downloaded = true; },
  });
  assert.equal(downloaded, false);
});

test('installSoftware skips non-Windows targets without spawning installers', async () => {
  let downloaded = false;
  let spawned = false;
  await installSoftware(SOFTWARE_CONFIG[0], () => { spawned = true; }, {
    target: { platform: 'darwin', arch: 'x64', isWindows: false },
    downloadFile: async () => { downloaded = true; },
  });
  assert.equal(downloaded, false);
  assert.equal(spawned, false);
});

test('installSoftware preflights legacy Windows before downloading MSIX', async () => {
  let downloaded = false;
  const claude = SOFTWARE_CONFIG.find((config) => config.id === 'claude');
  await installSoftware(claude, undefined, {
    target: { platform: 'win32', arch: 'x64', isWindows: true, windowsBuild: 17134 },
    downloadFile: async () => { downloaded = true; },
  });
  assert.equal(downloaded, false);
});

test('installSoftware reads and blocks legacy Windows before downloading Claude and Codex MSIX', async () => {
  let downloaded = false;
  for (const id of ['claude', 'codex']) {
    const config = SOFTWARE_CONFIG.find((entry) => entry.id === id);
    const target = detectTarget({
      platform: 'win32',
      arch: 'x64',
      windowsBuildReader: () => 7601,
    });
    await installSoftware(config, undefined, {
      target,
      downloadDir: await fs.promises.mkdtemp(path.join(os.tmpdir(), 'installer-test-')),
      downloadFile: async () => { downloaded = true; },
    });
  }
  assert.equal(downloaded, false);
});

test('installSoftware reports unknown Windows build before downloading MSIX', async () => {
  let downloaded = false;
  let output = '';
  const originalLog = console.log;
  console.log = (...args) => { output += `${args.join(' ')}\n`; };
  try {
    const claude = SOFTWARE_CONFIG.find((config) => config.id === 'claude');
    const target = detectTarget({
      platform: 'win32',
      arch: 'x64',
      windowsBuildReader: () => undefined,
    });
    await installSoftware(claude, undefined, {
      target,
      downloadDir: await fs.promises.mkdtemp(path.join(os.tmpdir(), 'installer-test-')),
      downloadFile: async () => { downloaded = true; },
    });
  } finally {
    console.log = originalLog;
  }
  assert.equal(downloaded, false);
  assert.match(output, /无法确认 Windows 版本/);
});

test('installSoftware does not apply MSIX build preflight to CC Switch MSI', async () => {
  let downloaded = false;
  const target = detectTarget({
    platform: 'win32',
    arch: 'x64',
    windowsBuildReader: () => undefined,
  });
  await installSoftware(SOFTWARE_CONFIG[0], undefined, {
    target,
    downloadDir: await fs.promises.mkdtemp(path.join(os.tmpdir(), 'installer-test-')),
    downloadFile: async () => { downloaded = true; },
  });
  assert.equal(downloaded, true);
});

test('installSoftware dispatches the ARM64 MSI artifact on Windows ARM64', async () => {
  let downloadedUrl;
  let spawned;
  const fakeSpawn = (command, args, options) => {
    spawned = { command, args, options };
    const child = new EventEmitter();
    process.nextTick(() => child.emit('close', 0));
    return child;
  };
  const downloadDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'installer-test-'));
  await installSoftware(SOFTWARE_CONFIG[0], fakeSpawn, {
    target: { platform: 'win32', arch: 'arm64', isWindows: true },
    downloadDir,
    downloadFile: async (url) => { downloadedUrl = url; },
  });
  assert.equal(downloadedUrl, 'https://dl.ccswitch.io/v3.20.1/CC-Switch-v3.20.1-Windows-arm64.msi');
  assert.equal(spawned.command, 'msiexec');
  assert.equal(spawned.args[1], path.join(downloadDir, 'CC-Switch-v3.20.1-Windows-arm64.msi'));
});

test('installSoftware blocks MSIX install when checksum verification mismatches', async () => {
  let spawned = false;
  let verified = false;
  const fakeHttpsGet = (_url, _options, callback) => {
    const request = new EventEmitter();
    request.setTimeout = () => request;
    process.nextTick(() => {
      const response = new EventEmitter();
      response.statusCode = 200;
      response.setEncoding = () => {};
      callback(response);
      response.emit('data', `${'a'.repeat(64)}  Claude-win-x64.msix\n`);
      response.emit('end');
    });
    return request;
  };
  const claude = SOFTWARE_CONFIG.find((config) => config.id === 'claude');
  await installSoftware(claude, () => { spawned = true; }, {
    target: { platform: 'win32', arch: 'x64', isWindows: true },
    downloadDir: await fs.promises.mkdtemp(path.join(os.tmpdir(), 'installer-test-')),
    downloadFile: async () => {},
    httpsGet: fakeHttpsGet,
    verifyFileSha256: async () => {
      verified = true;
      const error = new Error('mismatch');
      error.code = 'CHECKSUM_MISMATCH';
      throw error;
    },
  });
  assert.equal(verified, true);
  assert.equal(spawned, false);
});

test('checksum mismatch removes the cached artifact and allows a later retry', async () => {
  let downloadCount = 0;
  let spawnCount = 0;
  const downloadDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'installer-test-'));
  const fakeHttpsGet = (_url, _options, callback) => {
    const request = new EventEmitter();
    request.setTimeout = () => request;
    process.nextTick(() => {
      const response = new EventEmitter();
      response.statusCode = 200;
      response.setEncoding = () => {};
      callback(response);
      response.emit('data', `${'a'.repeat(64)}  Claude-win-x64.msix\n`);
      response.emit('end');
    });
    return request;
  };
  const claude = SOFTWARE_CONFIG.find((config) => config.id === 'claude');
  const downloadFile = async (_url, destination) => {
    downloadCount += 1;
    await fs.promises.writeFile(destination, `cached-${downloadCount}`);
  };
  const verifier = async (_path, _expected) => {
    if (downloadCount === 1) {
      const error = new Error('mismatch');
      error.code = 'CHECKSUM_MISMATCH';
      throw error;
    }
    return true;
  };
  const fakeSpawn = () => {
    spawnCount += 1;
    const child = new EventEmitter();
    process.nextTick(() => child.emit('close', 0));
    return child;
  };

  await installSoftware(claude, fakeSpawn, {
    target: { platform: 'win32', arch: 'x64', isWindows: true },
    downloadDir,
    downloadFile,
    httpsGet: fakeHttpsGet,
    verifyFileSha256: verifier,
  });
  const destination = path.join(downloadDir, 'Claude-win-x64.msix');
  assert.equal(await fs.promises.access(destination).then(() => true, () => false), false);
  assert.equal(spawnCount, 0);

  await installSoftware(claude, fakeSpawn, {
    target: { platform: 'win32', arch: 'x64', isWindows: true },
    downloadDir,
    downloadFile,
    httpsGet: fakeHttpsGet,
    verifyFileSha256: verifier,
  });
  assert.equal(downloadCount, 2);
});

test('installSoftware installs audited macOS arm64 artifacts only after fixed checksum verification', async () => {
  const claude = SOFTWARE_CONFIG.find((config) => config.id === 'claude');
  const downloadDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'installer-macos-'));
  const calls = [];
  const output = captureConsoleOutput();
  const downloadFile = async (url, destination) => {
    calls.push(['download', url]);
    await writeMacArtifact(destination, 353897855);
  };
  const verifyFileSha256 = async (filePath, expected, _fsModule, onVerified) => {
    calls.push(['checksum', filePath, expected]);
    onVerified({ actual: expected });
    return true;
  };
  const installDmg = async (options) => {
    calls.push(['install', options.dmgPath, options.installDir, options.expected.bundleId]);
    return { appPath: path.join(options.installDir, options.appName) };
  };

  let result;
  try {
    result = await installSoftware(claude, () => {
      throw new Error('Windows installer spawned');
    }, {
      target: { platform: 'darwin', arch: 'arm64', isWindows: false },
      downloadDir,
      macInstallDir: path.join(downloadDir, 'Applications'),
      downloadFile,
      verifyFileSha256,
      installDmg,
    });
  } finally {
    output.restore();
  }

  assert.deepEqual(result, {
    status: 'installed',
    supportLevel: 'experimental',
    appPath: path.join(downloadDir, 'Applications', 'Claude.app'),
  });
  assert.deepEqual(calls.map(([name]) => name), ['download', 'checksum', 'install']);
  assert.equal(calls[1][2], 'c5451dba21b8bf4232f8feffbff946dc7be4d6a64ee22d3190954e16f62444c9');
  assert.match(calls[2][1], /Claude-mac-universal\.dmg$/);
  assert.match(calls[2][2], /Applications$/);
  const checksumLine = output.lines.find((line) => line.startsWith('checksum: '));
  assert.ok(checksumLine);
  assert.deepEqual(JSON.parse(checksumLine.slice('checksum: '.length)), {
    application: 'Claude Desktop',
    filename: 'Claude-mac-universal.dmg',
    size: 353897855,
    expected: 'c5451dba21b8bf4232f8feffbff946dc7be4d6a64ee22d3190954e16f62444c9',
    actual: 'c5451dba21b8bf4232f8feffbff946dc7be4d6a64ee22d3190954e16f62444c9',
    status: 'passed',
  });
});

test('installSoftware removes a macOS DMG and skips mounting when fixed checksum fails', async () => {
  const codex = SOFTWARE_CONFIG.find((config) => config.id === 'codex');
  const downloadDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'installer-macos-mismatch-'));
  let installCalled = false;
  await installSoftware(codex, () => {
    throw new Error('Windows installer spawned');
  }, {
    target: { platform: 'darwin', arch: 'arm64', isWindows: false },
    downloadDir,
    downloadFile: async (_url, destination) => writeMacArtifact(destination, 643007873),
    verifyFileSha256: async () => {
      const error = new Error('mismatch');
      error.code = 'CHECKSUM_MISMATCH';
      throw error;
    },
    installDmg: async () => {
      installCalled = true;
    },
  });

  assert.equal(installCalled, false);
  assert.deepEqual(await fs.promises.readdir(downloadDir), []);
});

test('installSoftware reports a running macOS application as blocked without killing it', async () => {
  const ccSwitch = SOFTWARE_CONFIG.find((config) => config.id === 'cc-switch');
  const downloadDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'installer-macos-running-'));
  let output = '';
  const originalLog = console.log;
  console.log = (...args) => { output += `${args.join(' ')}\n`; };
  try {
    const result = await installSoftware(ccSwitch, () => {
      throw new Error('Windows installer spawned');
    }, {
      target: { platform: 'darwin', arch: 'arm64', isWindows: false },
      downloadDir,
      downloadFile: async (_url, destination) => writeMacArtifact(destination, 28111538),
      verifyFileSha256: async () => true,
      installDmg: async () => {
        const error = new Error('CC Switch 正在运行');
        error.code = 'APP_RUNNING';
        error.status = 'blocked';
        throw error;
      },
    });
    assert.equal(result.status, 'blocked');
  } finally {
    console.log = originalLog;
  }
  assert.match(output, /正在运行/);
  assert.match(output, /不会强制结束/);
});

test('installSoftware rejects a truncated macOS DMG before checksum or mount', async () => {
  const claude = SOFTWARE_CONFIG.find((config) => config.id === 'claude');
  const downloadDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'installer-macos-truncated-'));
  let checksumCalled = false;
  let installCalled = false;
  const result = await installSoftware(claude, undefined, {
    target: { platform: 'darwin', arch: 'arm64', isWindows: false },
    downloadDir,
    downloadFile: async (_url, destination) => fs.promises.writeFile(destination, 'partial'),
    verifyFileSha256: async () => { checksumCalled = true; },
    installDmg: async () => { installCalled = true; },
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.code, 'FILE_SIZE_MISMATCH');
  assert.equal(checksumCalled, false);
  assert.equal(installCalled, false);
  assert.deepEqual(await fs.promises.readdir(downloadDir), []);
});
