/** "Şimdi ne yapmalıyım" karar mantığı testleri. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DUE_URGENT, nextAction } from "../src/nextaction.ts";
import type { StudyState } from "../src/nextaction.ts";

function state(over: Partial<StudyState> = {}): StudyState {
  return {
    vocabTotal: 50,
    dueCount: 0,
    openMistakes: 0,
    hasCurriculum: true,
    nextModule: { id: "k3", title: "Çarşıda pazarlık", track: "konusma" },
    curriculumDone: false,
    spokenTotal: 20,
    shadowedTotal: 5,
    readingsFinished: 2,
    daysSinceActivity: 0,
    ...over,
  };
}

test("müfredat yoksa tek anlamlı iş onu kurmaktır", () => {
  const a = nextAction(state({ hasCurriculum: false, dueCount: 99 }));
  assert.equal(a.screen, "curriculum");
  assert.match(a.label, /Müfredatını kur/);
});

test("defter boşken tekrar değil ders önerilir", () => {
  const a = nextAction(state({ vocabTotal: 0, dueCount: 0 }));
  assert.equal(a.screen, "module");
  assert.equal(a.moduleId, "k3");
  assert.match(a.reason, /Defterin boş/);
});

test("defter boş ve modül yoksa serbest sohbete yönlendirir", () => {
  const a = nextAction(state({ vocabTotal: 0, nextModule: undefined }));
  assert.equal(a.screen, "lesson");
  assert.match(a.reason, /Defterin boş/);
});

test("ara verilmişse dönüş tekrarla başlar ve gün sayısı söylenir", () => {
  const a = nextAction(state({ daysSinceActivity: 5, dueCount: 3 }));
  assert.equal(a.screen, "review");
  assert.match(a.reason, /5 gün ara verdin/);
  assert.equal(a.badge, 3);
});

test("ara verilmiş ama tekrar yoksa tekrar önerilmez", () => {
  const a = nextAction(state({ daysSinceActivity: 9, dueCount: 0 }));
  assert.notEqual(a.screen, "review");
});

test("biriken tekrar modülün önüne geçer", () => {
  const a = nextAction(state({ dueCount: DUE_URGENT }));
  assert.equal(a.screen, "review");
  assert.equal(a.badge, DUE_URGENT);
  // eşiğin altında modül kazanır
  assert.equal(nextAction(state({ dueCount: DUE_URGENT - 1 })).screen, "module");
});

test("hiç sesli çalışmamışsa konuşma öne alınır", () => {
  const a = nextAction(state({ spokenTotal: 0 }));
  assert.equal(a.screen, "pronunciation");
  assert.match(a.reason, /konuşarak gelişir/);
});

test("seviye bitmişse sıradaki seviyeye geçiş önerilir", () => {
  const a = nextAction(state({ curriculumDone: true, nextModule: undefined }));
  assert.equal(a.screen, "curriculum");
  assert.match(a.label, /Sıradaki seviyeye/);
});

test("normal gün: sıradaki modül, parkuruna göre gerekçe", () => {
  const k = nextAction(state());
  assert.equal(k.screen, "module");
  assert.match(k.reason, /konuşma dersin/);
  const o = nextAction(
    state({ nextModule: { id: "o2", title: "Kısa haber", track: "okuma" } })
  );
  assert.match(o.reason, /okuma dersin/);
});

test("modül bittiğinde az sayıdaki tekrar önerilir", () => {
  const a = nextAction(state({ nextModule: undefined, dueCount: 4 }));
  assert.equal(a.screen, "review");
  assert.equal(a.badge, 4);
});

test("açık hatalar birikince hocayla çalışma önerilir", () => {
  const a = nextAction(state({ nextModule: undefined, openMistakes: 4 }));
  assert.equal(a.screen, "lesson");
  assert.equal(a.badge, 4);
  assert.match(a.reason, /4 açık hata/);
});

test("hiç okuma bitmemişse okuma salonu, sonra gölgeleme", () => {
  const r = nextAction(state({ nextModule: undefined, readingsFinished: 0 }));
  assert.equal(r.screen, "reading");
  const s = nextAction(state({ nextModule: undefined, shadowedTotal: 0 }));
  assert.equal(s.screen, "shadowing");
});

test("her şey güncelse serbest sohbet önerilir", () => {
  const a = nextAction(state({ nextModule: undefined }));
  assert.equal(a.screen, "lesson");
  assert.match(a.reason, /Her şey güncel/);
});

test("her durumda etiket ve gerekçe dolu döner", () => {
  const cases: Partial<StudyState>[] = [
    {},
    { hasCurriculum: false },
    { vocabTotal: 0 },
    { dueCount: 40 },
    { spokenTotal: 0 },
    { curriculumDone: true, nextModule: undefined },
    { nextModule: undefined },
  ];
  for (const c of cases) {
    const a = nextAction(state(c));
    assert.ok(a.label.length > 0, "etiket boş");
    assert.ok(a.reason.length > 0, "gerekçe boş");
  }
});
