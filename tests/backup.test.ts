/** Yedek dosyası saf mantık testleri. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  backupFileName,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  buildBackup,
  mergeDeviceSecrets,
  parseBackup,
  serializeBackup,
  stripSecrets,
  summarizeBackup,
} from "../src/backup.ts";
import type { Profile } from "../src/types.ts";

const NOW = new Date("2026-09-02T10:00:00.000Z");

const profileJson = JSON.stringify({
  name: "Mehmet",
  apiKey: "sk-ant-GIZLI",
  apiKeys: { anthropic: "sk-ant-GIZLI", deepseek: "sk-GIZLI2" },
  provider: "anthropic",
  models: { anthropic: "claude-opus-5" },
  activeLanguage: "ar",
  completedModuleIds: ["k1"],
});

function sample() {
  return buildBackup(
    [
      ["profile.v1", profileJson],
      ["vocab.v1", JSON.stringify([{ id: "c1" }, { id: "c2" }, { id: "c3" }])],
      ["vocab.v1.en", JSON.stringify([{ id: "e1" }])],
      ["mistakes.v1", JSON.stringify([{ id: "m1" }, { id: "m2" }])],
      ["readings.v1", JSON.stringify([{ id: "r1" }])],
      ["chat.v1.freechat", "[]"],
      ["chat.v1.module.k1", "[]"],
      ["chat.v1.en.freechat", "[]"],
      ["usage.v1", "{}"],
      ["bosAnahtar", null],
    ],
    "derleme #26",
    NOW
  );
}

test("buildBackup: anahtarları söker, null değerleri atlar, kalanı aynen taşır", () => {
  const b = sample();
  assert.equal(b.format, BACKUP_FORMAT);
  assert.equal(b.version, BACKUP_VERSION);
  assert.equal(b.exportedAt, NOW.toISOString());
  assert.equal(b.app, "derleme #26");
  assert.equal("bosAnahtar" in b.entries, false);
  assert.equal(b.entries["usage.v1"], "{}");
  const p = JSON.parse(b.entries["profile.v1"]);
  assert.equal(p.apiKey, "");
  assert.equal("apiKeys" in p, false);
  assert.equal(p.name, "Mehmet"); // gizli olmayan alanlar duruyor
  assert.deepEqual(p.completedModuleIds, ["k1"]);
});

test("stripSecrets: bozuk JSON'a dokunmaz", () => {
  assert.equal(stripSecrets("{bozuk"), "{bozuk");
});

test("serialize → parse gidiş-dönüşü birebir", () => {
  const b = sample();
  const back = parseBackup(serializeBackup(b));
  assert.deepEqual(back, b);
});

test("parseBackup: yedek olmayan/bozuk/yeni sürüm/boş/profilsiz dosyalar Türkçe hatayla reddedilir", () => {
  assert.throws(() => parseBackup("merhaba"), /yedeği değil/);
  assert.throws(() => parseBackup(JSON.stringify({ format: "baska", entries: {} })), /yedeği değil/);
  assert.throws(
    () =>
      parseBackup(
        JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION + 1, entries: { a: "1" } })
      ),
    /daha yeni/
  );
  assert.throws(
    () => parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, entries: {} })),
    /boş/
  );
  assert.throws(
    () =>
      parseBackup(
        JSON.stringify({ format: BACKUP_FORMAT, version: 1, entries: { "vocab.v1": "[]" } })
      ),
    /profil kaydı yok/
  );
});

test("parseBackup: string olmayan kayıtlar elenir, eksik meta alanlar boşlanır", () => {
  const b = parseBackup(
    JSON.stringify({
      format: BACKUP_FORMAT,
      version: 1,
      entries: { "profile.v1": "{}", sayi: 42, nesne: { a: 1 } },
    })
  );
  assert.deepEqual(Object.keys(b.entries), ["profile.v1"]);
  assert.equal(b.exportedAt, "");
  assert.equal(b.app, "");
});

test("summarizeBackup: dillere yayılmış sayımlar ve ad", () => {
  const s = summarizeBackup(sample());
  assert.equal(s.name, "Mehmet");
  assert.equal(s.vocab, 4); // 3 ar + 1 en
  assert.equal(s.mistakes, 2);
  assert.equal(s.readings, 1);
  assert.equal(s.chats, 3);
  assert.deepEqual(s.languages, ["ar", "en"]);
  assert.equal(s.exportedAt, NOW.toISOString());
});

test("mergeDeviceSecrets: cihazdaki anahtar/model/sağlayıcı yedekteki profile aşılanır", () => {
  const stripped = stripSecrets(profileJson);
  const current: Profile = {
    name: "Cihazdaki Ad",
    apiKey: "sk-ant-CIHAZ",
    apiKeys: { anthropic: "sk-ant-CIHAZ" },
    provider: "deepseek",
    models: { deepseek: "deepseek-v4-pro" },
    activeLanguage: "ar",
    completedModuleIds: [],
  };
  const merged = JSON.parse(mergeDeviceSecrets(stripped, current)!);
  assert.equal(merged.name, "Mehmet"); // yedekteki kimlik korunur
  assert.equal(merged.apiKey, "sk-ant-CIHAZ");
  assert.deepEqual(merged.apiKeys, { anthropic: "sk-ant-CIHAZ" });
  assert.equal(merged.provider, "deepseek");
  assert.deepEqual(merged.models, { deepseek: "deepseek-v4-pro" });
  // cihazda profil yoksa (yeni telefon) yedek aynen döner
  assert.equal(mergeDeviceSecrets(stripped, null), stripped);
  assert.equal(mergeDeviceSecrets(undefined, current), undefined);
  assert.equal(mergeDeviceSecrets("{bozuk", current), "{bozuk");
});

test("backupFileName tarih damgalı", () => {
  assert.equal(backupFileName(NOW), "lisan-hocasi-yedek-2026-09-02.json");
});
