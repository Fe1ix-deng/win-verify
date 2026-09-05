'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  ApiResponseFormatError,
  WindowsInstallerNotFoundError,
  checkInstalled,
  downloadFile,
  explainMsiExitCode,
  getLatestVersion,
  installExe,
  installMsi,
  SOFTWARE_CONFIG,
} = require('./install-cc-switch');

function createHttpsGet({ body, statusCode = 200, statusMessage = 'OK' }) {
  return (_url, _options, callback) => {
    const request = new EventEmitter();
    request.setTimeout = () => request;

    process.nextTick(() => {
      const response = new EventEmitter();
      response.statusCode = statusCode;
      response.statusMessage = statusMessage;
      response.setEncoding = () => {};
      response.resume = () => {};
      callback(response);
      response.emit('data', body);
      response.emit('end');
    });

    return request;
  };
}

test('checkInstalled returns true for an existing file and false otherwise', async () => {
  const tempDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cc-switch-'));
  const executablePath = path.join(tempDirectory, 'CC-Switch.exe');
  await fs.promises.writeFile(executablePath, '');

  assert.equal(await checkInstalled(executablePath), true);
  assert.equal(await checkInstalled(path.join(tempDirectory, 'missing.exe')), false);
});

test('getLatestVersion extracts a matching asset for the requested repository', async () => {
  const body = JSON.stringify({
    tag_name: 'v1.2.3',
    assets: [
      { name: 'CC-Switch-Windows.msi', browser_download_url: 'https://example.com/windows.msi' },
      { name: 'CC-Switch-Windows-arm64.msi', browser_download_url: 'https://example.com/arm64.msi' },
      { name: 'SHA256SUMS.txt', browser_download_url: 'https://example.com/SHA256SUMS.txt' },
    ],
  });

  const result = await getLatestVersion(
    'farion1231',
    'cc-switch',
    /Windows\.msi$/i,
    /arm64/i,
    createHttpsGet({ body }),
  );

  assert.deepEqual(result, {
    version: 'v1.2.3',
    downloadUrl: 'https://example.com/windows.msi',
    checksumUrl: 'https://example.com/SHA256SUMS.txt',
  });
});

test('getLatestVersion reports malformed JSON', async () => {
  await assert.rejects(
    getLatestVersion('farion1231', 'cc-switch', /Windows\.msi$/i, null, createHttpsGet({ body: '{invalid' })),
    ApiResponseFormatError,
  );
});

function createDownloadHttpsGet({ body, statusCode = 200 }) {
  const fakeGet = (_url, options, callback) => {
    const request = new EventEmitter();
    request.setTimeout = () => request;
    request.destroy = (error) => request.emit('error', error);

    process.nextTick(() => {
      const response = new EventEmitter();
      response.statusCode = statusCode;
      response.statusMessage = 'OK';
      response.headers = { 'content-length': String(body.length) };
      response.resume = () => {};
      callback(response);
      response.emit('data', body);
      response.emit('end');
    });

    fakeGet.lastOptions = options;
    return request;
  };
  return fakeGet;
}

test('downloadFile writes a new file and sends progress output', { concurrency: false }, async () => {
  const tempDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cc-switch-download-'));
  const destination = path.join(tempDirectory, 'installer.msi');
  const originalWrite = process.stdout.write;
  let output = '';
  process.stdout.write = (chunk) => {
    output += chunk;
    return true;
  };

  try {
    await downloadFile('https://example.com/installer.msi', destination, createDownloadHttpsGet({ body: Buffer.from('installer') }));
  } finally {
    process.stdout.write = originalWrite;
  }

  assert.equal(await fs.promises.readFile(destination, 'utf8'), 'installer');
  assert.match(output, /\[下载\] 100%/);
});

test('downloadFile resumes an existing partial file with a Range header', async () => {
  const tempDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cc-switch-download-'));
  const destination = path.join(tempDirectory, 'installer.msi');
  await fs.promises.writeFile(destination, 'part');
  const requestFactory = createDownloadHttpsGet({ body: Buffer.from('ial') , statusCode: 206 });

  await downloadFile('https://example.com/installer.msi', destination, requestFactory);

  assert.equal(await fs.promises.readFile(destination, 'utf8'), 'partial');
  assert.equal(requestFactory.lastOptions.headers.Range, 'bytes=4-');
});

test('getLatestVersion reports a missing Windows installer', async () => {
  const body = JSON.stringify({ tag_name: 'v1.2.3', assets: [] });

  await assert.rejects(
    getLatestVersion('farion1231', 'cc-switch', /Windows\.msi$/i, /arm64/i, createHttpsGet({ body })),
    WindowsInstallerNotFoundError,
  );
});

test('getLatestVersion supports MSIX asset patterns and excludes ARM builds', async () => {
  const body = JSON.stringify({
    tag_name: 'v2.0.0',
    assets: [
      { name: 'OpenAI.Codex-1.0.0-arm64.Msix', browser_download_url: 'https://example.com/arm64.msix' },
      { name: 'OpenAI.Codex-1.0.0-x64.Msix', browser_download_url: 'https://example.com/codex.msix' },
    ],
  });

  const result = await getLatestVersion(
    'Wangnov',
    'codex-app-mirror',
    /OpenAI\.Codex.*x64.*\.Msix$/i,
    /arm64/i,
    createHttpsGet({ body }),
  );

  assert.equal(result.downloadUrl, 'https://example.com/codex.msix');
  assert.equal(result.checksumUrl, null);
});

