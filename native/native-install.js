const os = require('os');
const fs = require('fs');
const child_process = require('child_process');

const platform = os.platform();   // 'darwin', 'linux', 'win32', etc.
const arch = os.arch();           // 'arm64', 'x64', etc.

function isMacOSArm64() {
  return platform === 'darwin' && arch === 'arm64';
}

function isUbuntu() {
  if (platform !== 'linux') return false;
  try {
    const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
    const match = osRelease.match(/^ID=(.*)$/m);
    if (!match) return false;
    const id = match[1].replace(/"/g, '').trim().toLowerCase();
    return id === 'ubuntu';
  } catch {
    return false;
  }
}

if (isMacOSArm64() || isUbuntu()) {
  console.log('[native-addon] Building native module...');
  try {
    child_process.execSync('node-gyp rebuild', { stdio: 'inherit' });
  } catch (e) {
    console.error('[native-addon] Build failed.');
    process.exit(1);
  }
} else {
  console.log(`[native-addon] Skipping native build on ${platform} (${arch})`);
}
