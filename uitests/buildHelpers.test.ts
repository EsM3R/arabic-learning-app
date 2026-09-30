/**
 * Cümle Kurma gösterim yardımcıları — Faz 6: videodaki sıranın ara hâl
 * işareti ve C1+ üslup etiketlerinin alternatiflerde / özette görünmesi.
 */
import { altShown, extraSwaps, stepLabels } from "../src/screens/build/helpers";
import type { BuildBlock, BuildSentence, Swap } from "../src/sentencebuilding";
import { videoSet } from "./fixtures/videoSet";

const sentence0 = (): BuildSentence => videoSet().sentences[0];

const block = (target: string, alts: string[]): BuildBlock => ({
  target,
  tr: "x",
  note: "",
  contrast: "",
  alts,
  kind: "lexical",
  step: 0,
  key: target,
});

test("videodaki sıra: notu 'ara hâl' olan adım cevaptan önce 'henüz eksik' diye işaretlenir; son adım değil", () => {
  const s: BuildSentence = sentence0();
  const withNote: BuildSentence = {
    ...s,
    steps: s.steps.map((st, i) => (i === 1 ? { ...st, note: "ara hâl, henüz eksik" } : st)),
  };
  expect(stepLabels(withNote, 1, "en")).toContain("Ara hâl: henüz eksik");
  expect(stepLabels(s, 1, "en")).not.toContain("Ara hâl: henüz eksik");
  const last = withNote.steps.length - 1;
  const lastNote: BuildSentence = {
    ...s,
    steps: s.steps.map((st, i) => (i === last ? { ...st, note: "ara hâl" } : st)),
  };
  expect(stepLabels(lastNote, last, "en")).not.toContain("Ara hâl: henüz eksik");
});

test("C1+: alternatif etiketiyle; cümle geneli eşdeğerler özette, taş alternatifi ve cinsiyet hariç", () => {
  const b = block("would like to ask for", ["kindly request", "want"]);
  const swaps: Swap[] = [
    { from: ["would", "like", "to", "ask", "for"], to: ["kindly", "request"], label: "resmî" },
    { from: ["would", "like", "to", "ask", "for"], to: ["want"] },
    { from: [",", "but"], to: [".", "However,"], label: "resmî" },
    { from: ["he"], to: ["she"], label: "dişil" },
  ];
  expect(altShown(b, "kindly request", swaps, "en")).toBe("kindly request (resmî)");
  expect(altShown(b, "want", swaps, "en")).toBe("want");
  const base = sentence0();
  const s: BuildSentence = { ...base, blocks: [b], swaps };
  const extra = extraSwaps(s, swaps, "en");
  expect(extra).toEqual([{ from: ", but", to: ". However,", label: "resmî" }]);
});
