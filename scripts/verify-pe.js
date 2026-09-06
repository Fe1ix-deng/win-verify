'use strict';

const fs = require('node:fs');

const MACHINE_BY_ARCHITECTURE = Object.freeze({
  x64: 0x8664,
  arm64: 0xaa64,
});

function readExactly(fd, buffer, offset, length, description) {
  let bytesRead = 0;
  while (bytesRead < length) {
    const count = fs.readSync(fd, buffer, bytesRead, length - bytesRead, offset + bytesRead);
    if (count === 0) {
      throw new Error(`文件过短，无法读取 ${description}`);
    }
    bytesRead += count;
  }
}

function readPeMachine(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const dosSignature = Buffer.alloc(2);
    readExactly(fd, dosSignature, 0, dosSignature.length, 'MZ 签名');
    if (dosSignature.toString('ascii') !== 'MZ') {
      throw new Error('不是有效的 PE 文件：缺少 MZ 签名');
    }

    const peOffsetBuffer = Buffer.alloc(4);
    readExactly(fd, peOffsetBuffer, 0x3c, peOffsetBuffer.length, 'PE 头偏移');
    const peOffset = peOffsetBuffer.readUInt32LE(0);

    const peSignature = Buffer.alloc(4);
    readExactly(fd, peSignature, peOffset, peSignature.length, 'PE 签名');
    if (!peSignature.equals(Buffer.from([0x50, 0x45, 0x00, 0x00]))) {
      throw new Error('不是有效的 PE 文件：缺少 PE 签名');
    }

    const machine = Buffer.alloc(2);
    readExactly(fd, machine, peOffset + 4, machine.length, 'PE machine 字段');
    return machine.readUInt16LE(0);
  } finally {
    fs.closeSync(fd);
  }
}

function assertPeArchitecture(filePath, architecture) {
  if (!Object.prototype.hasOwnProperty.call(MACHINE_BY_ARCHITECTURE, architecture)) {
    throw new Error(`不支持的架构：${architecture}（仅支持 x64 或 arm64）`);
  }
  const machine = readPeMachine(filePath);
  const expectedMachine = MACHINE_BY_ARCHITECTURE[architecture];
  if (machine !== expectedMachine) {
    throw new Error(
      `PE 架构不匹配：期望 ${architecture} (0x${expectedMachine.toString(16)}), `
      + `实际 machine 0x${machine.toString(16)}`,
    );
  }
  return machine;
}

function main(argv) {
  if (argv.length !== 2) {
    throw new Error('用法：node scripts/verify-pe.js <path-to-exe> <x64|arm64>');
  }
  assertPeArchitecture(argv[0], argv[1]);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  assertPeArchitecture,
  readPeMachine,
};
