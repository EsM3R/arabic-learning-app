/**
 * Sert harcama tavanı.
 *
 * Bu modülden önce uygulamada harcamayı yalnız GÖSTEREN bir sayaç vardı.
 * Göstermek koruma değil: tekrarlanan bir "tekrar dene", cepte açık kalan bir
 * ekran ya da yanlışlıkla pahalı bir modele geçiş, fark edilene kadar fatura
 * yazar. Faturayı ödeyen de kullanan da aynı kişi olduğu için uyarı yetmez.
 *
 * Testlerin ölçtüğü asıl şey şu: tavan GERÇEKTEN durduruyor mu, ve durdururken
 * kullanıcıyı karanlıkta bırakıyor mu. İkincisi birincisi kadar önemli —
 * sebebi söylenmeyen bir engel, kullanıcının gözünde bozuk bir uygulamadır.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  budgetStatus,
  BudgetExceededError,
  DEFAULT_BUDGET,
  isBudgetError,
  normalizeLimits,
  WARN_RATIO,
} from "../src/budget.ts";

/** 1 USD = 50 TL — testlerde hesap kolay olsun diye. */
const RATE = 50;
const limits = { dailyTry: 100, monthlyTry: 1000 };

test("tavan VARSAYILAN OLARAK açık gelir", () => {
  // Kapalı bir koruma koruma değildir: kimse ayarlara girip tavan kurmayı
  // akıl etmez, fatura geldiğinde akıl eder.
  assert.ok(DEFAULT_BUDGET.dailyTry > 0);
  assert.ok(DEFAULT_BUDGET.monthlyTry > 0);
  assert.ok(DEFAULT_BUDGET.monthlyTry > DEFAULT_BUDGET.dailyTry);
});

test("sınırın altında hiçbir şey söylenmez", () => {
  const s = budgetStatus({ todayUsd: 0.2, monthUsd: 1 }, limits, RATE); // 10 TL / 50 TL
  assert.equal(s.state, "ok");
  assert.equal(s.message, null);
});

test("GÜNLÜK tavan dolunca engellenir", () => {
  const s = budgetStatus({ todayUsd: 2, monthUsd: 4 }, limits, RATE); // 100 TL
  assert.equal(s.state, "blocked");
  assert.equal(s.scope, "day");
});

test("AYLIK tavan dolunca engellenir — gün sınırı boş olsa bile", () => {
  const s = budgetStatus({ todayUsd: 0.1, monthUsd: 20 }, limits, RATE); // 5 TL / 1000 TL
  assert.equal(s.state, "blocked");
  assert.equal(s.scope, "month");
});

test("ikisi de doluysa AY bildirilir — daha uzun süre engelleyen sınır", () => {
  // Kullanıcı "yarın açılır" sanıp beklememeli.
  const s = budgetStatus({ todayUsd: 3, monthUsd: 30 }, limits, RATE);
  assert.equal(s.scope, "month");
  assert.match(s.message!, /Ay dönünce/);
});

test("engel mesajı NE OLDUĞUNU, NE ZAMAN AÇILACAĞINI ve ÇIKIŞ YOLUNU söyler", () => {
  // Sebebi söylenmeyen bir engel, kullanıcının gözünde bozuk bir uygulamadır.
  const s = budgetStatus({ todayUsd: 2, monthUsd: 2 }, limits, RATE);
  assert.match(s.message!, /100 TL/); // hangi sınır
  assert.match(s.message!, /yeni istek gönderilmedi/); // ne oldu
  assert.match(s.message!, /Gün dönünce/); // ne zaman açılır
  assert.match(s.message!, /Ayarlar → Harcama tavanı/); // nasıl yükseltilir
  assert.match(s.message!, /TAHMİN/); // rakamın niteliği
});

test("tavana TAM oturmak da engeller", () => {
  // "Küsuratla geçmedi" diye devam etmek, sınırı anlamsız kılardı.
  const s = budgetStatus({ todayUsd: 2, monthUsd: 2 }, limits, RATE); // tam 100 TL
  assert.equal(s.state, "blocked");
});

test("eşiğe yaklaşınca UYARIR ama engellemez", () => {
  const spentUsd = (limits.dailyTry * WARN_RATIO) / RATE;
  const s = budgetStatus({ todayUsd: spentUsd, monthUsd: spentUsd }, limits, RATE);
  assert.equal(s.state, "warn");
  assert.match(s.message!, /Kalan/);
  assert.ok(s.remainingTry! > 0);
});

test("uyarıda DAHA DOLU olan sınır bildirilir", () => {
  // Günlük %90, aylık %10 → kullanıcının bilmesi gereken günlük olan.
  const s = budgetStatus({ todayUsd: 1.8, monthUsd: 2 }, limits, RATE);
  assert.equal(s.state, "warn");
  assert.equal(s.scope, "day");
});

test("sınır 0 ise o sınır KAPALI sayılır", () => {
  const s = budgetStatus({ todayUsd: 100, monthUsd: 100 }, { dailyTry: 0, monthlyTry: 0 }, RATE);
  assert.equal(s.state, "ok");
  assert.equal(s.remainingTry, null);
});

test("yalnız AY kapalıyken gün sınırı çalışmaya devam eder", () => {
  const s = budgetStatus({ todayUsd: 3, monthUsd: 100 }, { dailyTry: 100, monthlyTry: 0 }, RATE);
  assert.equal(s.state, "blocked");
  assert.equal(s.scope, "day");
});

test("BOZUK kayıt varsayılana düşer — tavan sessizce kaybolmaz", () => {
  // Asıl tehlike: bozuk değer 0'a çevrilseydi tavan kapanır ve kimse fark
  // etmezdi. Bozuk kayıtta korumanın güçlenmesi gerekir, zayıflaması değil.
  assert.deepEqual(normalizeLimits(undefined), DEFAULT_BUDGET);
  assert.deepEqual(normalizeLimits({}), DEFAULT_BUDGET);
  assert.deepEqual(normalizeLimits({ dailyTry: "abc", monthlyTry: null }), DEFAULT_BUDGET);
  assert.deepEqual(normalizeLimits({ dailyTry: -5, monthlyTry: NaN }), DEFAULT_BUDGET);
});

test("kullanıcının yazdığı GEÇERLİ değer korunur", () => {
  assert.deepEqual(normalizeLimits({ dailyTry: 25, monthlyTry: 400 }), {
    dailyTry: 25,
    monthlyTry: 400,
  });
  // 0 geçerlidir: kullanıcı bilerek kapatabilir.
  assert.deepEqual(normalizeLimits({ dailyTry: 0, monthlyTry: 0 }), {
    dailyTry: 0,
    monthlyTry: 0,
  });
});

test("hata türü AYIRT EDİLEBİLİR — 'bağlantı hatası' gibi gösterilmesin", () => {
  // Bu bir arıza değil, uygulamanın bilerek verdiği karar. Ayırt edilemezse
  // kullanıcı olmayan bir ağ sorununu aramaya başlar.
  const s = budgetStatus({ todayUsd: 5, monthUsd: 5 }, limits, RATE);
  const err = new BudgetExceededError(s);
  assert.ok(isBudgetError(err));
  assert.ok(!isBudgetError(new Error("network")));
  assert.equal(err.message, s.message);
  assert.equal(err.status.scope, "day");
});
