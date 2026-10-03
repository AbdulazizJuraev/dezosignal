/* ============================================================
   Gradle'ni Android Studio ichidagi Java va SDK bilan ishga tushirish.
   Ishlatish: node scripts/gradle.js assembleDebug | assembleRelease
   ============================================================ */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const task = process.argv[2] || 'assembleDebug';
const androidDir = path.resolve(__dirname, '..', 'android');

const javaCandidates = [
  process.env.JAVA_HOME,
  'C:\\Program Files\\Android\\Android Studio\\jbr',
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Android Studio', 'jbr')
].filter(Boolean);
const JAVA_HOME = javaCandidates.find(p => fs.existsSync(path.join(p, 'bin', 'java.exe')) || fs.existsSync(path.join(p, 'bin', 'java')));

const ANDROID_HOME = process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');

if (!JAVA_HOME) { console.error('Java topilmadi (Android Studio o‘rnatilganmi?)'); process.exit(1); }
if (!fs.existsSync(ANDROID_HOME)) { console.error('Android SDK topilmadi: ' + ANDROID_HOME); process.exit(1); }

// Gradle SDK yo'lini local.properties dan o'qiydi
fs.writeFileSync(path.join(androidDir, 'local.properties'),
  'sdk.dir=' + ANDROID_HOME.replace(/\\/g, '\\\\').replace(/:/g, '\\:') + '\n');

console.log('JAVA_HOME   =', JAVA_HOME);
console.log('ANDROID_HOME=', ANDROID_HOME);
console.log('gradle', task, '\n');

// Windows'da joriy papkadagi .bat faylni to'liq yo'l bilan chaqirish kerak
const gradlew = process.platform === 'win32' ? `"${path.join(androidDir, 'gradlew.bat')}"` : './gradlew';
// Java Windows'da ichki "loopback" ulanish uchun vaqtinchalik papkadan foydalanadi;
// uzun yoki maxsus yo'l bo'lsa "Unable to establish loopback connection" beradi
const TMP = path.resolve(__dirname, '..', '.tmp');
fs.mkdirSync(TMP, { recursive: true });

const r = spawnSync(gradlew, [task, '--no-daemon', '--console=plain'], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env, JAVA_HOME, ANDROID_HOME, ANDROID_SDK_ROOT: ANDROID_HOME,
    TMP, TEMP: TMP,
    JAVA_TOOL_OPTIONS: `-Djava.io.tmpdir="${TMP}" -Djdk.net.unixdomain.tmpdir="${TMP}"`
  }
});

if (r.status === 0) {
  // flavor'lar bilan APK'lar apk/<flavor>/<release|debug>/ ichida
  const kind = task.includes('Release') ? 'release' : 'debug';
  const root = path.join(androidDir, 'app', 'build', 'outputs', 'apk');
  const walk = dir => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.apk') ? [path.join(dir, e.name)] : []) : [];
  walk(root).filter(p => p.includes(path.sep + kind + path.sep)).forEach(p => {
    console.log('\nAPK:', p, '—', (fs.statSync(p).size / 1048576).toFixed(1), 'MB');
  });
}
process.exit(r.status ?? 1);
