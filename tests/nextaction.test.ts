/** "Şimdi ne yapmalıyım" karar mantığı testleri. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BALANCE_MIN_DAYS,
  DUE_URGENT,
  nextAction,
  SILENT_WORK_FLOOR,
  speakingGap,
  VOICE_RATIO_MIN,
} from "../src/nextaction.ts";
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
    fluencyTotal: 3,
    readingsFinished: 2,
    daysSinceActivity: 0,
    // Varsayılan: dengeli çalışan öğrenci — konuşma kapısı kapalı kalsın ki
    // diğer kuralların testi ona takılmasın.
    voiceWorkWeek: 20,
    silentWorkWeek: 20,
    activeDays7: 4,
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

test("hiç okuma bitmemişse okuma salonu önerilir", () => {
  const r = nextAction(state({ nextModule: undefined, readingsFinished: 0 }));
  assert.equal(r.screen, "reading");
});

test("hiç gölgeleme yapmamışsa modülün ÖNÜNE geçer", () => {
  // Eskiden gölgeleme listenin en sonundaydı ve sırası haftalarca gelmiyordu;
  // akıcılığın motoru olduğu için artık konuşma kapısının içinde.
  const s = nextAction(state({ shadowedTotal: 0 }));
  assert.equal(s.screen, "shadowing");
});

// ---------------------------------------------------------------------------
// Konuşma kapısı — tek seferlik değil, SÜREKLİ
// ---------------------------------------------------------------------------

test("bir kez konuşmuş olmak kapıyı SONSUZA KADAR kapatmaz", () => {
  // Eski kusur tam buydu: spokenTotal === 0 tek seferlik bir kapıydı, öğrenci
  // hayatında bir kez mikrofona basınca uygulama onu bir daha itmiyordu.
  const a = nextAction(
    state({ spokenTotal: 1, shadowedTotal: 1, voiceWorkWeek: 1, silentWorkWeek: 60, activeDays7: 5 })
  );
  assert.ok(["pronunciation", "shadowing"].includes(a.screen), `beklenmedik ekran: ${a.screen}`);
  assert.match(a.reason, /sessiz geçti/);
});

test("denge bozuksa oran gerekçede yüzde olarak söylenir", () => {
  const a = nextAction(
    state({ spokenTotal: 5, shadowedTotal: 5, voiceWorkWeek: 5, silentWorkWeek: 95, activeDays7: 5 })
  );
  assert.match(a.reason, /%95/);
});

test("bu hafta hiç sesli iş yoksa telaffuza, biraz varsa gölgelemeye", () => {
  const hic = speakingGap(
    state({ spokenTotal: 9, shadowedTotal: 9, voiceWorkWeek: 0, silentWorkWeek: 50, activeDays7: 3 })
  );
  assert.equal(hic?.screen, "pronunciation");
  const az = speakingGap(
    state({ spokenTotal: 9, shadowedTotal: 9, voiceWorkWeek: 3, silentWorkWeek: 50, activeDays7: 3 })
  );
  assert.equal(az?.screen, "shadowing");
});

test("tek günlük çalışma dengesizlik sayılmaz", () => {
  // Bir oturumda 40 kelime tekrar eden biri 'hep yazıyor' değildir; ölçüm
  // en az iki aktif gün ister.
  const a = speakingGap(
    state({
      spokenTotal: 9,
      shadowedTotal: 9,
      voiceWorkWeek: 0,
      silentWorkWeek: 50,
      activeDays7: BALANCE_MIN_DAYS - 1,
    })
  );
  assert.equal(a, null);
});

test("az hacimli hafta dengesizlik sayılmaz", () => {
  const a = speakingGap(
    state({
      spokenTotal: 9,
      shadowedTotal: 9,
      voiceWorkWeek: 0,
      silentWorkWeek: SILENT_WORK_FLOOR - 1,
      activeDays7: 5,
    })
  );
  assert.equal(a, null);
});

test("eşiğin üstünde sesli çalışan öğrenci rahat bırakılır", () => {
  const oran = Math.ceil(VOICE_RATIO_MIN * 100) + 5;
  const a = speakingGap(
    state({
      spokenTotal: 9,
      shadowedTotal: 9,
      voiceWorkWeek: oran,
      silentWorkWeek: 100 - oran,
      activeDays7: 5,
    })
  );
  assert.equal(a, null);
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
