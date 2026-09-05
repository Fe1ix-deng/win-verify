'use strict';

const https = require('node:https');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DRY_RUN = process.argv.includes('--dry-run');

const SOFTWARE_CONFIG = [
  {
    name: 'CC Switch',
    repoOwner: 'farion1231',
    repoName: 'cc-switch',
    filePattern: /Windows\.msi$/i,
    excludePattern: /arm64/i,
    installPath: path.win32.join('C:\\', 'Program Files', 'CC-Switch', 'CC-Switch.exe'),
    autoInstall: true,
  },
  {
    name: 'Claude Desktop',
    repoOwner: 'Wangnov',
    repoName: 'claude-app-mirror',
    filePattern: /Claude-win-x64\.msix$/i,
    excludePattern: null,
    installPath: path.win32.join(
      process.env.LOCALAPPDATA || 'C:\\Users\\Default\\AppData\\Local',
      'Programs',
      'claude-desktop',
      'Claude.exe',
    ),
    autoInstall: false,
  },
  {
    name: 'Codex',
    repoOwner: 'Wangnov',
    repoName: 'codex-app-mirror',
    filePattern: /OpenAI\.Codex.*x64.*\.Msix$/i,
    excludePattern: /arm64/i,
    installPath: path.win32.join(
      process.env.LOCALAPPDATA || 'C:\\Users\\Default\\AppData\\Local',
      'Programs',
      'codex',
      'Codex.exe',
    ),
    autoInstall: false,
  },
];

const INSTALL_PATH = SOFTWARE_CONFIG[0].installPath;
const RELEASE_API_URL = `https://api.github.com/repos/${SOFTWARE_CONFIG[0].repoOwner}/${SOFTWARE_CONFIG[0].repoName}/releases/latest`;
const REQUEST_TIMEOUT_MS = 15_000;

class ApiResponseFormatError extends Error {
  constructor() {
    super('API 响应格式异常');
    this.name = 'ApiResponseFormatError';
    this.code = 'INVALID_API_RESPONSE';
  }
}

class WindowsInstallerNotFoundError extends Error {
  constructor() {
    super('未找到 Windows 版本下载链接');
    this.name = 'WindowsInstallerNotFoundError';
    this.code = 'WINDOWS_INSTALLER_NOT_FOUND';
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function explainMsiExitCode(code) {
  const codes = {
    0: '安装成功',
    1602: '用户取消了安装',
    1603: '安装时发生致命错误',
    1618: '另一个安装程序正在运行',
    1619: '无法打开安装包',
    1622: '无法打开日志文件',
    1625: '此安装被系统策略禁止',
    3010: '需要重启才能完成安装',
  };
  return codes[code] || `未知错误（代码 ${code}）`;
}

/**
 * Check whether the expected Windows executable exists.
 * Missing files are a normal "not installed" result; other filesystem
 * failures are surfaced to the caller.
 */
async function checkInstalled(installPath = INSTALL_PATH) {
  try {
    await fs.promises.access(installPath, fs.constants.F_OK);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function requestRelease(apiUrl, httpsGet) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    let request;
    try {
      request = httpsGet(
        apiUrl,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'cc-switch-installer/0.1',
          },
        },
        (response) => {
          let body = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => {
            body += chunk;
          });
          response.on('error', fail);
          response.on('end', () => {
            if (settled) return;
            if (response.statusCode < 200 || response.statusCode >= 300) {
              fail(new Error(`HTTP ${response.statusCode}${response.statusMessage ? ` ${response.statusMessage}` : ''}`));
              return;
            }
            settled = true;
            resolve(body);
          });
        },
      );
    } catch (error) {
      fail(error);
      return;
    }

    request.on('error', fail);
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error(`请求超时（${REQUEST_TIMEOUT_MS / 1000} 秒）`));
    });
  });
}

/**
 * Fetch and normalize the latest GitHub Release metadata.
 * The optional httpsGet argument is injectable for deterministic tests.
 */
