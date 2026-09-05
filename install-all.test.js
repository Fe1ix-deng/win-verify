'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { fetchText, installSoftware, SOFTWARE_CONFIG, waitForExit } = require('./install-all');
const { detectTarget } = require('./platform-support');

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
      autoInstall: false,
      needsManualStep: false,
    },
    {
      id: 'codex',
      name: 'Codex',
      autoInstall: false,
      needsManualStep: true,
    },
  ]);
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

test('Codex configuration identifies the Microsoft Store manual step', () => {
  const codex = SOFTWARE_CONFIG.find((config) => config.name === 'Codex');

  assert.equal(codex.id, 'codex');
  assert.equal(codex.autoInstall, false);
  assert.equal(codex.needsManualStep, true);
});

test('needsManualStep launches the downloaded installer independently', () => {
  const source = fs.readFileSync('./install-all.js', 'utf8');

  assert.match(source, /spawnProcess\(destPath, \[\], \{\s*stdio: 'ignore',\s*detached: true,\s*\}\)/);
  assert.match(source, /installer\.unref\(\)/);
  assert.match(source, /catch \(error\) \{[\s\S]*无法自动打开安装器/);
});

test('Claude configuration uses the architecture manifest and manual MSIX flow', () => {
  const claude = SOFTWARE_CONFIG.find((config) => config.name === 'Claude Desktop');

  assert.equal(claude.id, 'claude');
  assert.equal(claude.autoInstall, false);
});

test('installSoftware stores manifest downloads in the user Downloads folder', () => {
  const source = fs.readFileSync('./install-all.js', 'utf8');
  const downloadDirPattern = /const downloadDir = options\.downloadDir \|\| path\.join\(os\.homedir\(\), 'Downloads', 'AI工具安装包'\);/g;

  assert.equal(source.match(downloadDirPattern)?.length, 1);
  assert.equal(source.includes("path.join(os.tmpdir(), 'cc-switch-installer')"), false);
  assert.equal(source.includes('const destPath = path.join(downloadDir, artifact.filename);'), true);
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

  await installSoftware(claude, () => { spawnCount += 1; }, {
    target: { platform: 'win32', arch: 'x64', isWindows: true },
    downloadDir,
    downloadFile,
    httpsGet: fakeHttpsGet,
    verifyFileSha256: verifier,
  });
  const destination = path.join(downloadDir, 'Claude-win-x64.msix');
  assert.equal(await fs.promises.access(destination).then(() => true, () => false), false);
  assert.equal(spawnCount, 0);

  await installSoftware(claude, () => { spawnCount += 1; }, {
    target: { platform: 'win32', arch: 'x64', isWindows: true },
    downloadDir,
    downloadFile,
    httpsGet: fakeHttpsGet,
    verifyFileSha256: verifier,
  });
  assert.equal(downloadCount, 2);
});
