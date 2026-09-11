'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');

function parseChecksumText(text) {
  const checksums = new Map();
  if (typeof text !== 'string') return checksums;
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^([a-f0-9]{64})\s+\*?(.+?)\s*$/i);
    if (!match) continue;
    checksums.set(match[2], match[1].toLowerCase());
  }
  return checksums;
}

function findChecksumEntry(checksumMap, { softwareName, arch, filename }) {
  if (!(checksumMap instanceof Map)) return null;
  if (softwareName === 'claude') {
    const checksum = checksumMap.get(filename);
    return checksum ? { filename, checksum } : null;
  }
  if (softwareName !== 'codex' || (arch !== 'x64' && arch !== 'arm64')) return null;

  const pattern = new RegExp(`^OpenAI\\.Codex_.+_${arch}__[^\\s]+\\.msix$`, 'i');
  const matches = [...checksumMap.entries()].filter(([entryName]) => pattern.test(entryName) && !/(?:^|[._-])delta(?:[._-]|$)/i.test(entryName));
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    const error = new Error(`Codex 校验清单存在多个 ${arch} 条目，无法确定唯一文件`);
    error.code = 'CHECKSUM_AMBIGUOUS';
    throw error;
  }
  return { filename: matches[0][0], checksum: matches[0][1] };
}

function verifyFileSha256(filePath, expectedHex, fsModule = fs, onVerified = null) {
  return new Promise((resolve, reject) => {
    const expected = typeof expectedHex === 'string' ? expectedHex.trim().toLowerCase() : '';
    const hash = crypto.createHash('sha256');
    let stream;
    try {
      stream = fsModule.createReadStream(filePath);
    } catch (error) {
      reject(error);
      return;
    }
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => {
      const actual = hash.digest('hex');
      if (actual === expected) {
        try {
          if (typeof onVerified === 'function') onVerified({ filePath, expected, actual });
          resolve(true);
        } catch (error) {
          reject(error);
        }
        return;
      }
      const error = new Error(`SHA-256 校验失败: 期望 ${expected || '未提供'}，实际 ${actual}`);
      error.code = 'CHECKSUM_MISMATCH';
      reject(error);
    });
  });
}

module.exports = {
  findChecksumEntry,
  parseChecksumText,
  verifyFileSha256,
};
