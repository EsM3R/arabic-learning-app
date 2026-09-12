/** Otomatik anlık görüntü politikası. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isSnapshotName,
  KEEP_SNAPSHOTS,
  planPrune,
  SNAPSHOT_INTERVAL_HOURS,
  SNAPSHOT_MIN_VOCAB,
  snapshotDue,
  snapshotName,
  snapshotStatus,
} from "../src/autobackup.ts";

const NOW = new Date("2026-09-12T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

test("boş deftere anlık görüntü alınmaz", () => {
  // Korunacak emek yokken ilk açılışı yavaşlatmanın anlamı yok.
  const d = snapshotDue(null, SNAPSHOT_MIN_VOCAB - 1, NOW);
  assert.equal(d.due, false);
  assert.match(d.reason, /Korunacak/);
});

test("hiç alınmamışsa hemen alınır", () => {
  const d = snapshotDue(null, 50, NOW);
  assert.equal(d.due, true);
  assert.match(d.reason, /Hiç anlık görüntü alınmamış/);
});

test("aralık dolmadan yeniden alınmaz", () => {
  const d = snapshotDue(hoursAgo(SNAPSHOT_INTERVAL_HOURS - 1), 50, NOW);
  assert.equal(d.due, false);
  assert.match(d.reason, /henüz gerekmiyor/);
});

test("aralık dolunca alınır ve süre söylenir", () => {
  const d = snapshotDue(hoursAgo(SNAPSHOT_INTERVAL_HOURS + 5), 50, NOW);
  assert.equal(d.due, true);
  assert.match(d.reason, new RegExp(`${SNAPSHOT_INTERVAL_HOURS + 5} saat önce`));
});

test("bozuk tarih çökertmez, yeniden almaya karar verir", () => {
  const d = snapshotDue("tarih değil", 50, NOW);
  assert.equal(d.due, true);
  assert.match(d.reason, /okunamadı/);
});

test("cihaz saati geri alınmışsa sessizce bekler", () => {
  // Gelecekten bir damga görünce her açılışta yeniden yazmak, diski
  // gereksiz yere döverdi.
  const future = new Date(NOW.getTime() + 5 * 3_600_000).toISOString();
  const d = snapshotDue(future, 50, NOW);
  assert.equal(d.due, false);
  assert.match(d.reason, /saati geri/);
});

test("dosya adı ISO damgalı ve sıralanabilir", () => {
  const a = snapshotName(new Date("2026-09-10T08:00:00.000Z"));
  const b = snapshotName(new Date("2026-09-12T08:00:00.000Z"));
  assert.ok(isSnapshotName(a) && isSnapshotName(b));
  assert.ok(a < b, "alfabetik sıra kronolojik değil");
  // Uzantıdaki nokta dışında iki nokta/nokta kalmamalı: Android dosya
  // adlarında ":" yasaktır ve yazma sessizce başarısız olur.
  assert.doesNotMatch(a.replace(/\.json$/, ""), /[:.]/, "dosya adında yasak karakter var");
});

test("başka dosyalar anlık görüntü sanılmaz", () => {
  assert.equal(isSnapshotName("lisan-hocasi-yedek-2026-09-10.json"), false);
  assert.equal(isSnapshotName("anlik-x.txt"), false);
  assert.equal(isSnapshotName("anlik-2026-09-10T08-00-00-000Z.json"), true);
});

test("budama en yenileri saklar, fazlasını siler", () => {
  const names = [
    "anlik-2026-09-08T08-00-00-000Z.json",
    "anlik-2026-09-12T08-00-00-000Z.json",
    "anlik-2026-09-10T08-00-00-000Z.json",
    "anlik-2026-09-09T08-00-00-000Z.json",
    "anlik-2026-09-11T08-00-00-000Z.json",
  ];
  const { keep, remove } = planPrune(names);
  assert.equal(keep.length, KEEP_SNAPSHOTS);
  assert.equal(keep[0], "anlik-2026-09-12T08-00-00-000Z.json");
  assert.equal(remove.length, names.length - KEEP_SNAPSHOTS);
  assert.ok(remove.every((r) => !keep.includes(r)));
});

test("budama ALAKASIZ dosyalara dokunmaz", () => {
  // Elle alınmış yedekleri silmek, korumak istediğimiz şeyi yok etmek olurdu.
  const { keep, remove } = planPrune([
    "lisan-hocasi-yedek-2026-09-01.json",
    "anlik-2026-09-12T08-00-00-000Z.json",
    "rastgele.txt",
  ]);
  assert.deepEqual(keep, ["anlik-2026-09-12T08-00-00-000Z.json"]);
  assert.deepEqual(remove, []);
});

test("az sayıda anlık görüntü varsa hiçbiri silinmez", () => {
  const { remove } = planPrune(["anlik-2026-09-12T08-00-00-000Z.json"]);
  assert.deepEqual(remove, []);
});

test("durum metni yanlış güven vermez — dışarı yedeği hatırlatır", () => {
  const s = snapshotStatus(hoursAgo(30), 3, NOW);
  assert.match(s, /1 gün önce/);
  assert.match(s, /3 kopya/);
  assert.match(s, /dışarı yedek al/);
});

test("hiç anlık görüntü yokken durum bunu söyler", () => {
  assert.match(snapshotStatus(null, 0, NOW), /Henüz/);
  assert.match(snapshotStatus(hoursAgo(2), 0, NOW), /Henüz/);
});

test("çok yeni anlık görüntü 'az önce' der", () => {
  assert.match(snapshotStatus(hoursAgo(0), 1, NOW), /az önce/);
});
