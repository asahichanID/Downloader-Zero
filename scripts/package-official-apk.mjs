import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import JSZip from 'jszip';

console.log('[DZ Packager] Starting official Android APK build & sign...');

// 1. Generate release key and certificate
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

// 2. Load Android base APK
const sampleApkPath = '/tmp/sample.apk';
if (!fs.existsSync(sampleApkPath)) {
  console.log('[DZ Packager] Downloading base APK...');
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

// 4a. Point ic_launcher_foreground (@drawable/ic_launcher_foreground entry 93) directly to res/dz.png!
// In sample.apk, ic_launcher_foreground was mapped to res/Qr.xml (length 10).
// 'res/dz.png' has exact length 10.
// Keeping res/BW.xml and res/0K.xml as valid <adaptive-icon> XMLs guarantees all Android 8-15 launchers display the DZ logo!
const fgCount = replaceExact(arscBuf, 'res/Qr.xml', 'res/dz.png');
console.log(`[DZ Packager] Replaced res/Qr.xml with res/dz.png in ARSC (${fgCount} occurrences)`);

// 4b. Update adaptive icon background color from teal (0xff008577) to obsidian cyber navy (#050B18: 0xff050b18)
const tealBytes = Buffer.from([0x77, 0x85, 0x00, 0xff]);
const cyberNavyBytes = Buffer.from([0x18, 0x0b, 0x05, 0xff]);
let colorPos = 0;
let colorCount = 0;
while ((colorPos = arscBuf.indexOf(tealBytes, colorPos)) !== -1) {
  cyberNavyBytes.copy(arscBuf, colorPos);
  colorPos += 4;
  colorCount++;
}
console.log(`[DZ Packager] Updated ic_launcher_background color (${colorCount} occurrences) to #050B18`);

// 4c. Set application label to 'Downloader'
replaceExact(arscBuf, 'My WebView', 'Downloader');

// 5. Patch binary AndroidManifest.xml: Set minSdkVersion to 21 (Android 5.0+)
let manifestBuf = await baseZip.file('AndroidManifest.xml').async('nodebuffer');
const manifestBytes = Buffer.from(manifestBuf);
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

// 6. Ensure dist/ is fresh
console.log('[DZ Packager] Checking dist assets...');
if (!fs.existsSync(path.resolve(process.cwd(), 'dist/index.html'))) {
  console.log('[DZ Packager] Running vite build...');
  execSync('npm run build', { stdio: 'inherit' });
}

// 7. App Settings - Boot directly to local fast assets via WebViewAssetLoader!
// This eliminates white screen freeze, 404s, and "tidak menanggapi" (ANR).
const localStartUrl = 'https://appassets.androidplatform.net/assets/index.html';
const settingsJson = JSON.stringify(
  {
    sites: [
      {
        url: localStartUrl,
        title: "DownloaderZero (DZ)"
      }
    ],
    other: localStartUrl,
    match: [
      ["host", "equals", "appassets.androidplatform.net"],
      ["host", "endsWith", "run.app"],
      ["host", "contains", "neoxr.eu"],
      ["host", "contains", "loader.to"],
      ["host", "contains", "tikwm.com"],
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

// 8. Build new clean ZIP
const newZip = new JSZip();

// Copy base files, keeping all original drawables intact
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
  } else {
    const content = await fileEntry.async('nodebuffer');
    newZip.file(filename, content);
  }
}

// Add the official DZ logo into res/dz.png for the adaptive icon foreground & direct icon
newZip.file('res/dz.png', logoDzBuf);

// Bundle all dist/ web assets directly into the APK assets/ directory
const distDir = path.resolve(process.cwd(), 'dist');
function addFolderToZip(folderPath, zipPrefix) {
  const items = fs.readdirSync(folderPath);
  for (const item of items) {
    const fullPath = path.join(folderPath, item);
    const zipPath = `${zipPrefix}/${item}`.replace(/\/+/g, '/');
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      addFolderToZip(fullPath, zipPath);
    } else {
      newZip.file(zipPath, fs.readFileSync(fullPath));
    }
  }
}

console.log('[DZ Packager] Bundling dist assets into APK assets/...');
addFolderToZip(distDir, 'assets');
// Also provide under assets/web/ in case subpath is accessed
if (fs.existsSync(path.join(distDir, 'index.html'))) {
  newZip.file('assets/web/index.html', fs.readFileSync(path.join(distDir, 'index.html')));
}

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

// 9. Run official zipalign (4-byte boundary alignment)
console.log('[DZ Packager] Running zipalign (4-byte alignment)...');
execSync(`zipalign -f -p 4 "${unsignedApkPath}" "${alignedApkPath}"`, { stdio: 'inherit' });

// 10. Sign with official Android apksigner (v1, v2, v3)
console.log('[DZ Packager] Signing with apksigner (v1, v2, v3)...');
execSync(
  `apksigner sign --key "${keyPk8Path}" --cert "${certPemPath}" --min-sdk-version 21 --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true --out "${finalApkPath}" "${alignedApkPath}"`,
  { stdio: 'inherit' }
);

// Mirror to dist if dist exists
if (fs.existsSync(distDir)) {
  fs.copyFileSync(finalApkPath, path.join(distDir, 'DownloaderZero.apk'));
}

// 11. Verify with apksigner verify -v
console.log('[DZ Packager] Verifying final APK integrity with apksigner...');
const verifyOutput = execSync(`apksigner verify -v --print-certs "${finalApkPath}"`, { encoding: 'utf8' });
console.log(verifyOutput);

const stat = fs.statSync(finalApkPath);
console.log(`[DZ Packager] ✅ Successfully generated official DownloaderZero.apk!`);
console.log(`[DZ Packager] Size: ${(stat.size / (1024 * 1024)).toFixed(2)} MB (${stat.size} bytes)`);