async function getLatestVersion(
  repoOwner,
  repoName,
  filePattern,
  excludePattern = null,
  httpsGet = https.get,
) {
  const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`;
  const body = await requestRelease(apiUrl, httpsGet);
  let release;
  try {
    release = JSON.parse(body);
  } catch (_error) {
    throw new ApiResponseFormatError();
  }

  if (
    !release
    || typeof release.tag_name !== 'string'
    || release.tag_name.length === 0
    || !Array.isArray(release.assets)
  ) {
    throw new ApiResponseFormatError();
  }

  const setupAsset = release.assets.find(
    (asset) => asset
      && typeof asset.name === 'string'
      && filePattern.test(asset.name)
      && (!excludePattern || !excludePattern.test(asset.name))
      && typeof asset.browser_download_url === 'string',
  );

  if (!setupAsset) {
    throw new WindowsInstallerNotFoundError();
  }

  const checksumAsset = release.assets.find(
    (asset) => asset
      && asset.name === 'SHA256SUMS.txt'
      && typeof asset.browser_download_url === 'string',
  );

  return {
    version: release.tag_name,
    downloadUrl: setupAsset.browser_download_url,
    checksumUrl: checksumAsset ? checksumAsset.browser_download_url : null,
  };
}

function markRetryable(error) {
  if (error && typeof error === 'object') {
    error.retryable = true;
    return error;
  }
  const wrapped = new Error(String(error));
  wrapped.retryable = true;
  return wrapped;
}

function contentRangeTotal(contentRange) {
  const match = typeof contentRange === 'string' && contentRange.match(/\/([0-9]+)$/);
  return match ? Number(match[1]) : 0;
}

/**
 * 下载文件，支持断点续传和进度显示
 * @param {string} url - 下载链接
 * @param {string} destPath - 目标路径
 * @param {Function} httpsGet - 可选的 HTTPS 请求实现，便于测试
 * @returns {Promise<void>}
 */
async function downloadFile(url, destPath, httpsGet = https.get) {
  // Check the remote size first so a completed local file does not issue an
  // invalid range request (which some servers reject with HTTP 416).
  const getRemoteSize = (currentUrl, redirectCount = 0) => new Promise((resolve, reject) => {
    let request;
    try {
      request = httpsGet(
        currentUrl,
        {
          method: 'HEAD',
          headers: {
            'User-Agent': 'cc-switch-installer/0.1',
          },
        },
        (response) => {
          const statusCode = response.statusCode || 0;
          if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
            response.resume();
            if (redirectCount >= 5) {
              reject(new Error('重定向次数过多'));
              return;
            }
            const nextUrl = new URL(response.headers.location, currentUrl).toString();
            getRemoteSize(nextUrl, redirectCount + 1).then(resolve, reject);
            return;
          }

          const contentLength = Number(response.headers['content-length']);
          // A 206 response describes a range payload, not necessarily the
          // complete file. Treat it as unknown for compatibility with servers
          // that incorrectly answer HEAD with 206.
          const known = statusCode !== 206;
          resolve({
            size: known && Number.isFinite(contentLength) && contentLength >= 0 ? contentLength : 0,
            known,
          });
        },
      );
    } catch (error) {
      reject(error);
      return;
    }

    request.on('error', reject);
    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new Error('HEAD 请求超时')));
  });

  const remoteSizeInfo = await getRemoteSize(url);
  const { size: remoteSize, known: remoteSizeKnown } = remoteSizeInfo;

  let existingSize = 0;
  try {
    existingSize = (await fs.promises.stat(destPath)).size;
    if (existingSize > 0) {
      if (remoteSizeKnown && existingSize === remoteSize) {
        console.log('[提示] 文件已下载完成，跳过下载');
        return;
      }
      if (remoteSizeKnown && existingSize > remoteSize) {
        console.log(`[提示] 本地文件损坏（${formatBytes(existingSize)} > ${formatBytes(remoteSize)}），重新下载`);
        await fs.promises.unlink(destPath);
        existingSize = 0;
      } else {
        console.log(`[提示] 发现未完成的下载，从 ${formatBytes(existingSize)} 继续`);
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };

    const requestUrl = (currentUrl, offset, redirectCount = 0) => {
      let request;
      try {
        request = httpsGet(
          currentUrl,
          {
            headers: {
              'User-Agent': 'cc-switch-installer/0.1',
              ...(offset > 0 && { Range: `bytes=${offset}-` }),
            },
          },
          (response) => {
            const statusCode = response.statusCode || 0;
            if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
              response.resume();
              if (redirectCount >= 5) {
                finish(new Error('重定向次数过多'));
                return;
              }
              const nextUrl = new URL(response.headers.location, currentUrl).toString();
              requestUrl(nextUrl, offset, redirectCount + 1);
              return;
            }

            if (statusCode !== 200 && statusCode !== 206) {
              response.resume();
              finish(new Error(`HTTP ${statusCode}${response.statusMessage ? ` ${response.statusMessage}` : ''}`));
              return;
            }

            const resumed = offset > 0 && statusCode === 206;
            const startOffset = resumed ? offset : 0;
            if (offset > 0 && !resumed) {
              console.log('\n[提示] 服务器不支持断点续传，从头开始下载');
            }

            const contentLength = Number(response.headers['content-length']);
            const totalSize = Number.isFinite(contentLength) && contentLength >= 0
              ? startOffset + contentLength
              : contentRangeTotal(response.headers['content-range']);
            let downloadedSize = startOffset;
            let stream;
            try {
              stream = fs.createWriteStream(destPath, { flags: resumed ? 'a' : 'w' });
            } catch (error) {
              finish(error.code === 'ENOSPC' ? new Error('磁盘空间不足') : error);
              return;
            }

            const writeProgress = () => {
              const percent = totalSize > 0
                ? Math.min(100, Math.floor((downloadedSize / totalSize) * 100))
                : 0;
              process.stdout.write(`\r[下载] ${percent}% (${formatBytes(downloadedSize)} / ${formatBytes(totalSize)})`);
            };
            writeProgress();

            let streamSettled = false;
            const failDownload = (error) => {
              if (streamSettled) return;
              streamSettled = true;
              stream.destroy();
              if (error && error.code === 'ENOSPC') {
                finish(new Error('磁盘空间不足'));
              } else {
                finish(markRetryable(error));
              }
            };

            stream.on('error', failDownload);
            response.on('error', failDownload);
            response.on('aborted', () => failDownload(new Error('网络连接中断')));
            response.on('data', (chunk) => {
              if (streamSettled) return;
              downloadedSize += chunk.length;
              try {
                if (!stream.write(chunk) && typeof response.pause === 'function') {
                  response.pause();
                  stream.once('drain', () => response.resume());
                }
                writeProgress();
              } catch (error) {
                failDownload(error);
              }
            });
            response.on('end', () => {
              if (streamSettled) return;
              stream.end(async () => {
                if (streamSettled) return;
                try {
                  const actualSize = (await fs.promises.stat(destPath)).size;
                  if (totalSize > 0 && actualSize !== totalSize) {
                    const error = new Error(`文件大小校验失败: 期望 ${formatBytes(totalSize)}，实际 ${formatBytes(actualSize)}`);
                    error.code = 'FILE_SIZE_MISMATCH';
                    throw error;
                  }
                  streamSettled = true;
                  process.stdout.write('\n');
                  finish();
                } catch (error) {
                  streamSettled = true;
                  finish(error);
                }
              });
            });
          },
        );
      } catch (error) {
        finish(markRetryable(error));
        return;
      }

      request.on('error', (error) => finish(markRetryable(error)));
      request.setTimeout(REQUEST_TIMEOUT_MS, () => {
        request.destroy(markRetryable(new Error(`请求超时（${REQUEST_TIMEOUT_MS / 1000} 秒）`)));
      });
    };

    requestUrl(url, existingSize);
  });
}

/**
 * 安装 MSI 文件（仅 Windows）
 * @param {string} msiPath - MSI 文件路径
 * @param {Function} spawnProcess - 可选的进程启动实现，便于测试
 * @param {string} platform - 可选的平台标识，便于测试
 * @returns {Promise<void>}
 */
async function installMsi(msiPath, spawnProcess = spawn, platform = process.platform) {
  if (platform !== 'win32') {
    throw new Error('MSI 安装仅支持 Windows 平台');
  }

  if (DRY_RUN) {
    console.log('[模拟] 将执行命令: msiexec /i "' + msiPath + '" /qn /norestart');
    console.log('[模拟] 安装成功（模拟）');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return;
  }

  return new Promise((resolve, reject) => {
    console.log('[安装] 正在安装 CC Switch...');
    console.log('[提示] 安装过程可能需要管理员权限，请在 UAC 弹窗中点击"是"');

    let msiexec;
    try {
      msiexec = spawnProcess('msiexec', [
        '/i',
        msiPath,
        '/qn',
        '/norestart',
      ], {
        stdio: 'inherit',
      });
    } catch (error) {
      reject(new Error(`无法启动安装程序: ${error.message}`));
      return;
    }

    msiexec.on('error', (error) => {
      reject(new Error(`无法启动安装程序: ${error.message}`));
    });

    msiexec.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const error = new Error(`安装失败: ${explainMsiExitCode(code)}`);
      error.exitCode = code;
      reject(error);
    });
  });
}

/**
 * 安装 NSIS EXE 文件（仅 Windows）
 * @param {string} exePath - EXE 安装包路径
 * @param {Function} spawnProcess - 可选的进程启动实现，便于测试
 * @param {string} platform - 可选的平台标识，便于测试
 * @returns {Promise<void>}
 */
async function installExe(exePath, spawnProcess = spawn, platform = process.platform) {
  if (platform !== 'win32') {
    throw new Error('EXE 安装仅支持 Windows 平台');
  }

  if (DRY_RUN) {
    console.log('[模拟] 将执行命令: "' + exePath + '" /S');
    console.log('[模拟] 安装成功（模拟）');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return;
  }

  return new Promise((resolve, reject) => {
    console.log('[安装] 正在安装...');
    console.log('[提示] 安装过程可能需要管理员权限，请在 UAC 弹窗中点击"是"');

    let installer;
    try {
      installer = spawnProcess(exePath, ['/S'], {
        stdio: 'inherit',
      });
    } catch (error) {
      reject(new Error(`无法启动安装程序: ${error.message}`));
      return;
    }

    installer.on('error', (error) => {
      reject(new Error(`无法启动安装程序: ${error.message}`));
    });

    installer.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`安装失败，退出码: ${code}`));
      }
    });
  });
}

async function installSoftware(config) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`正在安装: ${config.name}`);
  console.log('='.repeat(50));

  console.log('[检测] 正在检查本地安装...');
  try {
    const installed = await checkInstalled(config.installPath);
    console.log(`[检测] ${config.name} ${installed ? '已安装' : '未安装'}`);
  } catch (error) {
    console.log(`[错误] 无法检查本地安装: ${error.message}`);
  }

  console.log();
  console.log('[版本] 正在获取最新版本...');
  try {
    const latest = await getLatestVersion(
      config.repoOwner,
      config.repoName,
      config.filePattern,
      config.excludePattern,
    );
    console.log(`[版本] 最新版本: ${latest.version}`);
    console.log(`[版本] 下载链接: ${latest.downloadUrl}`);
    console.log(`[版本] 校验文件: ${latest.checksumUrl || '未提供'}`);

    console.log();
    console.log('[下载] 正在下载安装包...');
    const tmpDir = path.join(os.tmpdir(), 'cc-switch-installer');
    await fs.promises.mkdir(tmpDir, { recursive: true });

    const filename = decodeURIComponent(latest.downloadUrl.split('/').pop().split('?')[0]);
    const destPath = path.join(tmpDir, path.basename(filename));

    await downloadFile(latest.downloadUrl, destPath);
    console.log(`[下载] 下载完成: ${destPath}`);

    if (config.autoInstall) {
      if (process.platform === 'win32' || DRY_RUN) {
        console.log();
        try {
          if (/\.msi$/i.test(destPath)) {
            await installMsi(destPath, spawn, DRY_RUN ? 'win32' : process.platform);
          } else if (/\.exe$/i.test(destPath)) {
            await installExe(destPath, spawn, DRY_RUN ? 'win32' : process.platform);
          }
          console.log('[安装] 安装完成！');

          console.log();
          console.log('[验证] 正在验证安装...');
          if (DRY_RUN) {
            console.log('[模拟] 跳过验证（模拟模式）');
          } else {
            const installed = await checkInstalled(config.installPath);
            if (installed) {
              console.log('[验证] ✓ 安装成功');
            } else {
              console.log('[验证] ✗ 安装验证失败，请手动检查');
            }
          }
        } catch (error) {
          console.log(`[错误] 安装失败: ${error.message}`);
          console.log(`[提示] 你可以手动运行安装包: ${destPath}`);
        }
      } else {
        console.log();
        console.log('[提示] 当前系统不是 Windows，跳过安装');
        console.log(`[提示] 安装包已下载到: ${destPath}`);
      }
    } else {
      console.log();
      console.log('[提示] 该软件需要手动安装');
      console.log('[提示] 请双击以下文件完成安装:');
      console.log(`       ${destPath}`);
      if (/\.msix$/i.test(destPath)) {
        console.log('[提示] .msix 文件需要 Windows 10 1809 或更高版本');
      }
    }
  } catch (error) {
    if (error instanceof ApiResponseFormatError || error.code === 'INVALID_API_RESPONSE') {
      console.log('[错误] API 响应格式异常');
    } else if (error instanceof WindowsInstallerNotFoundError || error.code === 'WINDOWS_INSTALLER_NOT_FOUND') {
      console.log(`[错误] 未找到 ${config.name} 的 Windows 版本下载链接`);
    } else {
      console.log(`[错误] ${error.message}`);
    }
  }
}

async function main() {
  if (DRY_RUN) {
    console.log('=== AI 工具一键安装器 v0.1（模拟运行模式）===');
    console.log('[提示] 检测和下载是真实的，但不会真正执行安装');
    console.log('[提示] 要真正安装，请去掉 --dry-run 参数');
  } else {
    console.log('=== AI 工具一键安装器 v0.1 ===');
  }
  console.log('即将安装: CC Switch、Claude Desktop、Codex');
  console.log();

  for (const config of SOFTWARE_CONFIG) {
    try {
      await installSoftware(config);
    } catch (error) {
      console.log(`\n[错误] ${config.name} 安装过程出错: ${error.message}`);
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  if (DRY_RUN) {
    console.log('模拟运行完成！');
    console.log('[提示] 这是模拟运行，没有真正安装软件');
    console.log('[提示] 要真正安装，请运行: node install-all.js');
  } else {
    console.log('下载完成！');
    console.log();
    console.log('=== 下一步操作 ===');
    console.log('1. 如果 Claude Desktop 或 Codex 需要手动安装，请双击上面提示的 .msix 文件');
    console.log('2. 访问你的中转站网站，点击"导入到 CCS"按钮配置 API 密钥');
    console.log('3. 启动 Claude Desktop 或 Codex 开始使用');
  }
  console.log('='.repeat(50));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[错误] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  ApiResponseFormatError,
  INSTALL_PATH,
  RELEASE_API_URL,
  WindowsInstallerNotFoundError,
  checkInstalled,
  downloadFile,
  DRY_RUN,
  explainMsiExitCode,
  formatBytes,
  getLatestVersion,
  installExe,
  installMsi,
  installSoftware,
  main,
  SOFTWARE_CONFIG,
};
