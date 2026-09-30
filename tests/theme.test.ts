/**
 * Tema sözleşmesi ve MİMARİ NÖBETÇİSİ.
 *
 * Karanlık mod bir kez düzeltilip bırakılırsa geri gelir: yeni bir ekran
 * yazılırken modül düzeyinde `StyleSheet.create({ color: colors.ink })`
 * yazmak en kolay yoldur ve o ekran sessizce sabit açık palete çakılır.
 * Buradaki kaynak taraması tam olarak bunu yakalar.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { darkPalette, lightPalette } from "../src/theme.ts";

test("iki palet de aynı jetonları taşır", () => {
  const l = Object.keys(lightPalette).sort();
  const d = Object.keys(darkPalette).sort();
  assert.deepEqual(d, l, "paletlerin jeton listesi ayrışmış");
  const asMap = (p: unknown) => p as Record<string, string>;
  for (const k of l) {
    assert.equal(typeof asMap(lightPalette)[k], "string", `açık palette ${k} string değil`);
    assert.equal(typeof asMap(darkPalette)[k], "string", `koyu palette ${k} string değil`);
  }
});

/** #RRGGBB → 0-1 parlaklık (kaba ama bu iş için yeterli). */
function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return NaN;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

test("karanlık palet gerçekten karanlık, açık palet açık", () => {
  // "Karanlık mod var" deyip aynı renkleri koymak en sinsi kusurdur.
  assert.ok(luminance(lightPalette.bg) > 0.7, `açık zemin çok koyu: ${lightPalette.bg}`);
  assert.ok(luminance(darkPalette.bg) < 0.3, `koyu zemin çok açık: ${darkPalette.bg}`);
  assert.ok(luminance(lightPalette.ink) < 0.4, "açık modda yazı rengi çok açık");
  assert.ok(luminance(darkPalette.ink) > 0.6, "koyu modda yazı rengi çok koyu");
});

test("metin ile zemin arasında okunur bir fark var (her iki modda)", () => {
  for (const [name, p] of [
    ["açık", lightPalette],
    ["koyu", darkPalette],
  ] as const) {
    const diff = Math.abs(luminance(p.ink) - luminance(p.bg));
    assert.ok(diff > 0.45, `${name} modda metin/zemin farkı yetersiz: ${diff.toFixed(2)}`);
  }
});

// ---------------------------------------------------------------------------
// Kaynak taraması: hiçbir ekran sabit palete çakılmasın
// ---------------------------------------------------------------------------

// Özyinelemeli: ekranlar alt klasörlere bölündükçe (src/screens/build,
// src/screens/home) kural o klasörlerde sessizce düşmesin.
function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(p);
    return e.name.endsWith(".tsx") ? [p] : [];
  });
}

test("hiçbir ekran/bileşen sabit paleti kullanmıyor", () => {
  const files = [...tsxFiles("src/screens"), ...tsxFiles("src/components"), "App.tsx"];
  const offenders: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const usesTokens = /\bcolors\./.test(src);
    if (!usesTokens) continue;
    if (!src.includes("useTheme")) offenders.push(file);
  }
  assert.deepEqual(
    offenders,
    [],
    `şu dosyalar temayı okumuyor, sabit açık palete çakılı:\n${offenders.join("\n")}`
  );
});

test("stil blokları palet FONKSİYONU olarak yazılmış", () => {
  // Modül düzeyinde StyleSheet.create bir kez çalışır ve o anki renkleri
  // dondurur; tema değişince güncellenmez.
  const files = [...tsxFiles("src/screens"), ...tsxFiles("src/components")];
  const offenders: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    if (/^const styles = StyleSheet\.create\(/m.test(src) && /\bcolors\./.test(src)) {
      offenders.push(file);
    }
  }
  assert.deepEqual(offenders, [], `modül düzeyinde donmuş stil:\n${offenders.join("\n")}`);
});
