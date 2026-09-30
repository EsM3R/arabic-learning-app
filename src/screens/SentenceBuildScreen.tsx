import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, View } from "react-native";
import Header from "../components/Header";
import { Button, Chip, IconButton, Screen } from "../components/kit";
import { isBudgetError } from "../budget";
import { checkAnswer } from "../buildcheck";
import type { CheckCtx, CheckResult } from "../buildcheck";
import {
  advanceRetell,
  applyNewStepProbe,
  applyPlacement,
  applyTestOut,
  DEFAULT_BUILD_UI,
  historyKey,
  isMemoryDue,
  karmaId,
  knownWords,
  masteredBlockKeys,
  masteryChecklist,
  nextFocus,
  nextPlacementBatch,
  patternIdsOf,
  pendingNewPatterns,
  recordEvent,
  recycleCandidates,
  reviewMemory,
  reviewQueue,
  scheduleRetell,
  shouldOfferPlacement,
} from "../buildmastery";
import type {
  BlockProgress,
  BuildHistory,
  BuildUi,
  MasteryEvent,
  ProbeOutcome,
  ProgressMap2,
  RecordCtx,
  SentenceMemory,
} from "../buildmastery";
import { methodFor, systemById } from "../buildmethod";
import { continueSet, isGenerating, resumePending, startSet } from "../buildpipeline";
import type { PipelineHooks } from "../buildpipeline";
import { generateMoreTransfer, generateProbe } from "../claude";
import { getActivePack } from "../languages";
import { isRtl } from "../scripts";
import {
  bandIndex,
  BANDS,
  blockKey,
  compileSentence,
  PATTERN_LADDER,
  patternById,
  rankThemes,
  themeById,
  themeFits,
  toBand,
} from "../sentencebuilding";
import type { BuildBlock, BuildSet, Card, Pattern, Swap, Theme } from "../sentencebuilding";
import { speakTargetWith, stopSpeaking, warmTargetSpeech } from "../speech";
import { newCard } from "../srs";
import type { StatEvent } from "../stats";
import { recordStats } from "../statsStore";
import {
  loadBuildBlocks,
  loadBuildHistory,
  loadBuildMemory,
  loadBuildProgress2,
  loadBuildSets2,
  loadBuildUi,
  loadVocab,
  saveBuildBlocks,
  saveBuildMemory,
  saveBuildProgress2,
  saveBuildUi,
  saveVocab,
  touchLastActivity,
} from "../storage";
import { normalizeTarget } from "../textnorm";
import type { Profile } from "../types";
import { useDictation } from "../useDictation";
import BuildHome from "./build/BuildHome";
import type { SetAction } from "./build/BuildHome";
import ConnectorCard from "./build/ConnectorCard";
import DoneView from "./build/DoneView";
import type { SessionTally } from "./build/DoneView";
import {
  blocksAt,
  canSplit,
  learnerVariant,
  openOk,
  pairPrompt,
  recycledAt,
  retrievalBlockKeys,
  splitRetell,
  stageIndex,
  stripHarakat,
} from "./build/helpers";
import KurusReplay from "./build/KurusReplay";
import LadderPicker from "./build/LadderPicker";
import OneShotCard from "./build/OneShotCard";
import PracticeCard from "./build/PracticeCard";
import type { PracticeKind } from "./build/PracticeCard";
import PreparingCard from "./build/PreparingCard";
import ReadCard from "./build/ReadCard";
import RecapCard from "./build/RecapCard";
import RecallChips from "./build/RecallChips";
import type { RecallItem } from "./build/RecallChips";
import {
  addMemory,
  applyBlockEvent,
  applyEvent,
  applyRecycledCredit,
  ensureBlocks,
  markConnSeen,
  recordCtx,
  upsertSentenceBlocks,
} from "./build/record";
import type { BuildEvent } from "./build/record";
import ReorderCard from "./build/ReorderCard";
import RetellView from "./build/RetellView";
import RetrievalCard from "./build/RetrievalCard";
import ReviewSession from "./build/ReviewSession";
import type { SessionAnswer, SessionItem } from "./build/ReviewSession";
import SetIntro from "./build/SetIntro";
import StepCard from "./build/StepCard";
import SystemLessonCard from "./build/SystemLessonCard";
import type { Attempt, ViewOpts } from "./build/types";
import { SentenceBar, ShowTargetProvider, TrHeader, useBuildStyles } from "./build/ui";
import VoiceFooter from "./build/VoiceFooter";
import type { FooterAction } from "./build/VoiceFooter";

interface Props {
  profile: Profile;
  onBack: () => void;
}

type Phase = "home" | "loading" | "intro" | "card" | "preparing" | "retell" | "done" | "session" | "ladder";
/** learn: sayılır · review: tek seferde (yalnız vadesi gelmişse sayılır) · practice: sayılmaz. */
type Mode = "learn" | "review" | "practice";

/** Doğru cevaptan sonra, okunacak yeni bir şey yoksa bu kadar bekleyip geçilir. */
const FAST_FLOW_MS = 800;

/** Denemenin henüz yazılmamış kaydı: ilerleyince yazılır, "sayma" ile silinir. */
interface Pending {
  events: BuildEvent[];
  score: { ok: number; total: number };
  tally: Partial<SessionTally>;
  stats: StatEvent[];
  /**
   * Denemeden ÖNCEKİ kart durumu. "Sayma" denemeyi hiç olmamış sayar: bir
   * yanlıştan sonraki kopya silinince sonraki cevap yine kopyadır, ilk
   * deneme hakkı geri gelmez (CM-8); tek seferin ve seçilen varyantın izi de silinir.
   */
  undo?: { firstDone: boolean; missed: boolean; oneshotOk: boolean | null; choices: Swap[] };
  /** "Tek seferde tekrar" vadesi gelmiş cümlede: cümle tekrarının takvimi de yürür. */
  memory?: { key: string; ok: boolean };
}

/**
 * Tek seferlik oturumun türü: tekrar (kayıtlı cümleler + yoklama + eski
 * hikâye), yerleştirme, "Sına ve geç" ya da yeni basamak yoklaması.
 */
type SessionMode = "review" | "placement" | "testout" | "newsteps";

interface SessionState {
  mode: SessionMode;
  title: string;
  intro?: string;
  items: SessionItem[];
  /** Oturumu bir kez başlatınca artar: aynı bileşen yeni oturumda sıfırlansın. */
  run: number;
  /** Anlatılan eski set (bitince anlatım takvimi ilerler). */
  retellSetId?: string;
  /** Sına ve geç: hangi kalıp. */
  patternId?: string;
}

interface PracticeState {
  kind: PracticeKind;
  blockKey: string;
  prompt: { target: string; tr: string } | null;
  /** "Başka örnek" ile gelen aktarım cümleleri. */
  extra: { target: string; tr: string }[];
  loading: boolean;
}

interface RetellState {
  indices: number[];
  /** -1: giriş. */
  at: number;
  all: boolean;
  attempts: Record<number, Attempt>;
  title: string;
  /** Bitince: set sonu ya da (üretilemeyen sentezin yerine) sıradaki cümle. */
  resume: number | null;
}

const EMPTY_TALLY: SessionTally = { ok: 0, total: 0, unscaffolded: 0, transfer: 0, retell: 0 };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * CÜMLE KURMA — Türkçe cümleyi hedef dile hocanın yöntemiyle kurmak.
 *
 * Ekran bir KART SIRASI denetleyicisidir: her cümle compileSentence ile
 * kartlara çevrilir (oku → öğrendik → bağlaç → [tek seferde → hocanın
 * kuruşu] → adımlar → sıralama → pratik → özet) ve öğrenci her adımda o
 * ana kadarki cümlenin TAMAMINI sesli söyler. Açıklamalar cevaptan sonra
 * gelir; önceden gösterilen tek şey bağlaç kartı ve Türkçe tetik lambası.
 *
 * Üretim plan + cümle cümle (buildpipeline): öğrenci ilk cümleye başlarken
 * sonrakiler arka planda hazırlanır. Denetim tamamen cihazda (buildcheck).
 * Sayım kuralları: yalnız ilk deneme; yanlıştan ya da "Bilmiyorum"dan
 * sonraki tekrar hiçbir şey saymaz; yanlış duyulmuş deneme silinebilir.
 */
