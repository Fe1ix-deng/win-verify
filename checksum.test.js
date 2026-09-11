'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { findChecksumEntry, parseChecksumText, verifyFileSha256 } = require('./checksum');

test('parseChecksumText parses whitespace-separated checksum lines', () => {
  const result = parseChecksumText([
    'A'.repeat(64) + '  Claude-win-x64.msix',
    'b'.repeat(64) + ' *Codex-Windows-arm64.msix',
    'not-a-checksum line',
    'c'.repeat(63) + '  malformed.msix',
    'd'.repeat(64) + '    unrelated-delta.msix',
  ].join('\n'));

  assert.deepEqual([...result.entries()], [
    ['Claude-win-x64.msix', 'a'.repeat(64)],
    ['Codex-Windows-arm64.msix', 'b'.repeat(64)],
    ['unrelated-delta.msix', 'd'.repeat(64)],
  ]);
});

test('verifyFileSha256 streams and accepts matching hash', async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'checksum-'));
  const filePath = path.join(directory, 'artifact.bin');
  await fs.promises.writeFile(filePath, 'hello checksum');

  assert.equal(await verifyFileSha256(
    filePath,
    '2187766ebb93f57fbcb53b559a612bc2f95c4bc306abf35dfa13e7e7ead58ce0',
  ), true);
});

test('verifyFileSha256 reports the actual hash to an optional success callback', async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'checksum-'));
  const filePath = path.join(directory, 'artifact.bin');
  await fs.promises.writeFile(filePath, 'hello checksum');
  let evidence;

  await verifyFileSha256(
    filePath,
    '2187766ebb93f57fbcb53b559a612bc2f95c4bc306abf35dfa13e7e7ead58ce0',
    fs,
    (record) => { evidence = record; },
  );

  assert.deepEqual(evidence, {
    filePath,
    expected: '2187766ebb93f57fbcb53b559a612bc2f95c4bc306abf35dfa13e7e7ead58ce0',
    actual: '2187766ebb93f57fbcb53b559a612bc2f95c4bc306abf35dfa13e7e7ead58ce0',
  });
});

test('verifyFileSha256 rejects a mismatch with stable error code', async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'checksum-'));
  const filePath = path.join(directory, 'artifact.bin');
  await fs.promises.writeFile(filePath, 'hello checksum');

  await assert.rejects(
    verifyFileSha256(filePath, '0'.repeat(64)),
    (error) => error.code === 'CHECKSUM_MISMATCH',
  );
});

test('findChecksumEntry matches Codex native MSIX names by architecture', () => {
  const checksums = parseChecksumText([
    `${'1'.repeat(64)}  OpenAI.Codex_26.901.5280.0_x64__2p2nqsd0c76g0.Msix`,
    `${'2'.repeat(64)}  OpenAI.Codex_26.901.5280.0_arm64__2p2nqsd0c76g0.Msix`,
    `${'3'.repeat(64)}  OpenAI.Codex_26.901.5280.0_x64__2p2nqsd0c76g0.delta.Msix`,
  ].join('\n'));
  assert.deepEqual(findChecksumEntry(checksums, {
    softwareName: 'codex',
    arch: 'x64',
    filename: 'Codex-Windows-x64.msix',
  }), {
    filename: 'OpenAI.Codex_26.901.5280.0_x64__2p2nqsd0c76g0.Msix',
    checksum: '1'.repeat(64),
  });
  assert.equal(findChecksumEntry(checksums, {
    softwareName: 'codex',
    arch: 'arm64',
    filename: 'Codex-Windows-arm64.msix',
  }).checksum, '2'.repeat(64));
});

test('findChecksumEntry reports missing and ambiguous Codex entries', () => {
  const missing = parseChecksumText(`${'1'.repeat(64)}  OpenAI.Codex_26.901.5280.0_x64__publisher.Msix`);
  assert.equal(findChecksumEntry(missing, { softwareName: 'codex', arch: 'arm64', filename: 'Codex-Windows-arm64.msix' }), null);

  const ambiguous = parseChecksumText([
    `${'1'.repeat(64)}  OpenAI.Codex_26.901.5280.0_x64__publisher.Msix`,
    `${'2'.repeat(64)}  OpenAI.Codex_26.902.5280.0_x64__publisher.Msix`,
  ].join('\n'));
  assert.throws(
    () => findChecksumEntry(ambiguous, { softwareName: 'codex', arch: 'x64', filename: 'Codex-Windows-x64.msix' }),
    (error) => error.code === 'CHECKSUM_AMBIGUOUS',
  );
});

test('findChecksumEntry uses exact filename matching for Claude', () => {
  const checksums = parseChecksumText(`${'a'.repeat(64)}  Claude-win-x64.msix\n${'b'.repeat(64)}  Claude-win-arm64.msix`);
  assert.equal(findChecksumEntry(checksums, { softwareName: 'claude', arch: 'x64', filename: 'Claude-win-x64.msix' }).checksum, 'a'.repeat(64));
  assert.equal(findChecksumEntry(checksums, { softwareName: 'claude', arch: 'arm64', filename: 'Claude-win-arm64.msix' }).checksum, 'b'.repeat(64));
});
