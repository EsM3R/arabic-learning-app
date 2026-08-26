#!/usr/bin/env node
/**
 * Native modül sürüm bekçisi.
 *
 * Neden var: expo-audio, expo-asset'i "*" olarak istiyor. npm bunu en yeni
 * sürümle karşılayıp node_modules kökene çıkarabiliyor; Expo'nun autolinking'i
 * kökene baktığı için bağımsız APK'ya yanlış SDK'nın paketi giriyor. Gradle
 * derlemesi geçiyor (paket önceden derlenmiş geliyor) ama uygulama AÇILIŞTA
 * çöküyor:
 *
 *   java.lang.NoClassDefFoundError: expo/modules/kotlin/types/AnyTypeCache
 *
 * Bu, Expo Go'da görünmez — orada native modüller Expo Go uygulamasından gelir.
 * Yani ancak APK kurulunca ortaya çıkar. Bu betik derlemeden ÖNCE yakalar.
 *
 * Ölçüt: node_modules/expo/bundledNativeModules.json — kurulu Expo SDK'sının
 * resmi sürüm listesi. Ana sürüm (major) farkı hata sayılır.
 */
const fs = require("fs");
const path = require("path");

const bundledPath = path.join("node_modules", "expo", "bundledNativeModules.json");
if (!fs.existsSync(bundledPath)) {
  console.error("HATA: " + bundledPath + " yok. Önce 'npm install' çalıştır.");
  process.exit(1);
}
const bundled = JSON.parse(fs.readFileSync(bundledPath, "utf8"));

const major = (v) => parseInt(String(v).replace(/^[~^]/, "").split(".")[0], 10);

const problems = [];
let checked = 0;

// Autolinking node_modules ağacının tamamını tarar; iç içe kopyaları da gör.
function walk(dir, depth) {
  if (depth > 3) return;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (entry.name === "node_modules") {
      walk(full, depth + 1);
      continue;
    }
    if (entry.name.startsWith("@")) {
      walk(full, depth);
      continue;
    }
    const pkgJson = path.join(full, "package.json");
    const nested = path.join(full, "node_modules");
    const name = full.replace(/^node_modules\//, "").split("/node_modules/").pop();

    if (fs.existsSync(pkgJson) && bundled[name]) {
      let version;
      try {
        version = JSON.parse(fs.readFileSync(pkgJson, "utf8")).version;
      } catch {
        version = null;
      }
      if (version) {
        checked++;
        if (major(version) !== major(bundled[name])) {
          problems.push({ path: full, name, version, expected: bundled[name] });
        }
      }
    }
    if (fs.existsSync(nested)) walk(nested, depth + 1);
  }
}

walk("node_modules", 0);

console.log(`Native modül kopyası kontrol edildi: ${checked}`);

if (problems.length === 0) {
  console.log("Tümü kurulu Expo SDK'sıyla uyumlu.");
  process.exit(0);
}

console.error("\nUYUMSUZ NATIVE MODÜL(LER) — bu APK açılışta çökecektir:\n");
for (const p of problems) {
  console.error(`  ${p.path}`);
  console.error(`      kurulu: ${p.version}   beklenen: ${p.expected}\n`);
}
console.error(
  "Düzeltme: package.json içindeki \"overrides\" alanına doğru sürümü ekleyip\n" +
    "'npm install' çalıştır. Sürümleri node_modules/expo/bundledNativeModules.json\n" +
    "belirler."
);
process.exit(1);
