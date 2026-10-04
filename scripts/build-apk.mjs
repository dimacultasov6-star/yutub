#!/usr/bin/env node
/**
 * Сборка Android APK «из коробки».
 *
 * Зачем этот скрипт, а не просто `gradlew assembleRelease`:
 *
 *  1) На машине разработчика часто стоит JDK 8 или, наоборот, JDK 25
 *     (например, встроенный JBR свежего Android Studio). Оба варианта
 *     ломают сборку:
 *       • JDK 8  — Gradle 8.x требует 17+ вообще не запускается;
 *       • JDK 25 — Android Gradle Plugin 8.x падает с
 *         «Unsupported class file major version 69».
 *     Скрипт сам находит подходящий JDK (17–24) и подставляет JAVA_HOME.
 *
 *  2) Нужен Android SDK. Берётся из ANDROID_HOME / ANDROID_SDK_ROOT,
 *     стандартных путей или пишется в android/local.properties.
 *
 * Использование:
 *   node scripts/build-apk.mjs            # release
 *   node scripts/build-apk.mjs debug      # debug
 *   node scripts/build-apk.mjs release dist/app-release.apk
 */
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ANDROID_DIR = join(ROOT, 'android');
const GRADLEW = join(ANDROID_DIR, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');const MIN_JDK = 17;
const MAX_JDK = 24; // 25+ не поддерживается Android Gradle Plugin 8.x

const mode = (process.argv[2] || 'release').toLowerCase();
if (!['debug', 'release'].includes(mode)) {
  console.error(`Неизвестный режим «${mode}». Использовать: debug | release`);
  process.exit(1);
}

const fail = (msg) => {
  console.error(`\nОШИБКА: ${msg}\n`);
  process.exit(1);
};

/** Реальная версия JDK, либо null, если java не запускается. */
function javaVersion(javaHome) {
  const bin = join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  if (!existsSync(bin)) return null;
  const r = spawnSync(bin, ['-version'], { encoding: 'utf8' });
  const out = `${r.stderr || ''}${r.stdout || ''}`;
  const m = out.match(/version "(\d+)[\.\d_]*/);
  if (!m) return null;
  return { major: Number(m[1]), full: m[0].replace(/version /, ''), isJre: /JRE|jre/i.test(out) };
}

/** Ищем JDK 17–24. Порядок: проект → JAVA_HOME → Android Studio → системные папки. */
function findJdk() {
  const candidates = [];

  candidates.push(join(ROOT, '.jdk')); // локальный, добавленный скриптом
  if (process.env.JAVA_HOME) candidates.push(process.env.JAVA_HOME);

  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  candidates.push(join(programFiles, 'Android', 'Android Studio', 'jbr'));
  candidates.push(join(process.env.LOCALAPPDATA || '', 'Programs', 'Android Studio', 'jbr'));

  for (const base of [
    join(programFiles, 'Java'),
    join(programFiles, 'Eclipse Adoptium'),
    join(programFiles, 'Microsoft'),
    join(programFiles, 'Amazon Corretto'),
    join(programFiles, 'Zulu'),
    process.env.USERPROFILE ? join(process.env.USERPROFILE, '.jdks') : null,
  ]) {
    if (!base || !existsSync(base)) continue;
    try {
      for (const dir of execFileSync('cmd', ['/c', `dir /b /ad "${base}"`], { encoding: 'utf8' })
        .split(/\r?\n/)
        .filter(Boolean)) {
        candidates.push(join(base, dir));
      }
    } catch {
      /* каталога нет — пропускаем */
    }
  }

  const seen = new Set();
  const rejected = [];
  for (const home of candidates) {
    if (!home || seen.has(home)) continue;
    seen.add(home);
    const v = javaVersion(home);
    if (!v) continue;
    if (v.isJre) {
      rejected.push(`${home} → это JRE, а не JDK (нужен javac для Android)`);
      continue;
    }
    if (v.major < MIN_JDK) {
      rejected.push(`${home} → JDK ${v.major}, нужно >= ${MIN_JDK}`);
      continue;
    }
    if (v.major > MAX_JDK) {
      rejected.push(`${home} → JDK ${v.major}, Android Gradle Plugin 8.x поддерживает максимум ${MAX_JDK}`);
      continue;
    }
    return { home, ...v };
  }
  return { rejected: [...new Set(rejected)] };
}

/** Ищем Android SDK. */
function findSdk() {
  const env = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const candidates = [
    env,
    join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk'),
    join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Android', 'Sdk'),
    join(process.env.USERPROFILE || '', 'Library', 'Android', 'sdk'),
    join(process.env.HOME || '', 'Android', 'Sdk'),
  ].filter(Boolean);

  for (const sdk of candidates) {
    if (existsSync(join(sdk, 'platform-tools')) || existsSync(join(sdk, 'platforms'))) {
      return sdk;
    }
  }
  return null;
}

console.log('=== Сборка Android APK ===\n');

if (!existsSync(GRADLEW)) {
  fail(`Не найден Gradle wrapper (${GRADLEW}). Выполните: npx cap add android`);
}

const sdk = findSdk();
if (!sdk) {
  fail(
    'Не найден Android SDK. Установите Android Studio либо задайте ANDROID_HOME.\n' +
      '       Ожидается структура вида $ANDROID_HOME/platform-tools и $ANDROID_HOME/platforms',
  );
}
console.log(`Android SDK: ${sdk}`);

const jdk = findJdk();
if (!jdk.home) {
  console.error('\nПодходящий JDK 17–24 не найден.\n');
  console.error('Проверено:');
  for (const r of jdk.rejected) console.error(`  - ${r}`);
  console.error(
    '\nКак решить (любой из вариантов):\n' +
      '  1) Положить JDK в папку проекта: .jdk\\   (скрипт подхватит автоматически)\n' +
      '  2) Установить JDK 21 (Temurin/Oracle/Microsoft) и задать JAVA_HOME\n' +
      '  3) Через Android Studio: Settings > Build Tools > Gradle > Gradle JDK\n' +
      '\nСкачать Temurin 21: https://adoptium.net/temurin/releases/?version=21\n',
  );
  process.exit(1);
}
console.log(`JDK: ${jdk.full}  (${jdk.home})`);

// local.properties — Gradle читает SDK отсюда.
const localProps = join(ANDROID_DIR, 'local.properties');
const propsTxt = `sdk.dir=${sdk.replace(/\\/g, '\\\\')}\n`;
if (!existsSync(localProps) || !readFileSync(localProps, 'utf8').includes('sdk.dir=')) {
  writeFileSync(localProps, propsTxt);
  console.log(`Записан ${localProps}`);
}

const env = {
  ...process.env,
  JAVA_HOME: jdk.home,
  ANDROID_HOME: sdk,
  ANDROID_SDK_ROOT: sdk,
};

console.log(`\n> gradlew assemble${mode === 'debug' ? 'Debug' : 'Release'}`);
console.log('-'.repeat(60));

// На Windows запускаем через cmd: gradlew.bat — это batch-файл,
// который node не умеет исполнять напрямую.
const isWindows = process.platform === 'win32';
const cmd = isWindows ? 'cmd' : GRADLEW;
const cmdArgs = isWindows
  ? ['/c', GRADLEW, `assemble${mode === 'debug' ? 'Debug' : 'Release'}`, '--no-daemon']
  : [`assemble${mode === 'debug' ? 'Debug' : 'Release'}`, '--no-daemon'];

const gradle = spawnSync(cmd, cmdArgs, {
  cwd: ANDROID_DIR,
  env,
  stdio: 'inherit',
});
console.log('-'.repeat(60));

if (gradle.status !== 0) fail(`Gradle завершился с кодом ${gradle.status}`);

const apk = join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', mode, `app-${mode}.apk`);
if (!existsSync(apk)) fail(`Сборка прошла, но APK не найден: ${apk}`);

const distDir = join(ROOT, 'dist');
mkdirSync(distDir, { recursive: true });
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const target = join(distDir, `Ютуб-${version}-${mode}.apk`);
copyFileSync(apk, target);

const { size } = await import('node:fs').then((fs) => fs.statSync(target));
console.log(`\nГотово: ${target}`);
console.log(`Размер: ${(size / 1024 / 1024).toFixed(2)} MB`);

if (mode === 'release') {
  console.log(
    '\nПримечание: подпись выполнена отладочным ключом (Android Debug) —\n' +
      'APK устанавливается, но для Google Play нужен свой ключ.\n' +
      'Создайте android\\keystore.properties (см. README), либо подпишите в Android Studio.',
  );
}
