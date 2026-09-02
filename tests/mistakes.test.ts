/** Hata defteri konu eşleştirmesi testleri. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { findOpenSameTopic, normalizeTopic, sameTopic, topicTokens } from "../src/mistakes.ts";

test("normalizeTopic: Türkçe küçültme + noktalama temizliği", () => {
  assert.equal(normalizeTopic("  İYELİK  Ekleri! "), "iyelik ekleri");
  assert.equal(normalizeTopic("Fiil-İsim uyumu"), "fiil isim uyumu");
});

test("topicTokens: durak kelimeler ve kısa kelimeler elenir, kökler kısaltılır", () => {
  assert.deepEqual(topicTokens("geçmiş zaman çekimi"), ["geçmi", "zaman", "çekim"]);
  assert.deepEqual(topicTokens("iyelik eki kullanımı"), ["iyeli", "eki"]); // "kullanımı" durak kelime
  assert.deepEqual(topicTokens("ve bir de"), []);
});

test("sameTopic: aynı hatanın farklı yazımları eşleşir", () => {
  assert.equal(sameTopic("geçmiş zaman", "geçmiş zaman çekimi"), true);
  assert.equal(sameTopic("iyelik ekleri", "iyelik eki"), true);
  assert.equal(sameTopic("Fiil çekimi", "fiil çekimleri"), true);
});

test("sameTopic: farklı konular ayrı kalır", () => {
  assert.equal(sameTopic("geçmiş zaman", "şimdiki zaman"), false);
  assert.equal(sameTopic("iyelik ekleri", "sayılar"), false);
  // Baş kelime farklıysa çoğunluk örtüşse bile ayrı: 3 kökün 2'si ortak ama
  // konu başka ("geçmiş" ↔ "gelecek").
  assert.equal(sameTopic("geçmiş zaman kipi", "gelecek zaman kipi"), false);
});

test("sameTopic: tokensız konular birebir karşılaştırılır", () => {
  assert.equal(sameTopic("ve", "ve"), true);
  assert.equal(sameTopic("ve", "de"), false);
});

test("findOpenSameTopic: açık kayıt bulunur, çözülmüş atlanır, en yenisi kazanır", () => {
  const entries = [
    { id: "1", topic: "geçmiş zaman", resolved: true },
    { id: "2", topic: "iyelik ekleri" },
    { id: "3", topic: "geçmiş zaman çekimi" },
  ];
  assert.equal(findOpenSameTopic(entries, "geçmiş zaman")?.id, "3");
  assert.equal(findOpenSameTopic(entries, "iyelik eki")?.id, "2");
  assert.equal(findOpenSameTopic(entries, "sayılar"), undefined);
  // yalnız çözülmüş kayıt varsa yeni kayıt açılmalı → undefined
  assert.equal(findOpenSameTopic([entries[0]], "geçmiş zaman"), undefined);
});
