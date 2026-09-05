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
  },
};

function getArtifact(softwareName, target) {
  const software = SOFTWARE_MANIFEST[softwareName];
  if (!software || !target || target.platform !== 'win32') return null;
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
