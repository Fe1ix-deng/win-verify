'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { assertPeArchitecture, readPeMachine } = require('./verify-pe');

function writeFixture(directory, name, machine, options = {}) {
  const peOffset = 0x80;
  const size = options.truncated ? peOffset + 4 : peOffset + 6;
  const bytes = Buffer.alloc(size);
  if (!options.badDosSignature) bytes.write('MZ', 0, 'ascii');
  if (!options.missingPeOffset) bytes.writeUInt32LE(peOffset, 0x3c);
  if (!options.badPeSignature && !options.truncated) bytes.write('PE\0\0', peOffset, 'binary');
  if (machine !== undefined && !options.truncated) bytes.writeUInt16LE(machine, peOffset + 4);
  const filePath = path.join(directory, name);
  fs.writeFileSync(filePath, bytes);
  return filePath;
}

function withFixtures(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-pe-'));
  try {
    return callback(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('readPeMachine reads x64 and arm64 machine fields', () => {
  withFixtures((directory) => {
    const x64 = writeFixture(directory, 'x64.exe', 0x8664);
    const arm64 = writeFixture(directory, 'arm64.exe', 0xaa64);

    assert.equal(readPeMachine(x64), 0x8664);
    assert.equal(readPeMachine(arm64), 0xaa64);
  });
});

test('readPeMachine rejects invalid PE signatures', () => {
  withFixtures((directory) => {
    assert.throws(() => readPeMachine(writeFixture(directory, 'bad-mz.exe', 0x8664, {
      badDosSignature: true,
    })), /MZ/);
    assert.throws(() => readPeMachine(writeFixture(directory, 'bad-pe.exe', 0x8664, {
      badPeSignature: true,
    })), /PE/);
    assert.throws(() => readPeMachine(writeFixture(directory, 'short.exe', undefined, {
      truncated: true,
    })), /PE|完整|读取/);
  });
});

test('assertPeArchitecture accepts matching architecture and rejects mismatches', () => {
  withFixtures((directory) => {
    const x64 = writeFixture(directory, 'x64.exe', 0x8664);
    const arm64 = writeFixture(directory, 'arm64.exe', 0xaa64);

    assert.equal(assertPeArchitecture(x64, 'x64'), 0x8664);
    assert.equal(assertPeArchitecture(arm64, 'arm64'), 0xaa64);
    assert.throws(() => assertPeArchitecture(x64, 'arm64'), /arm64|架构|machine/i);
    assert.throws(() => assertPeArchitecture(x64, 'x86'), /架构|architecture|x64|arm64/i);
  });
});

test('CLI exits successfully for a matching fixture and fails for a mismatch', () => {
  withFixtures((directory) => {
    const x64 = writeFixture(directory, 'x64.exe', 0x8664);
    const script = path.join(__dirname, 'verify-pe.js');

    execFileSync(process.execPath, [script, x64, 'x64'], { stdio: 'pipe' });
    assert.throws(() => execFileSync(process.execPath, [script, x64, 'arm64'], {
      encoding: 'utf8',
      stdio: 'pipe',
    }), /架构|architecture|machine|arm64/i);
  });
});
