'use strict';

const SOFTWARE_MANIFEST = {
  'cc-switch': {
    name: 'CC Switch',
    win32: {
      x64: {
        url: 'https://dl.ccswitch.io/v3.20.1/CC-Switch-v3.20.1-Windows.msi',
        filename: 'CC-Switch-v3.20.1-Windows.msi',
      },
      arm64: {
        url: 'https://dl.ccswitch.io/v3.20.1/CC-Switch-v3.20.1-Windows-arm64.msi',
        filename: 'CC-Switch-v3.20.1-Windows-arm64.msi',
      },
    },
    macos: {
      arm64: {
        url: 'https://github.com/farion1231/cc-switch/releases/download/v3.20.2/CC-Switch-v3.20.2-macOS.dmg',
        filename: 'CC-Switch-v3.20.2-macOS.dmg',
        installerType: 'dmg',
        checksumUrl: null,
        size: 28111538,
        sha256: '847327c8acf320b8f3e1122676dd3921ff4dc7aa02ed1974579c8d7b00894dec',
        architecture: 'arm64',
        sourceRelease: 'https://github.com/farion1231/cc-switch/releases/tag/v3.20.2',
        bundleId: 'com.ccswitch.desktop',
        bundleExecutable: 'cc-switch',
        appName: 'CC Switch.app',
        installPath: '~/Applications/CC Switch.app',
        minimumSystemVersion: '12.0',
      },
    },
  },
  claude: {
    name: 'Claude Desktop',
    win32: {
      x64: {
        url: 'https://claudeapp.agentsmirror.com/latest/win-x64',
        filename: 'Claude-win-x64.msix',
      },
      arm64: {
        url: 'https://claudeapp.agentsmirror.com/latest/win-arm64',
        filename: 'Claude-win-arm64.msix',
      },
    },
    checksumUrl: 'https://claudeapp.agentsmirror.com/latest/checksums',
    macos: {
      arm64: {
        url: 'https://github.com/Wangnov/claude-app-mirror/releases/download/claude-app-v1.46388.4/Claude-mac-universal.dmg',
        filename: 'Claude-mac-universal.dmg',
        installerType: 'dmg',
        checksumUrl: 'https://github.com/Wangnov/claude-app-mirror/releases/download/claude-app-v1.46388.4/SHA256SUMS.txt',
        size: 353897855,
        sha256: 'c5451dba21b8bf4232f8feffbff946dc7be4d6a64ee22d3190954e16f62444c9',
        architecture: 'universal',
        sourceRelease: 'https://github.com/Wangnov/claude-app-mirror/releases/tag/claude-app-v1.46388.4',
        bundleId: 'com.anthropic.claudefordesktop',
        bundleExecutable: 'Claude',
        appName: 'Claude.app',
        installPath: '~/Applications/Claude.app',
        minimumSystemVersion: '12.0',
      },
    },
  },
  codex: {
    name: 'Codex',
    win32: {
      x64: {
        url: 'https://codexapp.agentsmirror.com/latest/win-x64',
        filename: 'Codex-Windows-x64.msix',
      },
      arm64: {
        url: 'https://codexapp.agentsmirror.com/latest/win-arm64',
        filename: 'Codex-Windows-arm64.msix',
      },
    },
    checksumUrl: 'https://codexapp.agentsmirror.com/latest/checksums',
    macos: {
      arm64: {
        url: 'https://github.com/Wangnov/codex-app-mirror/releases/download/codex-app-26.901.51231/Codex-mac-arm64.dmg',
        filename: 'Codex-mac-arm64.dmg',
        installerType: 'dmg',
        checksumUrl: 'https://github.com/Wangnov/codex-app-mirror/releases/download/codex-app-26.901.51231/SHA256SUMS-macos.txt',
        size: 643007873,
        sha256: 'b6ffed73d581047862e85de5b4d322ba431004949a5338736e7059182dff6082',
        architecture: 'arm64',
        sourceRelease: 'https://github.com/Wangnov/codex-app-mirror/releases/tag/codex-app-26.901.51231',
        bundleId: 'com.openai.codex',
        bundleExecutable: 'ChatGPT',
        appName: 'ChatGPT.app',
        installPath: '~/Applications/ChatGPT.app',
        minimumSystemVersion: '13.0',
      },
    },
  },
};

function getArtifact(softwareName, target) {
  const software = SOFTWARE_MANIFEST[softwareName];
  if (!software || !target) return null;
  if (target.platform === 'darwin') {
    const entry = target.arch === 'arm64' && software.macos ? software.macos.arm64 : null;
    if (!entry) return null;
    return {
      name: software.name,
      ...entry,
      checksumMode: 'fixed',
    };
  }
  if (target.platform !== 'win32') return null;
  const entry = software.win32 && software.win32[target.arch];
  if (!entry) return null;
  const installerType = entry.filename.toLowerCase().endsWith('.msi') ? 'msi' : 'msix';
  return {
    name: software.name,
    url: entry.url,
    filename: entry.filename,
    installerType,
    checksumUrl: software.checksumUrl || null,
    checksumMode: software.checksumUrl ? 'text' : null,
  };
}

module.exports = {
  SOFTWARE_MANIFEST,
  getArtifact,
};
