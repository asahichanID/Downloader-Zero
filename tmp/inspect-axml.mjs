import fs from 'fs';
import JSZip from 'jszip';

async function main() {
  const buf = fs.readFileSync('public/DownloaderZero.apk');
  const zip = await JSZip.loadAsync(buf);
  const manifest = await zip.file('AndroidManifest.xml').async('nodebuffer');

  let offset = 8;
  const chunkType = manifest.readUInt32LE(offset);
  const chunkSize = manifest.readUInt32LE(offset + 4);
  const stringCount = manifest.readUInt32LE(offset + 8);
  const styleCount = manifest.readUInt32LE(offset + 12);
  const flags = manifest.readUInt32LE(offset + 16);
  const stringsStart = offset + manifest.readUInt32LE(offset + 20);
  const isUtf8 = (flags & (1 << 8)) !== 0;

  const stringOffsets = [];
  for (let i = 0; i < stringCount; i++) {
    stringOffsets.push(manifest.readUInt32LE(offset + 28 + i * 4));
  }
  const strings = [];
  for (let i = 0; i < stringCount; i++) {
    const strOffset = stringsStart + stringOffsets[i];
    if (isUtf8) {
      let charLen = manifest[strOffset];
      let strStart = strOffset + 2;
      let byteLen = manifest[strOffset + 1];
      strings.push(manifest.toString('utf8', strStart, strStart + byteLen));
    } else {
      const len = manifest.readUInt16LE(strOffset);
      strings.push(manifest.toString('utf16le', strOffset + 2, strOffset + 2 + len * 2));
    }
  }

  let cur = offset + chunkSize;
  while (cur < manifest.length) {
    const cType = manifest.readUInt16LE(cur);
    const cSize = manifest.readUInt32LE(cur + 4);
    if (cSize <= 0) break;
    if (cType === 0x0102) {
      const nameIdx = manifest.readInt32LE(cur + 20);
      const attrCount = manifest.readUInt16LE(cur + 28);
      const tagName = strings[nameIdx];
      for (let a = 0; a < attrCount; a++) {
        const aOffset = cur + 36 + a * 20;
        if (aOffset + 20 > manifest.length) break;
        const aNameIdx = manifest.readInt32LE(aOffset + 4);
        const aRawValIdx = manifest.readInt32LE(aOffset + 8);
        const aDataType = manifest[aOffset + 15];
        const aData = manifest.readUInt32LE(aOffset + 16);
        const attrName = strings[aNameIdx];
        if (attrName === 'icon' || attrName === 'roundIcon' || attrName === 'label' || attrName === 'name') {
          console.log(`Tag <${tagName}> attr ${attrName}: type=0x${aDataType.toString(16)}, data=0x${aData.toString(16)}, rawVal=${strings[aRawValIdx]}`);
        }
      }
    }
    cur += cSize;
  }
}

main().catch(console.error);
