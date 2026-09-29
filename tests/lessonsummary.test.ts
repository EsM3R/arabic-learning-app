import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeLesson } from "../src/lessonsummary.ts";
import type { ChatMessage, MistakeEntry, VocabCard } from "../src/types.ts";

const since = "2026-09-29T10:00:00.000Z";

function card(addedAt: string, arabic: string): VocabCard {
  return {
    id: arabic,
    arabic,
    transliteration: "",
    turkish: "t-" + arabic,
    track: "konusma",
    addedAt,
    due: addedAt,
    intervalDays: 0,
    ease: 2.5,
    reps: 0,
  };
}

function mistake(createdAt: string, id: string): MistakeEntry {
  return { id, mistake: "m" + id, correction: "c" + id, explanation: "e" + id, topic: "t", createdAt };
}

test("özet yalnız bu oturumun izlerini sayar; uygulama olayı öğrenci sırası değildir", () => {
  const messages: ChatMessage[] = [
    { role: "user", content: "[Uygulama: ders başladı]" },
    { role: "assistant", content: "Merhaba" },
    { role: "user", content: "[sesli] أنا من إسطنبول" },
    { role: "user", content: "bilmiyorum" },
    { role: "user", content: "أَسْكُنُ فِي مَدِينَةٍ" },
  ];
  const s = summarizeLesson(
    messages,
    "arabic",
    since,
    [card("2026-09-28T09:00:00.000Z", "قديم"), card("2026-09-29T10:05:00.000Z", "جديد")],
    [mistake("2026-09-29T10:10:00.000Z", "1"), mistake("2026-09-20T10:10:00.000Z", "0")]
  );
  assert.equal(s.studentTurns, 3);
  assert.equal(s.spokenTurns, 1);
  assert.equal(s.targetTurns, 2);
  assert.deepEqual(s.newWords, [{ target: "جديد", tr: "t-جديد" }]);
  assert.equal(s.corrections.length, 1);
  assert.equal(s.corrections[0].correction, "c1");
});

test("Latin dilde hedef dil sırası ölçülemez → null (uydurma sayı yok)", () => {
  const s = summarizeLesson([{ role: "user", content: "I am fine" }], "latin", since, [], []);
  assert.equal(s.targetTurns, null);
});
