import fs from 'fs';
import crypto from 'crypto';

// APK Signature Scheme v2 constants
const APK_SIGNING_BLOCK_MAGIC = Buffer.from('APK Sig Block 42');
const APK_SIGNATURE_SCHEME_V2_BLOCK_ID = 0x7109871a;
const RSA_PKCS1_V1_5_WITH_SHA256 = 0x0103;

function u32Prefixed(...buffers) {
  const parts = [];
  for (const b of buffers) {
    const len = Buffer.alloc(4);
    len.writeUInt32LE(b.length, 0);
    parts.push(len, b);
  }
  return Buffer.concat(parts);
}

function idValuePairsU32(pairs) {
  const parts = [];
  for (const [id, value] of pairs) {
    const entryLen = Buffer.alloc(4);
    entryLen.writeUInt32LE(8 + value.length, 0);
    const idBuf = Buffer.alloc(4);
    idBuf.writeUInt32LE(id, 0);
    const valLen = Buffer.alloc(4);
    valLen.writeUInt32LE(value.length, 0);
    parts.push(entryLen, idBuf, valLen, value);
  }
  return Buffer.concat(parts);
}

function idValuePairsU64(pairs) {
  const parts = [];
  for (const [id, value] of pairs) {
    const entryLen = Buffer.alloc(8);
    entryLen.writeBigUInt64LE(BigInt(4 + value.length), 0);
    const idBuf = Buffer.alloc(4);
    idBuf.writeUInt32LE(id, 0);
    parts.push(entryLen, idBuf, value);
  }
  return Buffer.concat(parts);
}

// 1MB chunked content digest
function computeContentDigest(sections) {
  const CHUNK_SIZE = 1024 * 1024;
  const chunkDigests = [];

  for (const section of sections) {
    let offset = 0;
    while (offset < section.length) {
      const chunk = section.subarray(offset, offset + CHUNK_SIZE);
      const h = crypto.createHash('sha256');
      h.update(Buffer.from([0xa5]));
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32LE(chunk.length, 0);
      h.update(lenBuf);
      h.update(chunk);
      chunkDigests.push(h.digest());
      offset += chunk.length;
    }
  }

  const topHash = crypto.createHash('sha256');
  topHash.update(Buffer.from([0x5a]));
  const countBuf = Buffer.alloc(4);
  countBuf.writeUInt32LE(chunkDigests.length, 0);
  topHash.update(countBuf);
  for (const d of chunkDigests) {
    topHash.update(d);
  }
  return topHash.digest();
}

console.log('V2 signer helper functions loaded successfully');