test('explainMsiExitCode describes common Windows Installer exit codes', () => {
  assert.equal(explainMsiExitCode(0), '安装成功');
  assert.equal(explainMsiExitCode(1602), '用户取消了安装');
  assert.equal(explainMsiExitCode(1625), '此安装被系统策略禁止');
  assert.equal(explainMsiExitCode(9999), '未知错误（代码 9999）');
});

test('installMsi skips non-Windows platforms', async () => {
  await assert.rejects(
    installMsi('/tmp/installer.msi', undefined, 'darwin'),
    /MSI 安装仅支持 Windows 平台/,
  );
});

test('installMsi invokes msiexec and resolves on exit code 0', async () => {
  let invocation;
  const fakeSpawn = (command, args, options) => {
    invocation = { command, args, options };
    const child = new EventEmitter();
    process.nextTick(() => child.emit('close', 0));
    return child;
  };

  await installMsi('C:\\Temp\\CC-Switch-Windows.msi', fakeSpawn, 'win32');

  assert.deepEqual(invocation, {
    command: 'msiexec',
    args: ['/i', 'C:\\Temp\\CC-Switch-Windows.msi', '/qn', '/norestart'],
    options: { stdio: 'inherit' },
  });
});

test('installMsi rejects with the explained exit code', async () => {
  const fakeSpawn = () => {
    const child = new EventEmitter();
    process.nextTick(() => child.emit('close', 1618));
    return child;
  };

  await assert.rejects(
    installMsi('C:\\Temp\\CC-Switch-Windows.msi', fakeSpawn, 'win32'),
    (error) => error.exitCode === 1618 && error.message === '安装失败: 另一个安装程序正在运行',
  );
});

test('installExe rejects on non-Windows platforms', async () => {
  await assert.rejects(
    installExe('/tmp/installer.exe', undefined, 'darwin'),
    /EXE 安装仅支持 Windows 平台/,
  );
});

test('installExe invokes an NSIS installer silently and resolves on exit code 0', async () => {
  let invocation;
  const fakeSpawn = (command, args, options) => {
    invocation = { command, args, options };
    const child = new EventEmitter();
    process.nextTick(() => child.emit('close', 0));
    return child;
  };

  await installExe('C:\\Temp\\Codex-Setup.exe', fakeSpawn, 'win32');

  assert.deepEqual(invocation, {
    command: 'C:\\Temp\\Codex-Setup.exe',
    args: ['/S'],
    options: { stdio: 'inherit' },
  });
});

test('SOFTWARE_CONFIG defines CC Switch, Claude Desktop, and Codex installers', () => {
  assert.deepEqual(SOFTWARE_CONFIG.map(({
    name,
    repoOwner,
    repoName,
    filePattern,
    excludePattern,
    autoInstall,
  }) => ({ name, repoOwner, repoName, filePattern: String(filePattern), excludePattern: String(excludePattern), autoInstall })), [
    {
      name: 'CC Switch',
      repoOwner: 'farion1231',
      repoName: 'cc-switch',
      filePattern: '/Windows\\.msi$/i',
      excludePattern: '/arm64/i',
      autoInstall: true,
    },
    {
      name: 'Claude Desktop',
      repoOwner: 'Wangnov',
      repoName: 'claude-app-mirror',
      filePattern: '/Claude-win-x64\\.msix$/i',
      excludePattern: 'null',
      autoInstall: false,
    },
    {
      name: 'Codex',
      repoOwner: 'Wangnov',
      repoName: 'codex-app-mirror',
      filePattern: '/OpenAI\\.Codex.*x64.*\\.Msix$/i',
      excludePattern: '/arm64/i',
      autoInstall: false,
    },
  ]);
});

test('dry-run MSI installation logs the command without spawning it', () => {
  const output = execFileSync(process.execPath, [
    '-e',
    "require('./install-cc-switch').installMsi('C:\\\\Temp\\\\CC-Switch.msi', () => { throw new Error('spawned'); }, 'win32')",
    '--',
    '--dry-run',
  ], { encoding: 'utf8' });

  assert.match(output, /\[模拟\] 将执行命令: msiexec \/i "C:\\Temp\\CC-Switch\.msi" \/qn \/norestart/);
  assert.match(output, /\[模拟\] 安装成功（模拟）/);
});

test('dry-run EXE installation logs the command without spawning it', () => {
  const output = execFileSync(process.execPath, [
    '-e',
    "require('./install-cc-switch').installExe('C:\\\\Temp\\\\Codex-Setup.exe', () => { throw new Error('spawned'); }, 'win32')",
    '--',
    '--dry-run',
  ], { encoding: 'utf8' });

  assert.match(output, /\[模拟\] 将执行命令: "C:\\Temp\\Codex-Setup\.exe" \/S/);
  assert.match(output, /\[模拟\] 安装成功（模拟）/);
});
