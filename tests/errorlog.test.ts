/**
 * Hata görünürlüğü.
 *
 * Bu modülün varlık sebebi şu: bağımsız APK'da (Expo Go'nun aksine) kırmızı
 * hata ekranı yoktur — yakalanmayan bir hata uygulamayı SESSİZCE kapatır ve
 * kullanıcının elinde hiçbir bilgi kalmaz. Tek kişilik bir uygulamada bu,
 * hatanın hiç düzeltilememesi demek: kullanıcı "kapandı" der, sebebi kimse
 * bilemez.
 *
 * Dolayısıyla buradaki testler "hata mesajı güzel mi"yi değil, HATA
 * BİLGİSİNİN KAYBOLMADIĞINI ölçüyor.
 */
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  describeError,
  errorHistory,
  installGlobalErrorHandler,
  reportError,
  subscribeErrors,
} from "../src/errorLog.ts";

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

function listen(): { entries: unknown[] } {
  const entries: unknown[] = [];
  cleanups.push(subscribeErrors((e) => entries.push(e)));
  return { entries };
}

test("Error nesnesinden mesaj ve iz çıkarılır", () => {
  const d = describeError(new Error("patladı"));
  assert.equal(d.message, "patladı");
  assert.ok(d.stack && d.stack.length > 0);
});

test("mesajsız Error'da ad kullanılır — 'Bilinmeyen hata' son çare", () => {
  // Boş bir kutu göstermek, hata ekranını işe yaramaz kılar.
  const e = new Error("");
  e.name = "TypeError";
  assert.equal(describeError(e).message, "TypeError");
});

test("Error OLMAYAN her şey de okunabilir hâle gelir", () => {
  // Söz reddi çoğu zaman dize ya da nesne fırlatır; bunlar da kaybolmamalı.
  assert.equal(describeError("düz metin").message, "düz metin");
  assert.equal(describeError({ kod: 401 }).message, '{"kod":401}');
});

test("döngüsel nesne bile ÇÖKERTMEZ", () => {
  // Hata bildirimi sırasında çökmek, bildirilecek hatayı da yok eder.
  const a: Record<string, unknown> = {};
  a.kendisi = a;
  assert.ok(describeError(a).message.length > 0);
});

test("bildirilen hata dinleyicilere ULAŞIR ve geçmişe yazılır", () => {
  const { entries } = listen();
  reportError(new Error("bir şey"), "ders ekranı", true);
  assert.equal(entries.length, 1);
  const last = errorHistory().at(-1)!;
  assert.equal(last.message, "bir şey");
  assert.equal(last.context, "ders ekranı");
  assert.equal(last.fatal, true);
});

test("bir dinleyicinin patlaması ÖTEKİLERİ kesmez", () => {
  // Çökme ekranı bir dinleyicidir: onun hatası yüzünden kayıt tutulmasaydı
  // hata hem gösterilemez hem kaydedilemez olurdu.
  cleanups.push(
    subscribeErrors(() => {
      throw new Error("dinleyici bozuk");
    })
  );
  const { entries } = listen();
  reportError(new Error("asıl hata"));
  assert.equal(entries.length, 1);
});

test("abonelik bırakılınca dinleyici çağrılmaz", () => {
  const entries: unknown[] = [];
  const off = subscribeErrors((e) => entries.push(e));
  off();
  reportError(new Error("sonra"));
  assert.equal(entries.length, 0);
});

test("geçmiş SINIRLI — sonsuz büyüyüp belleği yemez", () => {
  for (let i = 0; i < 40; i += 1) reportError(new Error(`h${i}`));
  const h = errorHistory();
  assert.ok(h.length <= 20);
  assert.equal(h.at(-1)!.message, "h39"); // en yenisi durur
});

test("geçmiş KOPYA döner — dışarıdan bozulamaz", () => {
  reportError(new Error("x"));
  const h = errorHistory();
  h.length = 0;
  assert.ok(errorHistory().length > 0);
});

test("küresel yönetici ÖNCEKİNİ zincire alır ve bir kez kurulur", () => {
  // Önceki yönetici genellikle RN'in kendi çökme davranışıdır; onu koparmak
  // hatayı bize kazandırırken kullanıcıya kaybettirirdi.
  const calls: [unknown, boolean | undefined][] = [];
  let handler: ((e: unknown, fatal?: boolean) => void) | undefined;
  const g = globalThis as unknown as { ErrorUtils?: unknown };
  const previousUtils = g.ErrorUtils;
  g.ErrorUtils = {
    getGlobalHandler: () => (e: unknown, f?: boolean) => calls.push([e, f]),
    setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => {
      handler = h;
    },
  };
  try {
    installGlobalErrorHandler();
    installGlobalErrorHandler(); // ikinci çağrı yeniden kurmamalı
    assert.ok(handler, "yönetici kurulmadı");

    const { entries } = listen();
    handler!(new Error("async patlama"), true);
    assert.equal(entries.length, 1);
    assert.equal(calls.length, 1); // önceki yönetici de çalıştı
    assert.equal(errorHistory().at(-1)!.fatal, true);
  } finally {
    g.ErrorUtils = previousUtils;
  }
});
