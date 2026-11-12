import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import JSZip from 'jszip';

console.log('[DZ Packager] Starting official Android APK build & sign...');

const certDir = '/tmp/dz_apk_cert';
if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });

const keyPemPath = path.join(certDir, 'key.pem');
const certPemPath = path.join(certDir, 'cert.pem');
const keyPk8Path = path.join(certDir, 'key.pk8');

if (!fs.existsSync(keyPemPath) || !fs.existsSync(certPemPath)) {
  console.log('[DZ Packager] Generating official release key & certificate...');
  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout "${keyPemPath}" -out "${certPemPath}" -days 10000 -nodes -subj "/C=ID/ST=Jakarta/L=Jakarta/O=DownloaderZero/OU=Mobile/CN=DownloaderZero"`,
    { stdio: 'inherit' }
  );
}

if (!fs.existsSync(keyPk8Path)) {
  execSync(`openssl pkcs8 -topk8 -outform DER -in "${keyPemPath}" -out "${keyPk8Path}" -nocrypt`);
}

// 2. Load Android WebView base APK
const sampleApkPath = '/tmp/sample.apk';
if (!fs.existsSync(sampleApkPath)) {
  execSync(`curl -L -o "${sampleApkPath}" https://github.com/mikespub-archive/android-webview/releases/download/v1.28/app-release.apk`);
}

const sampleApkBuf = fs.readFileSync(sampleApkPath);
const baseZip = await JSZip.loadAsync(sampleApkBuf);

// 3. Load Canvas DZ Logo
const logoDzPath = path.resolve(process.cwd(), 'public/logo_dz.png');
const logoDzBuf = fs.readFileSync(logoDzPath);

// 4. Update resources.arsc
let arscBuf = await baseZip.file('resources.arsc').async('nodebuffer');

function replaceExact(buffer, targetStr, replacementStr) {
  const targetBuf = Buffer.from(targetStr, 'ascii');
  const replBuf = Buffer.from(replacementStr, 'ascii');
  if (targetBuf.length !== replBuf.length) {
    throw new Error(`Length mismatch: ${targetStr} (${targetBuf.length}) vs ${replacementStr} (${replBuf.length})`);
  }
  let pos = 0;
  let count = 0;
  while ((pos = buffer.indexOf(targetBuf, pos)) !== -1) {
    replBuf.copy(buffer, pos);
    pos += replBuf.length;
    count++;
  }
  return count;
}

replaceExact(arscBuf, 'res/BW.xml', 'res/dz.png');
replaceExact(arscBuf, 'res/0K.xml', 'res/dz.png');
replaceExact(arscBuf, 'My WebView', 'Downloader');

// 5. Patch binary AndroidManifest.xml: Set minSdkVersion to 21 (Android 5.0+)
// This guarantees that any Android device (Infinix, Samsung, Xiaomi, Vivo, Oppo) can install without "Gagal mengurai paket"
let manifestBuf = await baseZip.file('AndroidManifest.xml').async('nodebuffer');
const manifestBytes = Buffer.from(manifestBuf);
// Locate uses-sdk dataType 0x10 and value 0x1f (31)
let patchedMinSdk = false;
for (let i = 0; i < manifestBytes.length - 8; i++) {
  if (
    manifestBytes[i] === 0x08 &&
    manifestBytes[i + 1] === 0x00 &&
    manifestBytes[i + 2] === 0x00 &&
    manifestBytes[i + 3] === 0x10 &&
    manifestBytes[i + 4] === 0x1f &&
    manifestBytes[i + 5] === 0x00 &&
    manifestBytes[i + 6] === 0x00 &&
    manifestBytes[i + 7] === 0x00
  ) {
    manifestBytes[i + 4] = 21; // API 21 = Android 5.0+
    patchedMinSdk = true;
    console.log(`[DZ Packager] Successfully patched minSdkVersion to 21 at offset ${i + 4}`);
    break;
  }
}
if (!patchedMinSdk) {
  console.warn('[DZ Packager] Warning: Could not locate minSdkVersion pattern in AXML, retaining default.');
}