export default function SentenceBuildScreen({ profile, onBack }: Props) {
  const { c } = useBuildStyles();
  const pack = getActivePack();
  const lang = pack.id;
  const rtl = isRtl(pack.script);
  /** Öğrencinin konuşma seviyesi: sıradaki kalıp ve yerleştirme buna göre. */
  const band = toBand(profile.assessment?.speakingLevel);

  // ------------------------------------------------------------------ depolar
  const [sets, setSets] = useState<BuildSet[]>([]);
  const [progress, setProgress] = useState<ProgressMap2>({});
  const [blocks, setBlocks] = useState<Record<string, BlockProgress>>({});
  const [memory, setMemory] = useState<SentenceMemory[]>([]);
  const [history, setHistory] = useState<Record<string, BuildHistory>>({});
  const [ui, setUi] = useState<BuildUi>(DEFAULT_BUILD_UI);
  // Depo yazımları sıralı: art arda iki olay aynı haritayı okuyup birbirini ezmesin.
  const stores = useRef({ progress: {} as ProgressMap2, blocks: {} as Record<string, BlockProgress>, memory: [] as SentenceMemory[], ui: DEFAULT_BUILD_UI });

  // ------------------------------------------------------------------ oturum
  const [phase, setPhase] = useState<Phase>("home");
  const [mode, setMode] = useState<Mode>("learn");
  const [set, setSet] = useState<BuildSet | null>(null);
  const setIdRef = useRef<string | null>(null);
  const [si, setSi] = useState(0);
  const [cards, setCards] = useState<Card[]>([]);
  const [ci, setCi] = useState(0);
  const [oneshotOk, setOneshotOk] = useState<boolean | null>(null);
  const [choices, setChoices] = useState<Swap[]>([]);
  const [fem, setFem] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // ------------------------------------------------------------------ deneme
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [firstDone, setFirstDone] = useState(false);
  /** missedStep: yanlış ya da "Bilmiyorum" — bu kartta sonraki deneme kopya sayılır. */
  const [missed, setMissed] = useState(false);
  const [voidUsed, setVoidUsed] = useState(false);
  const pending = useRef<Pending | null>(null);
  const [answer, setAnswer] = useState("");
  const [keyboard, setKeyboard] = useState(false);
  const [score, setScore] = useState({ ok: 0, total: 0 });
  const [tally, setTally] = useState<SessionTally>(EMPTY_TALLY);

  // Kartlara özgü durumlar.
  const [recallActive, setRecallActive] = useState<string | null>(null);
  const [recallResults, setRecallResults] = useState<Record<string, Attempt>>({});
  const [picked, setPicked] = useState<0 | 1 | null>(null);
  /** Geri çağırmada sesle söylenen ama seçeneklere uymayan duyuş. */
  const [unheard, setUnheard] = useState<string | null>(null);
  const [splitDone, setSplitDone] = useState(false);
  const [practice, setPractice] = useState<PracticeState | null>(null);
  const [retell, setRetell] = useState<RetellState | null>(null);
  const [savedSentences, setSavedSentences] = useState<number[]>([]);
  const [session, setSession] = useState<SessionState | null>(null);
  const [loadingText, setLoadingText] = useState<string | null>(null);
  /** Oturumun duyulanı: ekranın tek mikrofonu oturum kartına yollar. */
  const sessionHeard = useRef<((given: string[], spoken: boolean) => void) | null>(null);
  /** Yoklama cevapları (kalıp → ilk denemeler), oturum bitince uygulanır. */
  const outcomes = useRef<Record<string, ProbeOutcome>>({});
  const [savedAll, setSavedAll] = useState(false);
  const counted = useRef<{ conn: Set<number>; reorder: Set<number>; finished: Set<number> }>({
    conn: new Set(),
    reorder: new Set(),
    finished: new Set(),
  });

  const alive = useRef(true);
  /** Her kart/deneme sıfırlamasında artar: eski kartın gecikmeli "geç"i yeni kartı atlatmasın. */
  const cardGen = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimers();
    };
  }, []);

  // ------------------------------------------------------------------ üretim kancaları
  const hooks = useMemo<PipelineHooks>(
    () => ({
      onUpdate: (s) => {
        if (!alive.current) return;
        setSets((list) => [s, ...list.filter((x) => x.id !== s.id)].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
        if (s.id === setIdRef.current) setSet(s);
      },
      onError: (e, s) => {
        if (!alive.current) return;
        if (s.id === setIdRef.current) setGenError(errText(e));
      },
    }),
    []
  );

  useEffect(() => {
    void (async () => {
      const [s2, p2, bl, mem, hist, u] = await Promise.all([
        loadBuildSets2(),
        loadBuildProgress2(),
        loadBuildBlocks(),
        loadBuildMemory(),
        loadBuildHistory(),
        loadBuildUi(),
      ]);
      if (!alive.current) return;
      stores.current = { progress: p2, blocks: bl, memory: mem, ui: u };
      setSets(s2);
      setProgress(p2);
      setBlocks(bl);
      setMemory(mem);
      setHistory(hist);
      setUi(u);
      // Yarım kalan setin bekleyen cümleleri kaldığı yerden hazırlanmaya devam eder.
      void resumePending(profile, { hooks }).catch(() => undefined);
    })();
    // Açılışta bir kez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------ türetilenler
  const sentence = set?.sentences[si] ?? null;
  const card: Card | undefined = cards[ci];
  const harakat = ui.showHarakat !== false;
  const view: ViewOpts = useMemo(
    () => ({ rtl, harakat, show: (t: string) => (harakat ? t : stripHarakat(t)) }),
    [rtl, harakat]
  );
  const vt = (t: string) => (sentence ? learnerVariant(t, sentence.swaps, lang, choices) : t);
  const focus = useMemo(() => nextFocus(progress, band, new Date(), ui.focusOverride), [progress, band, ui.focusOverride]);
  const focusMain = focus.patterns[0];

  const isDue = (key: string) => memory.some((m) => m.key === key && Date.parse(m.dueAt) <= Date.now());
  /** Bu oturumun olayları ilerlemeye yazılır mı: öğrenmede evet, tekrarda yalnız vadesi gelmişse. */
  const credited = (key: string) => mode === "learn" || (mode === "review" && isDue(key));

  // ------------------------------------------------------------------ depo yazımı
  const commitEvents = useCallback(
    (evs: BuildEvent[]) => {
      if (!set || !evs.length) return;
      let p = stores.current.progress;
      let b = stores.current.blocks;
      for (const ev of evs) {
        p = applyEvent(p, set, ev);
        p = applyRecycledCredit(p, set, ev, b);
        // Taşı öğreten cümlenin olayları özet kartından önce gelir: kayıt
        // yoksa açılır, yoksa ilk denemedeki tuzak ve üretim kaybolurdu.
        if (mode === "learn") b = ensureBlocks(b, set, ev.si, ev.blockKeys);
        b = applyBlockEvent(b, ev);
      }
      stores.current = { ...stores.current, progress: p, blocks: b };
      setProgress(p);
      setBlocks(b);
      void saveBuildProgress2(p);
      void saveBuildBlocks(b);
    },
    [set, mode]
  );

  const saveUi = (next: BuildUi) => {
    stores.current = { ...stores.current, ui: next };
    setUi(next);
    void saveBuildUi(next);
  };

  /** Bekleyen denemeyi yazar: kayıt, puan, istatistik. */
  const flush = () => {
    const pd = pending.current;
    pending.current = null;
    if (!pd) return;
    commitEvents(pd.events.filter((e) => e.k !== "copy"));
    if (pd.memory) {
      const m = reviewMemory(stores.current.memory, pd.memory.key, pd.memory.ok);
      stores.current = { ...stores.current, memory: m };
      setMemory(m);
      void saveBuildMemory(m);
    }
    if (pd.score.total) setScore((sc) => ({ ok: sc.ok + pd.score.ok, total: sc.total + pd.score.total }));
    const td = pd.tally;
    if (Object.keys(td).length) {
      setTally((t) => ({
        ...t,
        unscaffolded: t.unscaffolded + (td.unscaffolded ?? 0),
        transfer: t.transfer + (td.transfer ?? 0),
        retell: t.retell + (td.retell ?? 0),
      }));
    }
    if (pd.stats.length) void recordStats(pd.stats);
    void touchLastActivity();
  };

  // ------------------------------------------------------------------ kart gezinme
  const resetAttempt = () => {
    clearTimers();
    cardGen.current += 1;
    pending.current = null;
    setAttempt(null);
    setFirstDone(false);
    setMissed(false);
    setVoidUsed(false);
    setAnswer("");
    setRecallActive(null);
    setPicked(null);
    setUnheard(null);
    setSplitDone(false);
  };

  /** Tek seferin sonucuna göre atlanan kartlar. */
  const skipped = (cd: Card, os: boolean | null) =>
    (os === true && (cd.t === "step" || cd.t === "system" || cd.t === "retrieval")) || (os !== true && cd.t === "kurus");

  const enterCard = (list: Card[], idx: number, s = set, sIdx = si) => {
    resetAttempt();
    setCi(idx);
    const cd = list[idx];
    if (!cd || !s) return;
    const sen = s.sentences[sIdx];
    if (cd.t === "pair" || cd.t === "transfer") {
      const b = sen.blocks.find((x) => x.key === cd.blockKey);
      const prompt = b ? (cd.t === "pair" ? pairPrompt(sen, b, s.lang) : b.transfer ?? null) : null;
      setPractice({ kind: cd.t, blockKey: cd.blockKey, prompt, extra: [], loading: false });
    } else if (cd.t === "open") {
      setPractice({ kind: "open", blockKey: cd.blockKey, prompt: null, extra: [], loading: false });
    } else {
      setPractice(null);
    }
    if (cd.t === "recap") finishSentence(s, sIdx);
  };

  const enterSentence = (s: BuildSet, idx: number, m: Mode = mode) => {
    const sen = s.sentences[idx];
    setSi(idx);
    setOneshotOk(null);
    setChoices([]);
    setFem(false);
    if (!sen) {
      finishSet(s, m);
      return;
    }
    if (sen.status === "pending") {
      resetAttempt();
      setPhase("preparing");
      return;
    }
    if (sen.status === "failed") {
      // Son cümle üretilemediyse ve set sonu "Günümü anlat" zaten gelecekse
      // yerine ayrı bir anlatım açılmaz: aynı seti art arda iki kez anlattırmak olurdu.
      const last = !s.sentences.slice(idx + 1).some((x) => x.status !== "failed");
      const readyCount = s.sentences.filter((x) => x.status === "ready").length;
      if (last && m === "learn" && readyCount >= 2) {
        finishSet(s, m);
        return;
      }
      if (sen.retellOf?.length) {
        startRetell(sen.retellOf, "Son cümle yerine: son iki cümleyi birlikte anlat", idx + 1);
        return;
      }
      // Üretilemeyen cümle atlanır; yeni taşları sıradaki cümleye taşındı.
      enterSentence(s, idx + 1, m);
      return;
    }
    const list = compileSentence(s, idx, {
      band: s.level,
      masteredBlocks: masteredBlockKeys(stores.current.blocks),
      connSeen: stores.current.ui.connSeen,
      reorderSeen: stores.current.ui.reorderSeen,
      review: m === "review",
      practice: m !== "review",
    });
    setCards(list);
    setPhase("card");
    enterCard(list, 0, s, idx);
  };

  const begin = (s: BuildSet, m: Mode) => {
    clearTimers();
    stopSpeaking();
    setIdRef.current = s.id;
    setSet(s);
    setMode(m);
    setSi(0);
    setCards([]);
    setCi(0);
    setScore({ ok: 0, total: 0 });
    setTally(EMPTY_TALLY);
    setSavedSentences([]);
    setSavedAll(false);
    setGenError(null);
    setRetell(null);
    counted.current = { conn: new Set(), reorder: new Set(), finished: new Set() };
    resetAttempt();
    // Cihaz TTS'i: ilk cevaptan sonraki okuma beklemesin diye motor şimdiden hazırlanır.
    warmTargetSpeech();
    setPhase("intro");
  };

  const advance = () => {
    if (!set || !sentence) return;
    flush();
    stopSpeaking();
    const cd = cards[ci];
    // Bağlaç kartı görüldü: bir sonraki sette karşıtlık yok, 3. bağlaçtan sonra öğrenci böler.
    // Yalnız öğrenmede: tekrar ve pratik aynı cümleleri yeniden gösterir, sayaçları şişirmesin.
    if (cd?.t === "connector" && mode === "learn" && !counted.current.conn.has(si)) {
      counted.current.conn.add(si);
      saveUi(markConnSeen(stores.current.ui, cd.card.target, set));
    }
    if (cd?.t === "reorder" && mode === "learn" && !counted.current.reorder.has(si)) {
      counted.current.reorder.add(si);
      const u = stores.current.ui;
      saveUi({ ...u, reorderSeen: u.reorderSeen + 1 });
    }
    let n = ci + 1;
    while (n < cards.length && skipped(cards[n], oneshotOk)) n += 1;
    if (n < cards.length) {
      enterCard(cards, n);
      return;
    }
    enterSentence(set, si + 1);
  };
  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  /** Tek seferde olmadı ya da öğrenci "Adım adım kur" dedi: adımlar açılır. */
  const toSteps = () => {
    flush();
    stopSpeaking();
    setOneshotOk(false);
    let n = ci + 1;
    while (n < cards.length && skipped(cards[n], false)) n += 1;
    if (n < cards.length) enterCard(cards, n);
    else if (set) enterSentence(set, si + 1);
  };

  /** Biten cümle: taşları hafızaya, cümleyi aralıklı tekrara. */
  const finishSentence = (s: BuildSet, idx: number) => {
    if (mode !== "learn" || counted.current.finished.has(idx)) return;
    counted.current.finished.add(idx);
    const b = upsertSentenceBlocks(stores.current.blocks, s, idx);
    const m = addMemory(stores.current.memory, s, idx);
    stores.current = { ...stores.current, blocks: b, memory: m };
    setBlocks(b);
    setMemory(m);
    void saveBuildBlocks(b);
    void saveBuildMemory(m);
  };

  const finishSet = (s: BuildSet, m: Mode) => {
    const ready = s.sentences.map((x, i) => (x.status === "ready" ? i : -1)).filter((i) => i >= 0);
    if (m === "learn" && ready.length >= 2) {
      startRetell(ready, "Günümü anlat", null);
      return;
    }
    setPhase("done");
  };

  // ------------------------------------------------------------------ yeni set
  const askBudget = (note: string) =>
    new Promise<boolean>((resolve) => {
      Alert.alert("Yeni set", note, [
        { text: "Vazgeç", style: "cancel", onPress: () => resolve(false) },
        {
          text: "Evet, hazırla",
          onPress: () => {
            setLoadingText(null);
            setPhase("loading");
            resolve(true);
          },
        },
      ]);
    });

  const startNew = async (focusList: Pattern[], theme: Theme) => {
    try {
      const vocab = await loadVocab();
      const made = await startSet({
        profile,
        focus: focusList,
        theme,
        hooks,
        confirm: askBudget,
        // Karma yalnız oturmuş kalıplardan: cümleler önce tek seferde.
        patternStatus: focusList.length > 1 ? "mastered" : progress[focusList[0]?.id ?? ""]?.status,
        // ÖĞRENİLMİŞ TAŞLAR bütün temalardan, önce zayıflar (CM-14); bildiği kelimeler: zorlandıkları + en yeniler.
        recycle: recycleCandidates(stores.current.blocks),
        known: knownWords(vocab),
      });
      if (!alive.current) return;
      if (!made) {
        setPhase("home");
        return;
      }
      setSets((list) => [made, ...list.filter((x) => x.id !== made.id)]);
      setHistory(await loadBuildHistory());
      begin(made, "learn");
    } catch (e) {
      if (!alive.current) return;
      setPhase("home");
      Alert.alert(isBudgetError(e) ? "Harcama tavanı doldu" : "Set hazırlanamadı", errText(e));
    }
  };

  const openTheme = (t: Theme) => {
    // Aynı kalıp+temada kayıtlı set varsa bedava açılır; yoksa yeni set (tek bütçe onayı).
    // Karma odakta kimlik "karma:a+b": bütün kalıplar kredi alır (CM-16).
    const id = karmaId(focus.patterns);
    const saved = sets.find((s) => s.patternId === id && s.themeId === t.id);
    if (saved) begin(saved, "learn");
    else void startNew(focus.patterns, t);
  };

  const focusOf = (s: BuildSet): Pattern[] =>
    patternIdsOf(s.patternId)
      .map((id) => patternById(id))
      .filter((p): p is Pattern => !!p);

  const onSetAction = (s: BuildSet, a: SetAction) => {
    if (a === "open") begin(s, "learn");
    else if (a === "oneshot") begin(s, "review");
    else if (a === "practice") begin(s, "practice");
    else {
      const th = themeById(s.themeId);
      const f = focusOf(s);
      if (th && f.length) void startNew(f, th);
    }
  };

  const nextEpisode = (s: BuildSet) => (history[historyKey(s.patternId, s.themeId)]?.episode ?? s.episode) + 1;

  // ------------------------------------------------------------------ tek seferlik oturumlar
  /** Oturumu açar: aynı bileşen yeni oturumda baştan başlasın diye run artar. */
  const openSession = (st: Omit<SessionState, "run">) => {
    clearTimers();
    stopSpeaking();
    setAnswer("");
    setSession((prev) => ({ ...st, run: (prev?.run ?? 0) + 1 }));
    setPhase("session");
  };

  const titleOf = (id: string) => patternById(id)?.title ?? id;

  /** Yoklama cümleleri (tek istek; en fazla 8 kalıp). */
  const probeItems = async (patterns: Pattern[], per: number): Promise<SessionItem[]> => {
    const list = await generateProbe(profile, patterns, { lang, band: BANDS[Math.max(bandIndex(band), ...patterns.map((p) => bandIndex(p.band)))], perPattern: per });
    return list.map((x, i) => ({
      id: `probe-${x.pid}-${i}`,
      kind: "probe" as const,
      tr: x.tr,
      cue: titleOf(x.pid),
      target: x.target,
      swaps: x.swaps,
      counted: true,
      pid: x.pid,
      tense: patternById(x.pid)?.tense,
    }));
  };

  const confirmRequest = (title: string, note: string) =>
    new Promise<boolean>((resolve) => {
      Alert.alert(title, note, [
        { text: "Vazgeç", style: "cancel", onPress: () => resolve(false) },
        { text: "Evet", onPress: () => resolve(true) },
      ]);
    });

  /**
   * "Tekrar zamanı" (§6.3–6.4): vadesi gelmiş kayıtlı cümleler tek seferde;
   * vadeli kalıbın kayıtlı cümlesi yetmezse yoklama tamamlar (tek istek,
   * onayla); sonda bir eski hikâye anlatımı. onlyPattern: merdivenden ya
   * da "Doğrula" düğmesinden tek kalıbın tekrarı.
   */
  const startReview = async (onlyPattern?: string) => {
    const now = new Date();
    const plan = reviewQueue(stores.current.progress, stores.current.memory, now, {
      ui: stores.current.ui,
      setIds: sets.map((x) => x.id),
      lastSetId: sets[0]?.id ?? null,
      onlyPattern,
    });
    const byKey = new Map(stores.current.memory.map((m) => [m.key, m]));
    const items: SessionItem[] = [];
    for (const it of plan.items) {
      const m = byKey.get(it.key);
      if (!m) continue;
      // Eski kayıtta eşdeğerler ve zaman yok: set hâlâ duruyorsa oradan alınır,
      // yoksa v1'de kabul edilmiş bir söyleyiş tekrarda yanlış sayılırdı.
      const src = m.alts && m.tense ? undefined : sets.find((x) => x.id === m.setId);
      const srcSen = src?.sentences.find((x) => x.key === m.key);
      items.push({
        id: `mem-${m.key}`,
        kind: "memory",
        tr: m.tr,
        cue: m.patternIds.map(titleOf).join(" + "),
        target: m.target,
        swaps: m.swaps,
        alts: m.alts ?? srcSen?.steps[srcSen.steps.length - 1]?.alts ?? [],
        tense: m.tense ?? src?.tense,
        translit: m.translit,
        steps: m.steps.map((x) => ({ question: x.question, trPiece: x.trPiece, trSoFar: x.trSoFar, target: x.target, note: x.note })),
        counted: it.counted,
      });
    }
    if (plan.probe.length) {
      const pats = plan.probe.map((id) => patternById(id)).filter((p): p is Pattern => !!p).slice(0, 8);
      const go = await confirmRequest(
        "Tekrar için yeni cümle",
        `${pats.map((p) => p.title).join(", ")} için kayıtlı cümle yetmiyor. İkişer yeni cümle hazırlansın mı? Bu 1 API isteği harcar.`
      );
      if (go) {
        setLoadingText("Tekrar cümleleri hazırlanıyor…");
        setPhase("loading");
        try {
          items.push(...(await probeItems(pats, 2)));
        } catch (e) {
          if (!alive.current) return;
          Alert.alert(isBudgetError(e) ? "Harcama tavanı doldu" : "Cümleler gelmedi", errText(e));
        }
        if (!alive.current) return;
      }
    }
    const old = plan.retellSetId ? sets.find((x) => x.id === plan.retellSetId) : undefined;
    if (old) {
      const th = themeById(old.themeId);
      const stages = th?.stages ?? [];
      const ready = old.sentences.map((x, i) => (x.status === "ready" ? i : -1)).filter((i) => i >= 0);
      const showTr = bandIndex(old.level) < bandIndex("B2");
      for (const i of ready) {
        const x = old.sentences[i];
        const stage = stages.length ? stages[stageIndex(i, old.sentences.length, stages.length)] : `${i + 1}. sahne`;
        items.push({
          id: `retell-${old.id}-${i}`,
          kind: "retell",
          // B2+ yalnız sahne: cümleyi hikâyeden kendisi kurar.
          tr: showTr ? x.tr : stage,
          cue: `Eski hikâye: ${th?.title ?? old.themeId} · ${stage}`,
          target: x.target,
          swaps: x.swaps,
          alts: x.steps[x.steps.length - 1]?.alts ?? [],
          tense: old.tense,
          counted: true,
          setId: old.id,
          si: i,
        });
      }
    }
    if (!items.length) {
      setPhase("home");
      Alert.alert("Tekrar yok", "Şu an vadesi gelmiş bir cümle yok. Yeni cümleler kurdukça aralıklı tekrara girer.");
      return;
    }
    outcomes.current = {};
    openSession({
      mode: "review",
      title: onlyPattern ? `Tekrar: ${titleOf(onlyPattern)}` : "Tekrar zamanı",
      intro: "Kurduğun cümleler geri geliyor: tek seferde söyle. Olmazsa hocanın adımlarıyla birlikte kurarız (sayılmaz).",
      items,
      retellSetId: old?.id,
    });
  };

  /** Yoklama oturumu: yerleştirme, "Sına ve geç" ya da yeni basamaklar. */
  const startProbe = async (mode: Exclude<SessionMode, "review">, patterns: Pattern[], per: number, ask = true) => {
    if (!patterns.length) return;
    if (ask) {
      const what =
        mode === "placement"
          ? `Yerleştirme: her kalıptan ${per} cümle, tek seferde. Geçtiğin parti bitince sıradaki parti gelir; her parti 1 API isteği.`
          : mode === "testout"
            ? `"${patterns[0].title}" için ${per} tek seferlik cümle. ${per - 1}'i ilk seferde doğru ve tuzaksızsa kalıbı geçersin. Bu 1 API isteği harcar.`
            : `${patterns.length} yeni basamaktan ikişer cümle. Bu 1 API isteği harcar.`;
      if (!(await confirmRequest(mode === "placement" ? "Yerleştirme" : mode === "testout" ? "Sına ve geç" : "Yeni basamaklar", what))) return;
    }
    setLoadingText(`${pack.teacherName} yoklama cümlelerini hazırlıyor…`);
    setPhase("loading");
    try {
      const items = await probeItems(patterns, per);
      if (!alive.current) return;
      if (mode !== "placement") outcomes.current = {};
      openSession({
        mode,
        title: mode === "placement" ? "Yerleştirme" : mode === "testout" ? "Sına ve geç" : "Yeni basamaklar",
        intro:
          mode === "testout"
            ? "Her cümleyi tek seferde söyle; yalnız ilk deneme sayılır."
            : "Bildiğin kalıpları geçmek için: her cümleyi tek seferde söyle. Bilmiyorsan \"Bilmiyorum\" de, oradan başlarız.",
        items,
        patternId: mode === "testout" ? patterns[0].id : undefined,
      });
    } catch (e) {
      if (!alive.current) return;
      setPhase("home");
      Alert.alert(isBudgetError(e) ? "Harcama tavanı doldu" : "Yoklama hazırlanamadı", errText(e));
    }
  };

  const startPlacement = () => {
    outcomes.current = {};
    void startProbe("placement", nextPlacementBatch(band, {}), 2);
  };

  /** Oturumdaki ilk deneme: kanıt, cümle tekrarı ve yoklama sonucu (§4.5). */
  const onSessionAnswer = (a: SessionAnswer) => {
    const it = a.item;
    const now = new Date();
    let st = { progress: stores.current.progress, blocks: stores.current.blocks };
    let mem = stores.current.memory;
    const ev = (k: MasteryEvent["k"], sk: string, blockKeys?: string[]): MasteryEvent => {
      const e: MasteryEvent = { k, ok: a.ok, first: true, spoken: a.spoken, sk };
      if (a.trap) e.trap = a.trap;
      if (blockKeys?.length) e.blockKeys = blockKeys;
      return e;
    };
    if (it.kind === "memory") {
      const key = it.id.slice(4);
      const m = mem.find((x) => x.key === key);
      if (m && it.counted) {
        // Vadesi gelmişse takvim yürür; kalıp için çekilen erken cümle yalnız günlük tavana yazılır.
        mem = isMemoryDue(m, now)
          ? reviewMemory(mem, key, a.ok > 0, now)
          : mem.map((x) => (x.key === key ? { ...x, lastAt: now.toISOString() } : x));
        const ctx: RecordCtx = { patternIds: m.patternIds, themeId: m.themeId, setId: m.setId, usesFocus: m.focus !== false };
        st = recordEvent(st, ctx, ev("review", m.key, m.blockKeys), now);
      }
    } else if (it.kind === "probe" && it.pid) {
      const ctx: RecordCtx = { patternIds: [it.pid], themeId: "", setId: "", usesFocus: true };
      st = recordEvent(st, ctx, ev("probe", blockKey(it.target, lang)), now);
      const o = outcomes.current[it.pid] ?? { oks: [], trap: false };
      outcomes.current[it.pid] = { oks: [...o.oks, a.ok], trap: o.trap || !!a.trap };
    } else if (it.kind === "retell" && it.setId !== undefined && it.si !== undefined) {
      const old = sets.find((x) => x.id === it.setId);
      const sen = old?.sentences[it.si];
      if (old && sen) {
        // Taşlar da yazılır: eski hikâyeyi anlatmak taşların son kullanımı ve tuzağıdır.
        const keys = sen.blocks.map((b) => b.key || blockKey(b.target, old.lang)).filter(Boolean);
        st = recordEvent(st, recordCtx(old, it.si), ev("retell", sen.key, keys), now);
      }
    }
    stores.current = { ...stores.current, progress: st.progress, blocks: st.blocks, memory: mem };
    setProgress(st.progress);
    setBlocks(st.blocks);
    setMemory(mem);
    void saveBuildProgress2(st.progress);
    void saveBuildBlocks(st.blocks);
    if (mem !== memory) void saveBuildMemory(mem);
    const stats: StatEvent[] = a.spoken ? ["spoken"] : [];
    if (a.ok > 0 && it.counted) stats.push("produced", "sentenceBuilt");
    if (stats.length) void recordStats(stats);
    void touchLastActivity();
  };

  /**
   * Oturumdan yarıda çıkış: verilen cevaplar kanıt olarak yazıldı ama
   * yoklama sonucu uygulanmaz (yarım yoklama bir kalıbı geçirmemeli).
   */
  const exitSession = () => {
    stopSpeaking();
    outcomes.current = {};
    setSession(null);
    setPhase("home");
  };

  /** Oturum bitti: yoklama sonuçları uygulanır, anlatım takvimi ilerler. */
  const onSessionDone = () => {
    const sess = session;
    setSession(null);
    setPhase("home");
    if (!sess) return;
    const now = new Date();
    const save = (p: ProgressMap2) => {
      stores.current = { ...stores.current, progress: p };
      setProgress(p);
      void saveBuildProgress2(p);
    };
    if (sess.mode === "review") {
      if (sess.retellSetId) saveUi(advanceRetell(stores.current.ui, sess.retellSetId, now));
      return;
    }
    if (sess.mode === "testout" && sess.patternId) {
      const id = sess.patternId;
      const r = applyTestOut(stores.current.progress, id, outcomes.current[id] ?? { oks: [], trap: false }, now);
      save(r.progress);
      if (r.passed) {
        if (stores.current.ui.focusOverride === id) saveUi({ ...stores.current.ui, focusOverride: undefined });
        Alert.alert("Geçtin", `"${titleOf(id)}" atlandı. Birkaç gün sonra bir tekrarla doğrulanacak.`);
      } else {
        Alert.alert("Henüz değil", `"${titleOf(id)}" için 4 cümleden en az 3'ü ilk seferde ve tuzaksız doğru olmalı.`, [
          { text: "Tamam", style: "cancel" },
          { text: "Bunu çalış", onPress: () => saveUi({ ...stores.current.ui, focusOverride: id }) },
        ]);
      }
      return;
    }
    if (sess.mode === "newsteps") {
      save(applyNewStepProbe(stores.current.progress, outcomes.current, now));
      return;
    }
    // Yerleştirme: parti yanlışsız bittiyse merdivende yürümeye devam.
    const more = nextPlacementBatch(band, outcomes.current);
    if (more.length) {
      void startProbe("placement", more, 2, false);
      return;
    }
    const r = applyPlacement(stores.current.progress, band, outcomes.current, now);
    save(r.progress);
    saveUi({ ...stores.current.ui, placementDone: true });
    const passed = Object.values(r.progress).filter((p) => p.status === "verify").length;
    Alert.alert(
      "Yerleştirme bitti",
      `${passed} kalıp geçildi; birkaç gün içinde tekrarla doğrulanacak.${r.focus ? ` Sıradaki: ${titleOf(r.focus)}.` : ""}`
    );
  };

  // ------------------------------------------------------------------ bekleyen cümle
  useEffect(() => {
    if (phase !== "preparing" || !set) return;
    const s = set.sentences[si];
    if (s && s.status !== "pending") {
      enterSentence(set, si);
      return;
    }
    if (!genError && !isGenerating(set.id)) {
      void continueSet(profile, set.id, { hooks }).catch(() => undefined);
    }
    // enterSentence her çizimde yeniden kurulur; tetikleyici set/aşama değişimi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, set, si, genError]);

  // ------------------------------------------------------------------ denetim
  const baseCtx = (spoken: boolean): CheckCtx => {
    const s = sentence!;
    const trapText: Record<string, string> = {};
    for (const b of s.blocks) {
      const t = b.recycled?.firstContrast || b.contrast;
      if (t) for (const id of b.trapIds ?? []) trapText[id] = t;
    }
    return {
      lang,
      script: pack.script,
      spoken,
      swaps: s.swaps,
      choices,
      chunks: s.blocks.filter((b) => b.kind === "chunk").map((b) => b.target),
      tense: set?.tense,
      trapText,
    };
  };

  /** Hedefi söyletir; hızlı akışta TTS bitince kısa bir aradan sonra geçer. */
  const speakAfter = (text: string, auto: boolean) => {
    clearTimers();
    const token = cardGen.current;
    let fired = false;
    const go = () => {
      if (fired) return;
      fired = true;
      if (!auto) return;
      timers.current.push(
        setTimeout(() => {
          if (alive.current && cardGen.current === token) advanceRef.current();
        }, FAST_FLOW_MS)
      );
    };
    speakTargetWith(text, { onDone: go, onError: go });
    // TTS "bitti" demeyen motorlar için bekçi.
    if (auto) timers.current.push(setTimeout(go, 1500 + text.length * 80));
  };

  const toAttempt = (r: CheckResult, spoken: boolean): Attempt => {
    const a: Attempt = { verdict: r.verdict, revealed: false, feedback: r.feedback, expected: r.expected, spoken };
    if (spoken) a.heard = r.heard;
    if (r.trapId) a.trapId = r.trapId;
    return a;
  };

  const stepBlockKeys = (i: number) => {
    const s = sentence!;
    return [...blocksAt(s, i), ...recycledAt(s, i)].map((b) => b.key);
  };

  /** Okunacak yeni bir şey var mı (hızlı akış yalnız yoksa geçer). */
  const hasReading = (cd: Card, r: CheckResult): boolean => {
    const s = sentence!;
    if (r.feedback) return true;
    if (cd.t === "step") {
      const st = s.steps[cd.i];
      if (st.note || st.clauseEnd || cd.i === s.steps.length - 1) return true;
      if (blocksAt(s, cd.i).some((b) => b.note || b.contrast || b.alts.length)) return true;
      const nx = cards[ci + 1];
      return nx?.t === "system";
    }
    return cd.t === "oneshot";
  };

  /** Pratik kartının o anki türü ("Kendi cümlen"/"Başka örnek" kartın türünü değiştirir). */
  const practiceKind = (): PracticeKind | null =>
    card && (card.t === "pair" || card.t === "transfer" || card.t === "open") ? practice?.kind ?? card.t : null;

  const submit = (given: string[], spoken: boolean) => {
    if (!set || !sentence || !card) return;
    const s = sentence;
    // Geri çağırma: sesle de seçilebilir.
    if (card.t === "retrieval") {
      if (picked !== null) return;
      const norm = (x: string) => checkAnswer(x, [], given, { lang, script: pack.script, spoken });
      const hit = card.r.options.findIndex((o) => norm(o)?.verdict === "dogru");
      if (hit === 0 || hit === 1) pickRetrieval(hit);
      else if (spoken && given[0]?.trim()) setUnheard(given[0].trim());
      return;
    }
    if (card.t === "recall") {
      if (!recallActive || recallResults[recallActive]) return;
      const item = recallItems.find((x) => x.key === recallActive);
      if (!item) return;
      const r = checkAnswer(item.target, [], spoken ? given : given[0] ?? "", { lang, script: pack.script, spoken });
      if (!r) return;
      setRecallResults((m) => ({ ...m, [item.key]: toAttempt(r, spoken) }));
      speakTargetWith(item.target);
      if (credited(s.key)) commitEvents([{ k: "retrieval", ok: r.credit, first: true, spoken, sk: s.key, si, blockKeys: [item.key] }]);
      return;
    }
    if (attempt) return;
    const pk = practiceKind();
    const text = spoken ? given : [given[0] ?? ""];
    const first = !firstDone && !missed;
    const cred = credited(s.key);
    const stats: StatEvent[] = spoken ? ["spoken"] : [];
    const pd: Pending = { events: [], score: { ok: 0, total: 0 }, tally: {}, stats, undo: { firstDone, missed, oneshotOk, choices } };

    // "Kendi cümlen": hoşgörülü, yalnız pratik — hiçbir şey yazılmaz.
    if (pk === "open") {
      const b = s.blocks.find((x) => x.key === practice?.blockKey);
      if (!b || !text.some((t) => t.trim())) return;
      const ok = text.some((t) => openOk(t, b, lang));
      setAttempt({ verdict: ok ? "dogru" : "yanlis", revealed: false, feedback: "", expected: b.target, spoken, heard: text[0] });
      setFirstDone(true);
      pending.current = pd;
      speakAfter(b.target, false);
      return;
    }

    let target = "";
    let alts: string[] = [];
    let ctx = baseCtx(spoken);
    if (card.t === "step") {
      const st = s.steps[card.i];
      target = st.target;
      alts = st.alts;
      ctx = { ...ctx, prev: card.i > 0 ? s.steps[card.i - 1].target : undefined, note: st.note };
    } else if (card.t === "oneshot") {
      target = s.target;
      alts = s.steps[s.steps.length - 1]?.alts ?? [];
    } else if (card.t === "reorder") {
      target = s.reorder;
    } else if (pk === "pair" || pk === "transfer") {
      target = practice?.prompt?.target ?? "";
      ctx = { lang, script: pack.script, spoken };
    } else {
      return;
    }
    if (!target) return;
    const r = checkAnswer(target, alts, spoken ? text : text[0], ctx);
    // Boş ya da yalnız noktalama: deneme sayılmaz, hiçbir şey değişmez.
    if (!r) return;
    const ok = r.verdict !== "yanlis";
    const a = toAttempt(r, spoken);
    setAttempt(a);
    setFirstDone(true);
    if (!ok) setMissed(true);
    if (ok && (card.t === "step" || card.t === "oneshot" || card.t === "reorder") && r.used.length) setChoices(r.used);

    const ev = (k: BuildEvent["k"], extra: Partial<BuildEvent> = {}): BuildEvent => {
      const e: BuildEvent = { k, ok: r.credit, first, spoken, sk: s.key, si, ...extra };
      if (r.trapId && !e.trap) e.trap = r.trapId;
      return e;
    };
    if (card.t === "step") {
      const st = s.steps[card.i];
      const linked = st.move === "linked";
      const last = card.i === s.steps.length - 1;
      // Bağlantılı tekrar da bir adımdır: "adımların %X'i ilk seferde" onu da sayar.
      if (first) pd.score = { ok: ok ? 1 : 0, total: 1 };
      if (cred && mode === "learn") {
        if (linked) {
          // Bağlantılı tekrar önceki cümlenin yardımsız kanıtıdır.
          const prev = set.sentences[si - 1];
          if (first && prev) pd.events.push(ev("linked", { sk: prev.key, si: si - 1 }));
          if (first && ok) pd.tally.unscaffolded = 1;
        } else {
          const rec = recycledAt(s, card.i).map((b) => b.key);
          pd.events.push(first ? ev("guided", { blockKeys: stepBlockKeys(card.i), rec: rec.length > 0, recKeys: rec }) : ev("copy"));
        }
      }
      // İstatistik de ilerleme gibi: pratik ve vadesi gelmemiş tekrar sayılmaz.
      if (first && ok && cred) pd.stats.push("produced");
      // Tek seferde kurulduysa adımlar atlanır; tek seferde olmayıp adımlarla
      // kurulan cümle de kurulmuş cümledir.
      if (first && ok && last && cred && oneshotOk !== true) pd.stats.push("sentenceBuilt");
    } else if (card.t === "oneshot") {
      if (first) {
        pd.score = { ok: ok ? 1 : 0, total: 1 };
        const rec = s.blocks.filter((b) => b.recycled).map((b) => b.key);
        if (cred) pd.events.push(ev(mode === "review" ? "review" : "oneshot", { blockKeys: s.blocks.map((b) => b.key), rec: rec.length > 0, recKeys: rec }));
        // Vadesi gelmiş cümlenin "tek seferde tekrar"ı cümle tekrarının takvimini de yürütür.
        if (cred && mode === "review") pd.memory = { key: s.key, ok };
        if (ok) {
          pd.tally.unscaffolded = 1;
          if (cred) pd.stats.push("produced", "sentenceBuilt");
        }
      }
      if (ok) setOneshotOk(true);
    } else if (card.t === "reorder") {
      if (first) pd.score = { ok: ok ? 1 : 0, total: 1 };
      if (cred && mode === "learn") pd.events.push(first ? ev("reorder", { blockKeys: s.connector ? [s.blocks.find((b) => b.kind === "connector")?.key ?? ""].filter(Boolean) : [] }) : ev("copy"));
      if (first && ok) {
        pd.tally.unscaffolded = 1;
        if (cred) pd.stats.push("produced");
      }
    } else if (pk === "pair" || pk === "transfer") {
      if (cred && mode === "learn") pd.events.push(first ? ev(pk, { blockKeys: practice ? [practice.blockKey] : [] }) : ev("copy"));
      if (first && ok) {
        pd.tally.transfer = 1;
        if (cred) pd.stats.push("produced");
      }
    }
    pending.current = pd;

    // Doğru cümleyi duymak kalıbı kulağa da yerleştirir. Tek seferde yanlışsa
    // doğrusu söylenmez: adımlar onu birlikte kuracak.
    if (card.t === "oneshot" && !ok) return;
    speakAfter(r.expected, ui.fastFlow && r.verdict === "dogru" && !hasReading(card, r));
  };

  /** "Bilmiyorum": doğrusu açılır, yanlış sayılır; sonraki deneme kopyadır. */
  const reveal = () => {
    if (!set || !sentence || !card || attempt) return;
    const s = sentence;
    const pk = practiceKind();
    const target =
      card.t === "step" ? s.steps[card.i].target : card.t === "reorder" ? s.reorder : practice?.prompt?.target ?? "";
    if (!target) return;
    const first = !firstDone && !missed;
    const pd: Pending = { events: [], score: { ok: 0, total: 0 }, tally: {}, stats: [] };
    if (first && (card.t === "reorder" || card.t === "step")) pd.score = { ok: 0, total: 1 };
    if (credited(s.key) && mode === "learn") {
      const kind = card.t === "step" ? (s.steps[card.i].move === "linked" ? "linked" : "guided") : card.t === "reorder" ? "reorder" : pk === "pair" || pk === "transfer" ? pk : null;
      if (kind) {
        const e: BuildEvent = first
          ? { k: kind, ok: 0, first: true, spoken: false, sk: s.key, si }
          : { k: "copy", ok: 0, first: false, spoken: false, sk: s.key, si };
        if (kind === "linked" && first) {
          const prev = set.sentences[si - 1];
          if (prev) pd.events.push({ ...e, sk: prev.key, si: si - 1 });
        } else {
          pd.events.push(e);
        }
      }
    }
    pending.current = pd;
    const shown = pk ? target : vt(target);
    setAttempt({ verdict: "yanlis", revealed: true, feedback: "", expected: shown, spoken: false });
    setFirstDone(true);
    setMissed(true);
    speakAfter(shown, false);
  };

  /** Yanlışta aynı adım bir daha: önceki deneme yazılır, bundan sonrası kopya. */
  const retry = () => {
    flush();
    clearTimers();
    stopSpeaking();
    setAttempt(null);
    setAnswer("");
    setMissed(true);
  };

  /** "Ses tanıma yanlış duydu, sayma": denemenin kaydı iz bırakmadan silinir. */
  const voidAttempt = () => {
    clearTimers();
    stopSpeaking();
    const undo = pending.current?.undo;
    pending.current = null;
    setAttempt(null);
    setAnswer("");
    setVoidUsed(true);
    // Deneme hiç olmamış sayılır: kart denemeden önceki hâline döner. Kopya
    // silindiyse "yanlış" işareti yerinde kalır; ilk deneme silindiyse hak geri gelir.
    setFirstDone(undo?.firstDone ?? false);
    setMissed(undo?.missed ?? false);
    if (undo) {
      setOneshotOk(undo.oneshotOk);
      setChoices(undo.choices);
    }
  };

  const pickRetrieval = (i: 0 | 1) => {
    if (!set || !sentence || card?.t !== "retrieval" || picked !== null) return;
    setPicked(i);
    const ok = i === card.r.answer;
    if (credited(sentence.key) && mode === "learn") {
      // refKey tuzak ya da ders kimliğidir, taş anahtarı değil: taşa çevrilir.
      const e: BuildEvent = { k: "retrieval", ok: ok ? 1 : 0, first: true, spoken: false, sk: sentence.key, si, blockKeys: retrievalBlockKeys(sentence, card.r) };
      if (!ok && card.r.src === "trap" && card.r.refKey) e.trap = card.r.refKey;
      pending.current = {
        events: [e],
        score: { ok: 0, total: 0 },
        tally: {},
        stats: [],
      };
    }
    speakTargetWith(card.r.options[card.r.answer]);
  };

  const onSplit = (ok: boolean) => {
    setSplitDone(true);
    if (!set || !sentence || card?.t !== "connector") return;
    if (credited(sentence.key) && mode === "learn") {
      const key = sentence.blocks.find((b) => b.kind === "connector")?.key;
      const e: BuildEvent = { k: "retrieval", ok: ok ? 1 : 0, first: true, spoken: false, sk: sentence.key, si, blockKeys: key ? [key] : [] };
      if (!ok && card.card.trapId) e.trap = card.card.trapId;
      pending.current = { events: [e], score: { ok: 0, total: 0 }, tally: {}, stats: [] };
    }
  };

  // ------------------------------------------------------------------ pratik: başka örnek
  const moreExamples = (b: BuildBlock) => {
    if (!set || !practice) return;
    const take = (extra: { target: string; tr: string }[]) => {
      const [nx, ...rest] = extra;
      resetAttempt();
      setPractice({ kind: "transfer", blockKey: b.key, prompt: nx, extra: rest, loading: false });
    };
    if (practice.extra.length) {
      take(practice.extra);
      return;
    }
    Alert.alert("Başka örnek", "Bu taşla 3 yeni örnek cümle hazırlansın mı? Bu bir API isteği harcar.", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Evet",
        onPress: () => {
          setPractice((p) => (p ? { ...p, loading: true } : p));
          void generateMoreTransfer(profile, b, {
            lang,
            band: set.level,
            avoid: [b.transfer?.target ?? "", practice.prompt?.target ?? ""].filter(Boolean),
          })
            .then((xs) => alive.current && take(xs))
            .catch((e) => {
              if (!alive.current) return;
              setPractice((p) => (p ? { ...p, loading: false } : p));
              Alert.alert(isBudgetError(e) ? "Harcama tavanı doldu" : "Örnek gelmedi", errText(e));
            });
        },
      },
    ]);
  };

  // ------------------------------------------------------------------ günümü anlat
  function startRetell(indices: number[], title: string, resume: number | null) {
    resetAttempt();
    setRetell({ indices, at: -1, all: false, attempts: {}, title, resume });
    setPhase("retell");
  }

  const submitRetell = (given: string[], spoken: boolean) => {
    if (!set || !retell || retell.at < 0) return;
    const list = retell.all ? retell.indices : [retell.indices[retell.at]];
    if (list.some((i) => retell.attempts[i])) return;
    const parts = retell.all ? splitRetell(given[0] ?? "", list.map((i) => set.sentences[i].target), lang) : null;
    const got: Record<number, Attempt> = {};
    const evs: BuildEvent[] = [];
    let okCount = 0;
    list.forEach((i, k) => {
      const s = set.sentences[i];
      const g = parts ? parts[k] ?? "" : spoken ? given : given[0] ?? "";
      const r = checkAnswer(s.target, s.steps[s.steps.length - 1]?.alts ?? [], g, {
        lang,
        script: pack.script,
        spoken,
        swaps: s.swaps,
        tense: set.tense,
      });
      if (!r) return;
      got[i] = toAttempt(r, spoken);
      if (r.verdict !== "yanlis") okCount += 1;
      if (credited(s.key) && mode === "learn") evs.push({ k: "retell", ok: r.credit, first: true, spoken, sk: s.key, si: i });
    });
    if (!Object.keys(got).length) return;
    setRetell({ ...retell, attempts: { ...retell.attempts, ...got } });
    commitEvents(evs);
    if (okCount) setTally((t) => ({ ...t, retell: t.retell + okCount }));
    if (spoken) void recordStats(["spoken"]);
    if (!retell.all) speakTargetWith(got[list[0]]?.expected ?? "");
  };

  const retellNext = () => {
    if (!set || !retell) return;
    stopSpeaking();
    setAnswer("");
    const done = retell.all || retell.at + 1 >= retell.indices.length;
    if (!done) {
      setRetell({ ...retell, at: retell.at + 1 });
      return;
    }
    const resume = retell.resume;
    setRetell(null);
    // Set sonu anlatımı yapıldı ya da geçildi: 1, 4 ve 10 gün sonra "Tekrar zamanı"nda yeniden gelir.
    if (resume === null && mode === "learn") saveUi(scheduleRetell(stores.current.ui, set.id));
    // Yedek anlatım setin son cümlesinin yerine geçtiyse set biter; set sonu anlatımı yeniden açılmaz.
    if (resume !== null && set.sentences.slice(resume).some((x) => x.status !== "failed")) enterSentence(set, resume);
    else setPhase("done");
  };

  // ------------------------------------------------------------------ mikrofon
  const onHeard = (text: string, alts: string[]) => {
    setAnswer(text);
    const list = alts.length ? alts : [text];
    if (phase === "session") sessionHeard.current?.(list, true);
    else if (phase === "retell") submitRetell(list, true);
    else submit(list, true);
  };
  const onHeardRef = useRef(onHeard);
  onHeardRef.current = onHeard;
  // n-best: ses tanımanın öteki duyuşları, yutulan artikeli kurtarabilsin (tuzağı değil).
  const dictation = useDictation({ maxAlternatives: 3, onResult: (t, a) => onHeardRef.current(t, a) });

  const typed = () => {
    if (!answer.trim()) return;
    if (phase === "session") sessionHeard.current?.([answer], false);
    else if (phase === "retell") submitRetell([answer], false);
    else submit([answer], false);
  };

  // ------------------------------------------------------------------ deftere
  const saveBlocks = async (list: BuildBlock[]) => {
    const vocab = await loadVocab();
    const known = new Set(vocab.map((v) => normalizeTarget(v.arabic, pack.script)));
    let added = 0;
    for (const b of list) {
      const key = normalizeTarget(b.target, pack.script);
      if (!key || known.has(key)) continue;
      known.add(key);
      vocab.push(newCard(b.target, "", b.tr, "konusma", b.contrast || b.note, "orta"));
      added += 1;
    }
    await saveVocab(vocab);
    return added;
  };

  // ------------------------------------------------------------------ öğrendik çipleri
  const recallItems: RecallItem[] = useMemo(() => {
    if (!set || !sentence) return [];
    // Kaynağı bulunamayan anahtar çip olmaz: anahtar hedef dilde yazılıdır ve
    // yalnız Türkçe gösterilen çipte cevabı sızdırırdı.
    return sentence.recallKeys.flatMap((key): RecallItem[] => {
      for (let i = 0; i < si; i += 1) {
        const b = set.sentences[i]?.blocks.find((x) => x.key === key);
        if (b) return [{ key, tr: b.tr, target: b.target, from: i }];
      }
      const bp = blocks[key];
      return bp?.tr && bp.target ? [{ key, tr: bp.tr, target: bp.target, from: -1 }] : [];
    });
  }, [set, sentence, si, blocks]);

  // ------------------------------------------------------------------ geri
  const goHome = () => {
    flush();
    clearTimers();
    stopSpeaking();
    setIdRef.current = null;
    setSet(null);
    setRetell(null);
    setPhase("home");
  };

  // ------------------------------------------------------------------ görünüm
  // Hareke anahtarı notlara, karşıtlıklara ve derslere de insin (§7.5).
  const provide = (node: React.ReactElement) => <ShowTargetProvider value={view.show}>{node}</ShowTargetProvider>;

  const headerRight = (
    <>
      {rtl && phase !== "home" ? (
        <IconButton
          icon={harakat ? "eye" : "eyeOff"}
          label={harakat ? "Harekeleri gizle" : "Harekeleri göster"}
          variant="plain"
          onPress={() => saveUi({ ...stores.current.ui, showHarakat: !harakat })}
        />
      ) : null}
      {phase === "card" ? (
        <IconButton
          icon="zap"
          label="Hızlı akış"
          variant={ui.fastFlow ? "soft" : "plain"}
          onPress={() => saveUi({ ...stores.current.ui, fastFlow: !ui.fastFlow })}
        />
      ) : null}
    </>
  );

  const header = (subtitle: string) => (
    <Header title="Cümle Kurma" subtitle={subtitle} onBack={phase === "home" ? onBack : goHome} right={headerRight} />
  );

  const footerBase = {
    listening: dictation.listening,
    partial: dictation.partial,
    error: dictation.error,
    keyboard,
    answer,
    rtl,
    onToggleKeyboard: () => setKeyboard((k) => !k),
    onChange: setAnswer,
    onSubmit: typed,
    onMicIn: () => dictation.start(),
    onMicOut: () => dictation.stop(),
  };

  if (phase === "home") {
    const now = new Date();
    const ranked = rankThemes(focusMain);
    const summary = BANDS.map((b) => {
      const ps = PATTERN_LADDER.filter((p) => p.band === b);
      const done = ps.filter((p) => progress[p.id]?.status === "mastered" || progress[p.id]?.status === "verify").length;
      return { band: b, done, total: ps.length };
    });
    const fid = karmaId(focus.patterns);
    const fp = focus.kind === "karma" ? undefined : progress[focusMain.id];
    const due = reviewQueue(progress, memory, now, { ui, setIds: sets.map((x) => x.id), lastSetId: sets[0]?.id ?? null }).total;
    const pending = pendingNewPatterns(progress);
    // Ölçüt (b): kalıp tek temada kanıtlandıysa en uygun öteki tema tek dokunuşla.
    const other =
      fp && fp.proofKeys.length > 0 && fp.themes.length === 1 ? ranked.find((t) => !fp.themes.includes(t.id)) ?? null : null;
    return provide(
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        {header("Türkçeden parça parça, sesli")}
        <BuildHome
          focus={focus}
          progress={fp}
          checklist={focus.kind === "karma" ? [] : masteryChecklist(fp, now)}
          ladder={summary}
          themes={ranked.map((t) => ({
            theme: t,
            fit: themeFits(focusMain, t) >= 3,
            saved: sets.some((x) => x.patternId === fid && x.themeId === t.id),
          }))}
          sets={sets}
          nextEpisode={nextEpisode}
          fastFlow={ui.fastFlow}
          reviewDue={due}
          onReview={() => void startReview()}
          onToggleFast={() => saveUi({ ...stores.current.ui, fastFlow: !ui.fastFlow })}
          onTheme={openTheme}
          onSet={onSetAction}
          placement={
            shouldOfferPlacement(progress, ui, band)
              ? { band, onStart: startPlacement, onSkip: () => saveUi({ ...stores.current.ui, placementDone: true }) }
              : null
          }
          newSteps={pending.length ? { count: pending.length, onStart: () => void startProbe("newsteps", pending.slice(0, 8), 2) } : null}
          otherTheme={other ? { title: other.title, onPress: () => openTheme(other) } : null}
          onLadder={() => setPhase("ladder")}
          onClearOverride={focus.kind === "override" ? () => saveUi({ ...stores.current.ui, focusOverride: undefined }) : undefined}
          onVerify={focus.kind === "verify" ? () => void startReview(focusMain.id) : undefined}
        />
      </View>
    );
  }

  if (phase === "ladder") {
    return provide(
      <Screen header={<Header title="Kalıp merdiveni" subtitle="A1 → C2" onBack={() => setPhase("home")} />}>
        <LadderPicker
          progress={progress}
          focusId={focus.kind === "karma" ? undefined : focusMain.id}
          initialBand={focus.kind === "karma" ? band : focusMain.band}
          onStudy={(p) => {
            saveUi({ ...stores.current.ui, focusOverride: p.id });
            setPhase("home");
          }}
          onTestOut={(p) => void startProbe("testout", [p], 4)}
          onReview={(p) => void startReview(p.id)}
        />
      </Screen>
    );
  }

  if (phase === "session" && session) {
    return provide(
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ReviewSession
          key={session.run}
          items={session.items}
          header={<Header title={session.title} subtitle="tek seferde" onBack={exitSession} right={headerRight} />}
          lang={lang}
          script={pack.script}
          view={view}
          footerBase={footerBase}
          heardRef={sessionHeard}
          onClearAnswer={() => setAnswer("")}
          onAnswer={onSessionAnswer}
          onDone={onSessionDone}
          intro={session.intro}
        />
      </KeyboardAvoidingView>
    );
  }

  if (phase === "loading") {
    return provide(
      <Screen header={header("set hazırlanıyor…")}>
        <PreparingCard
          view={view}
          title={loadingText ?? `${pack.teacherName} hikâyeyi planlıyor…`}
          note={
            loadingText
              ? "Her kalıptan kısa cümleler geliyor; hepsini tek seferde söyleyeceksin."
              : "Önce hikâyenin planı, sonra ilk cümle hazırlanır; ilk cümle gelince başlarsın, gerisi sen çalışırken hazırlanır."
          }
        />
      </Screen>
    );
  }

  if (!set) return null;
  const n = set.sentences.length;
  const patternTitle = focusOf(set).map((p) => p.title).join(" + ") || set.patternId;

  if (phase === "intro") {
    return provide(
      <Screen
        header={header(`${n} cümlelik hikâye`)}
        footer={<Button icon="arrowRight" label="Başlayalım" onPress={() => enterSentence(set, 0)} />}
      >
        <SetIntro set={set} theme={themeById(set.themeId)} patternTitle={patternTitle} mode={mode} />
      </Screen>
    );
  }

  if (phase === "done") {
    const allBlocks = set.sentences.flatMap((x) => x.blocks.filter((b) => !b.recycled));
    const ready = set.sentences.map((x, i) => (x.status === "ready" ? i : -1)).filter((i) => i >= 0);
    return provide(
      <Screen header={header("set bitti")}>
        <DoneView
          sentences={ready.length}
          tally={{ ...tally, ok: score.ok, total: score.total }}
          mode={mode}
          checklist={focusOf(set).length === 1 ? masteryChecklist(progress[focusOf(set)[0].id]) : []}
          patternTitle={patternTitle}
          savedBlocks={savedAll}
          nextEpisode={nextEpisode(set)}
          onNext={() => onSetAction(set, "next")}
          onRetell={() => startRetell(ready, "Günümü anlat", null)}
          onOneShot={() => begin(set, "review")}
          onPractice={() => begin(set, "practice")}
          onSaveBlocks={() =>
            void saveBlocks(allBlocks).then((added) => {
              setSavedAll(true);
              Alert.alert("Deftere eklendi", added > 0 ? `${added} yapı taşı kelime defterine yazıldı.` : "Hepsi zaten defterdeydi.");
            })
          }
          onHome={goHome}
        />
      </Screen>
    );
  }

  if (phase === "retell" && retell) {
    const cur = retell.at >= 0 ? (retell.all ? retell.indices : [retell.indices[retell.at]]) : [];
    const answered = cur.length > 0 && cur.every((i) => retell.attempts[i]);
    const theme = themeById(set.themeId);
    const stageOf = (i: number) => {
      const st = theme?.stages ?? [];
      if (!st.length) return `${i + 1}. sahne`;
      return st[stageIndex(i, n, st.length)];
    };
    const footer =
      retell.at < 0 ? (
        <View style={{ gap: 10 }}>
          <Button icon="mic" label="Tek tek anlat" onPress={() => setRetell({ ...retell, at: 0 })} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button variant="secondary" size="md" label="Hepsini bir kerede" onPress={() => setRetell({ ...retell, at: 0, all: true })} style={{ flex: 1 }} />
            <Button variant="ghost" size="md" label="Atla" onPress={retellNext} />
          </View>
        </View>
      ) : (
        <VoiceFooter
          {...footerBase}
          onSubmit={typed}
          listen={!answered}
          dontKnow={{ label: "Geç", onPress: retellNext }}
          primary={{ label: retell.all || retell.at + 1 >= retell.indices.length ? "Bitir" : "Sıradaki", icon: "arrowRight", onPress: retellNext }}
        />
      );
    return provide(
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <Screen header={header(retell.title)} footer={footer}>
          <RetellView
            set={set}
            indices={retell.indices}
            at={retell.at}
            all={retell.all}
            showTr={BANDS.indexOf(set.level) < BANDS.indexOf("B2")}
            stageOf={stageOf}
            attempts={retell.attempts}
            view={view}
            title={retell.title}
          />
        </Screen>
      </KeyboardAvoidingView>
    );
  }

  if (phase === "preparing" || !sentence || !card) {
    const prev = set.sentences.slice(0, si).reverse().find((x) => x.status === "ready");
    // Beklerken vadesi gelmiş bir cümle (önce başka setlerden): bekleme de konuşma olsun.
    const due = memory.filter((m) => Date.parse(m.dueAt) <= Date.now());
    const peek = due.find((m) => m.setId !== set.id) ?? due[0] ?? null;
    return provide(
      <Screen
        header={header(`cümle ${si + 1} / ${n}`)}
        footer={<Button variant="secondary" label="Ana sayfa" onPress={goHome} />}
      >
        <SentenceBar total={n} current={si} />
        <PreparingCard
          view={view}
          prevTarget={prev?.target}
          error={genError}
          onReplay={prev ? () => speakTargetWith(prev.target) : undefined}
          onRetry={() => setGenError(null)}
          review={peek}
          onReviewListen={peek ? () => speakTargetWith(peek.target) : undefined}
        />
      </Screen>
    );
  }

  // ------------------------------------------------------------------ kartlar
  const s = sentence;
  const stepCards = cards.filter((x) => x.t === "step");
  const cardName = (() => {
    switch (card.t) {
      case "read":
        return "oku";
      case "recall":
        return "öğrendiklerimiz";
      case "connector":
        return "bağlaç";
      case "oneshot":
        return "tek seferde";
      case "kurus":
        return "hocanın kuruşu";
      case "system":
        return "sistem";
      case "retrieval":
        return "hatırlayalım";
      case "step":
        return `adım ${stepCards.findIndex((x) => x.t === "step" && x.i === card.i) + 1} / ${stepCards.length}`;
      case "reorder":
        return "bağlacın yeri";
      case "recap":
        return "özet";
      default:
        return "pratik";
    }
  })();

  const listen = () => speakTargetWith(attempt?.expected ?? "");
  const onVoid = attempt && attempt.spoken && !attempt.revealed && !voidUsed ? voidAttempt : undefined;
  const genderRow =
    methodFor(lang).gender &&
    s.swaps.some((x) => x.label === "dişil") &&
    /(^|[\s,])(sen|o|seni|onu|sana|ona|senin|onun)([\s,.!?]|$)/i.test(s.tr) ? (
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Chip label="Erkek" selected={!fem} onPress={() => setGenderChoice(false)} />
        <Chip label="Kadın" selected={fem} onPress={() => setGenderChoice(true)} />
      </View>
    ) : null;
  function setGenderChoice(f: boolean) {
    setFem(f);
    const fems = s.swaps.filter((x) => x.label === "dişil");
    setChoices((cs) => [...cs.filter((x) => x.label !== "dişil"), ...(f ? fems : [])]);
  }

  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;
  const cont = (label = "Devam", disabled = false): FooterAction => ({ label, icon: "arrowRight", onPress: advance, disabled });
  const verdictFooter = (a: Attempt, skip?: FooterAction) =>
    a.verdict === "yanlis" || a.revealed ? (
      <VoiceFooter {...footerBase} listen={false} primary={{ label: "Bir daha söyle", icon: "replay", onPress: retry }} secondary={skip} />
    ) : (
      <VoiceFooter {...footerBase} listen={false} primary={cont()} />
    );

  switch (card.t) {
    case "read":
      body = <ReadCard sentence={s} index={si} />;
      footer = <VoiceFooter {...footerBase} listen={false} primary={cont("Kurmaya başla")} />;
      break;
    case "recall": {
      body = (
        <RecallChips
          items={recallItems}
          synthesis={s.role === "synthesis"}
          active={recallActive}
          results={recallResults}
          onPick={(k) => setRecallActive(k)}
          view={view}
        />
      );
      const asking = !!recallActive && !recallResults[recallActive];
      footer = <VoiceFooter {...footerBase} listen={asking} dontKnow={{ label: "Vazgeç", onPress: () => setRecallActive(null) }} primary={cont()} />;
      break;
    }
    case "connector":
      body = <ConnectorCard key={`${set.id}-${si}`} card={card.card} tr={s.tr} lang={lang} view={view} onSplit={onSplit} />;
      // Kilit kartla aynı karardan: bağlaç cümlede bulunamazsa bölme yok, kilit de yok.
      footer = <VoiceFooter {...footerBase} listen={false} primary={cont("Devam", canSplit(s.tr, card.card) && !splitDone)} />;
      break;
    case "oneshot":
      body = (
        <OneShotCard
          sentence={s}
          lang={lang}
          view={view}
          attempt={attempt}
          expectedShown={attempt?.expected ?? vt(s.target)}
          translit={s.steps[s.steps.length - 1]?.translit}
          review={mode === "review"}
          onListen={listen}
          onVoid={onVoid}
          extra={genderRow}
        />
      );
      footer = !attempt ? (
        <VoiceFooter {...footerBase} listen dontKnow={{ label: "Adım adım kur", onPress: toSteps }} />
      ) : attempt.verdict === "yanlis" ? (
        <VoiceFooter {...footerBase} listen={false} primary={{ label: "Adım adım kur", icon: "layers", onPress: toSteps }} />
      ) : (
        <VoiceFooter {...footerBase} listen={false} primary={cont()} />
      );
      break;
    case "kurus":
      body = <KurusReplay key={`${set.id}-${si}`} sentence={s} view={view} targets={s.steps.map((x) => vt(x.target))} />;
      footer = <VoiceFooter {...footerBase} listen={false} primary={cont()} />;
      break;
    case "system": {
      const lesson = systemById(lang, card.id);
      body = lesson ? <SystemLessonCard lesson={lesson} part={card.part} finalTarget={s.target} /> : null;
      footer = <VoiceFooter {...footerBase} listen={false} primary={cont()} />;
      break;
    }
    case "retrieval":
      body = <RetrievalCard r={card.r} picked={picked} onPick={pickRetrieval} view={view} unheard={unheard} />;
      footer = picked === null ? <VoiceFooter {...footerBase} listen /> : <VoiceFooter {...footerBase} listen={false} primary={cont()} />;
      break;
    case "step": {
      const i = card.i;
      const st = s.steps[i];
      const faded = i > 0 && !cards.some((x) => x.t === "step" && x.i === i - 1);
      const showSoFar =
        BANDS.indexOf(set.level) <= BANDS.indexOf("B1") && !faded && !(s.role === "synthesis" && oneshotOk === false) && st.move !== "linked";
      body = (
        <StepCard
          sentence={s}
          i={i}
          lang={lang}
          view={view}
          showSoFar={showSoFar}
          prevShown={i > 0 ? vt(s.steps[i - 1].target) : undefined}
          expectedShown={attempt?.expected ?? vt(st.target)}
          finalShown={vt(s.target)}
          attempt={attempt}
          translit={st.translit || undefined}
          onListen={listen}
          onVoid={onVoid}
          extra={i === 0 ? genderRow : null}
        />
      );
      footer = attempt ? verdictFooter(attempt) : <VoiceFooter {...footerBase} listen dontKnow={{ label: "Bilmiyorum", onPress: reveal }} />;
      break;
    }
    case "reorder":
      body = (
        <ReorderCard
          sentence={s}
          first={card.first}
          lang={lang}
          view={view}
          attempt={attempt}
          expectedShown={attempt?.expected ?? vt(s.reorder)}
          onListen={listen}
          onVoid={onVoid}
        />
      );
      footer = attempt ? verdictFooter(attempt) : <VoiceFooter {...footerBase} listen dontKnow={{ label: "Bilmiyorum", onPress: reveal }} />;
      break;
    case "pair":
    case "transfer":
    case "open": {
      const b = s.blocks.find((x) => x.key === practice?.blockKey);
      if (!b || !practice) {
        body = null;
        footer = <VoiceFooter {...footerBase} listen={false} primary={cont()} />;
        break;
      }
      body = (
        <PracticeCard
          kind={practice.kind}
          block={b}
          prompt={practice.prompt}
          lang={lang}
          view={view}
          attempt={attempt}
          onListen={listen}
          onVoid={practice.kind === "open" ? undefined : onVoid}
          onMore={() => moreExamples(b)}
          moreLoading={practice.loading}
          onOpen={() => {
            resetAttempt();
            setPractice({ ...practice, kind: "open" });
          }}
        />
      );
      const skip: FooterAction = { label: "Geç", onPress: advance };
      footer = !attempt ? (
        // Pratik isteğe bağlı: denemeden önce de geçilebilir.
        <VoiceFooter {...footerBase} listen dontKnow={skip} />
      ) : practice.kind === "open" ? (
        <VoiceFooter {...footerBase} listen={false} primary={cont()} />
      ) : (
        verdictFooter(attempt, skip)
      );
      break;
    }
    case "recap":
      body = (
        <RecapCard
          sentence={s}
          finalShown={vt(s.target)}
          reorderShown={s.reorder ? vt(s.reorder) : ""}
          recall={recallItems}
          view={view}
          saved={savedSentences.includes(si)}
          onListen={() => speakTargetWith(vt(s.target))}
          onSave={() =>
            void saveBlocks(s.blocks.filter((b) => !b.recycled)).then(() => setSavedSentences((xs) => [...xs, si]))
          }
        />
      );
      footer = (
        <VoiceFooter
          {...footerBase}
          listen={false}
          primary={{ label: si + 1 < n ? "Sıradaki cümle" : "Seti bitir", icon: "arrowRight", onPress: advance }}
        />
      );
      break;
  }

  const span = card.t === "step" ? s.steps[card.i]?.trSpan ?? null : null;
  return provide(
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <Screen header={header(`cümle ${si + 1} / ${n} · ${cardName}`)} footer={footer}>
        <SentenceBar total={n} current={si} />
        {card.t !== "read" && card.t !== "oneshot" && card.t !== "recap" ? <TrHeader tr={s.tr} span={span} /> : null}
        {body}
      </Screen>
    </KeyboardAvoidingView>
  );
}