// 6. App Settings
const appUrl = 'https://ais-pre-cpdsqjncmnuhyqe6kicb3s-698964539797.asia-southeast1.run.app';
const settingsJson = JSON.stringify(
  {
    sites: [
      {
        url: appUrl,
        title: "DownloaderZero (DZ)"
      }
    ],
    other: appUrl,
    match: [
      ["host", "endsWith", "run.app"],
      ["host", "contains", "google"],
      ["host", "contains", "youtube.com"],
      ["host", "contains", "tiktok.com"],
      ["host", "contains", "facebook.com"],
      ["host", "contains", "instagram.com"],
      ["host", "contains", "pinterest.com"],
      ["host", "contains", "spotify.com"],
      ["host", "contains", "terabox.com"]
    ],
    remote_debug: false,
    console_log: false,
    local_sites: true,
    web_settings: {
      JavaScriptEnabled: true,
      DomStorageEnabled: true,
      DatabaseEnabled: true
    }
  },
  null,
  2
);

// 7. Build new clean ZIP
const newZip = new JSZip();

const iconTargets = new Set([
  'res/dz.png',
  'res/pu.png',
  'res/8h.png',
  'res/j4.png',
  'res/pk.png',
  'res/tG.png',
  'res/0Z.png',
  'res/7m.png',
  'res/Ag.png',
  'res/Ck.png',
  'res/MD.png',
  'res/p8.png',
  'res/zz.png',
  'res/5P.png',
  'res/Pb.png',
  'res/6d.png',
  'res/Th.png',
  'res/d3.png',
  'res/iO.png',
  'res/o_.png',
  'res/aU.png',
  'res/kp.png',
  'res/nf.png'
]);

for (const [filename, fileEntry] of Object.entries(baseZip.files)) {
  // Strip ALL old signatures and META-INF so apksigner generates a clean cryptographic envelope
  if (filename.startsWith('META-INF/')) {
    continue;
  }

  if (filename === 'AndroidManifest.xml') {
    newZip.file(filename, manifestBytes);
  } else if (filename === 'resources.arsc') {
    // Android AssetManager requires resources.arsc to be STORED (uncompressed)
    newZip.file(filename, arscBuf, { compression: 'STORE' });
  } else if (filename === 'assets/settings.json') {
    newZip.file(filename, settingsJson);
  } else if (iconTargets.has(filename)) {
    newZip.file(filename, logoDzBuf);
  } else {
    const content = await fileEntry.async('nodebuffer');
    newZip.file(filename, content);
  }
}

newZip.file('res/dz.png', logoDzBuf);

// Generate unsigned ZIP
console.log('[DZ Packager] Packaging unsigned archive...');
const rawZipBuf = await newZip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 6 }
});

const unsignedApkPath = '/tmp/dz-unsigned.apk';
const alignedApkPath = '/tmp/dz-aligned.apk';
const finalApkPath = path.resolve(process.cwd(), 'public/DownloaderZero.apk');

fs.writeFileSync(unsignedApkPath, rawZipBuf);

// 8. Run official zipalign (4-byte boundary alignment)
console.log('[DZ Packager] Running zipalign (4-byte alignment)...');
execSync(`zipalign -f -p 4 "${unsignedApkPath}" "${alignedApkPath}"`, { stdio: 'inherit' });

// 9. Sign with official Android apksigner (v1, v2, v3)
console.log('[DZ Packager] Signing with apksigner (v1, v2, v3)...');
execSync(
  `apksigner sign --key "${keyPk8Path}" --cert "${certPemPath}" --min-sdk-version 21 --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true --out "${finalApkPath}" "${alignedApkPath}"`,
  { stdio: 'inherit' }
);

// Mirror to dist if dist exists
const distDir = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  fs.copyFileSync(finalApkPath, path.join(distDir, 'DownloaderZero.apk'));
}

// 10. Verify with apksigner verify -v
console.log('[DZ Packager] Verifying final APK integrity with apksigner...');
const verifyOutput = execSync(`apksigner verify -v --print-certs "${finalApkPath}"`, { encoding: 'utf8' });
console.log(verifyOutput);

// 11. Print aapt badging info
console.log('[DZ Packager] Verifying APK badging with aapt...');
const badgingOutput = execSync(`aapt dump badging "${finalApkPath}" | grep -E "package|sdkVersion|application-label|icon"`, { encoding: 'utf8' });
console.log(badgingOutput);

const stat = fs.statSync(finalApkPath);
console.log(`[DZ Packager] ✅ Successfully generated official DownloaderZero.apk!`);
console.log(`[DZ Packager] Size: ${(stat.size / (1024 * 1024)).toFixed(2)} MB (${stat.size} bytes)`);
