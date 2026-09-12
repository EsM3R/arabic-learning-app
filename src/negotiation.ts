/**
 * Etkileşimsel yeterlilik (anlam müzakeresi) — SAF mantık (React/RN importu
 * YOK; tests/negotiation.test.ts).
 *
 * NEDEN VAR — denetimde çıkan son büyük eksik buydu:
 * Uygulamadaki hoca HER ZAMAN anlıyordu. Hiç yanlış duymuyor, hiç "pardon?"
 * demiyor, öğrenci takıldığında kelimeyi hemen veriyordu. Oysa gerçek
 * konuşmanın büyük kısmı ANLAM MÜZAKERESİDİR: anlamadığını söylemek, tekrar
 * istemek, "yani şöyle mi?" diye teyit etmek, bilmediğin kelimeyi tarif
 * etmek. Bunları hiç yapmamış biri, ilk gerçek konuşmada dili bildiği hâlde
 * kilitlenir — çünkü eksik olan dil değil, ONARIM refleksidir.
 *
 * Long'un etkileşim hipotezi: girdiyi anlaşılır kılan şey müzakerenin
 * kendisidir. Canale & Swain'in stratejik yeterliliği: iletişim koptuğunda
 * onarma becerisi, dilbilgisinden bağımsız ve ayrıca öğretilmesi gereken bir
 * yeterliliktir.
 *
 * Bu modül üç şey yapar: araç çantasını tarif eder, öğrencinin mesajında
 * onarım hamlesi olup olmadığını TESPİT eder (ölçüm), ve hocanın ne sıklıkta
 * kasıtlı olarak anlamaması gerektiğini söyler.
 */
import { normalizeTarget } from "./textnorm.ts";
import type { ScriptId } from "./scripts.ts";

/**
 * Onarım hamlesi türleri. Sıralama öğretim sırasıdır: en üsttekiler olmadan
 * konuşma hiç kurtarılamaz, alttakiler incelik.
 */
export const REPAIR_CATEGORIES = [
  "anlamadim", // "anlamadım"
  "tekrar", // "tekrar eder misin?"
  "yavas", // "daha yavaş"
  "teyit", // "yani ... mi demek istiyorsun?"
  "kelime_sor", // "... nasıl denir?"
  "yazilis_sor", // "nasıl yazılıyor?"
  "soz_al", // "pardon, bir şey sorabilir miyim?"
  "onay_iste", // "doğru mu söyledim?"
] as const;

export type RepairCategory = (typeof REPAIR_CATEGORIES)[number];

/** Kategorinin Türkçe adı — ekranda ve hoca raporunda görünür. */
export const CATEGORY_LABEL: Record<RepairCategory, string> = {
  anlamadim: "anlamadığını söyleme",
  tekrar: "tekrar isteme",
  yavas: "yavaşlatma",
  teyit: "teyit etme",
  kelime_sor: "kelime sorma",
  yazilis_sor: "yazılış sorma",
  soz_al: "söz alma",
  onay_iste: "onay isteme",
};

export type Register = "samimi" | "notr" | "resmi";

export interface RepairPhrase {
  category: RepairCategory;
  /** Hedef dilde, kendi yazımıyla. */
  target: string;
  /** Türkçe okunuşa yakın Latin transkripsiyon; Latin alfabeli dilde "". */
  translit: string;
  tr: string;
  register: Register;
  /** Türk öğrenciye özel kısa uyarı (yoksa ""). */
  note?: string;
}

export interface SimplePhrase {
  target: string;
  translit: string;
  tr: string;
}

export interface NegotiationKit {
  phrases: RepairPhrase[];
  /** Zaman kazandıran doldurucular — akıcılığın görünmez motoru. */
  fillers: SimplePhrase[];
  /** Kelimeyi bilmeyince tarif etmeye başlama kalıpları. */
  circumlocution: SimplePhrase[];
  /** Hoca kasıtlı anlamamış gibi yaparken bu dilde nasıl söyler. */
  teacherCue: string;
  /** Türk öğrencinin bu dilde onarım yaparken düştüğü tipik tuzak. */
  turkishTrap: string;
}

// ---------------------------------------------------------------------------
// Tespit — öğrencinin mesajında onarım hamlesi var mı
// ---------------------------------------------------------------------------

/** Normalize edilmiş metni boşlukla sözcüklere böler. */
function tokens(s: string): string[] {
  return s.split(" ").filter((t) => t.length > 0);
}

/**
 * `needle` sözcük dizisi `hay` içinde BİTİŞİK olarak geçiyor mu.
 *
 * Düz `includes` kullanılmıyor: tek heceli bir onarım sözcüğü ("quoi") başka
 * bir kelimenin içinde geçip yanlış pozitif üretirdi ve ölçüm şişerdi —
 * öğrenci hiç onarım yapmadığı hâlde "yapıyor" görünürdü.
 */
function containsRun(hay: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * Öğrencinin mesajında hangi onarım hamleleri var.
 *
 * Hem hedef yazımla hem okunuşla eşleşir: Arap/Kiril klavyesi olmayan öğrenci
 * "tekrar eder misin"i okunuşuyla yazabilir ve bu da gerçek bir onarım
 * hamlesidir — ölçüm klavyeye göre ayrım yapmamalı.
 */
export function detectRepair(
  message: string,
  kit: NegotiationKit,
  script: ScriptId
): RepairCategory[] {
  const said = tokens(normalizeTarget(message ?? "", script));
  const saidLatin = tokens(normalizeTarget(message ?? "", "latin"));
  if (said.length === 0 && saidLatin.length === 0) return [];

  const found = new Set<RepairCategory>();
  for (const p of kit.phrases) {
    const target = tokens(normalizeTarget(p.target, script));
    if (target.length > 0 && containsRun(said, target)) {
      found.add(p.category);
      continue;
    }
    if (p.translit) {
      const tr = tokens(normalizeTarget(p.translit, "latin"));
      if (tr.length > 0 && containsRun(saidLatin, tr)) found.add(p.category);
    }
  }
  // Öğretim sırası korunur; Set'in ekleme sırası değil.
  return REPAIR_CATEGORIES.filter((c) => found.has(c));
}

// ---------------------------------------------------------------------------
// Kapsam — hangi hamleleri hiç kullanmadı
// ---------------------------------------------------------------------------

/** Bu kadar kategoriyi kullanan öğrenci "onarım refleksi var" sayılır. */
export const REPAIR_GOAL = 4;

export interface RepairCoverage {
  used: RepairCategory[];
  missing: RepairCategory[];
  /** Hedefe ulaşıldı mı. */
  fluentEnough: boolean;
  /** Hocaya verilecek tek cümlelik Türkçe özet. */
  summary: string;
}

export function repairCoverage(used: string[]): RepairCoverage {
  const seen = new Set(used);
  const have = REPAIR_CATEGORIES.filter((c) => seen.has(c));
  const missing = REPAIR_CATEGORIES.filter((c) => !seen.has(c));
  if (have.length === 0) {
    return {
      used: [],
      missing,
      fluentEnough: false,
      summary:
        "Öğrenci şimdiye kadar HİÇ onarım hamlesi yapmadı: bir kez bile 'anlamadım', 'tekrar eder misin' dememiş. Gerçek konuşmada kilitlenmesinin en olası sebebi budur — bu derste ona en az bir onarım kalıbı kullandır.",
    };
  }
  const label = (c: RepairCategory) => CATEGORY_LABEL[c];
  if (have.length >= REPAIR_GOAL) {
    return {
      used: have,
      missing,
      fluentEnough: true,
      summary: `Onarım refleksi oturmuş (${have.map(label).join(", ")}).${
        missing.length > 0 ? ` Henüz denemedikleri: ${missing.map(label).join(", ")}.` : ""
      }`,
    };
  }
  return {
    used: have,
    missing,
    fluentEnough: false,
    summary: `Onarım hamlelerinden yalnız ${have.length} tanesini kullanmış (${have
      .map(label)
      .join(", ")}). Bu derste şunlardan birini kullanmaya ZORLA: ${missing
      .slice(0, 3)
      .map(label)
      .join(", ")}.`,
  };
}

// ---------------------------------------------------------------------------
// Hocanın kasıtlı anlamama politikası
// ---------------------------------------------------------------------------

export interface FeignPolicy {
  /** Kaç turda bir kasıtlı anlamama yapılmalı. */
  everyNTurns: number;
  /** Prompt'a giren Türkçe talimat. */
  instruction: string;
}

/**
 * Hoca ne sıklıkta "anlamamış" gibi yapmalı.
 *
 * Sıklık seviyeyle ARTAR ve bu bilinçli: A1'de öğrenci zaten her cümlede
 * zorlanıyor, üstüne hocanın anlamaması cesaret kırar ve öğrenci konuşmayı
 * tamamen bırakır. B1'den sonra ise tam tersi — her şeyi anlayan hoca sahte
 * bir güven üretir, öğrenci kendini hazır sanıp gerçek konuşmada çöker.
 */
export function feignPolicy(level: string): FeignPolicy {
  if (level === "A0" || level === "A1") {
    return {
      everyNTurns: 8,
      instruction:
        "ÇOK SEYREK (8-10 turda bir) ve yalnız öğrenci rahatken kasıtlı anlamama yap. Bu seviyede öğrencinin cesareti dilinden kıymetli; onarım kalıbını daha çok ÖĞRET, az sına.",
    };
  }
  if (level === "A2") {
    return {
      everyNTurns: 6,
      instruction:
        "6 turda bir kasıtlı anlamama yap. Anlamadığını söylerken kısa ve sıcak ol; öğrenci onarım kalıbını kullanınca bunu açıkça övüp devam et.",
    };
  }
  if (level === "B1") {
    return {
      everyNTurns: 4,
      instruction:
        "4 turda bir kasıtlı anlamama yap. Bu seviyede öğrenci artık onarımı kendi başına yapabilmeli; kalıbı sen hatırlatma, bekle.",
    };
  }
  return {
    everyNTurns: 3,
    instruction:
      "3 turda bir kasıtlı anlamama yap ve bazen hızlı konuş, bazen sözünü nazikçe kes. Bu seviyede öğrenciyi zorlamamak ona kötülüktür: her şeyi anlayan hoca sahte güven üretir.",
  };
}

/**
 * Öğrenciye verilecek araç çantası metni (prompt'a girer).
 * Kategori başına en fazla iki kalıp — panikteyken uzun liste hatırlanmaz.
 */
export function kitBrief(kit: NegotiationKit, script: ScriptId): string {
  const byCat = new Map<RepairCategory, RepairPhrase[]>();
  for (const p of kit.phrases) {
    const list = byCat.get(p.category) ?? [];
    if (list.length < 2) list.push(p);
    byCat.set(p.category, list);
  }
  const lines: string[] = [];
  for (const c of REPAIR_CATEGORIES) {
    const list = byCat.get(c);
    if (!list || list.length === 0) continue;
    const shown = list
      .map((p) => `${p.target}${p.translit ? ` (${p.translit})` : ""}`)
      .join(" / ");
    lines.push(`- ${CATEGORY_LABEL[c]}: ${shown}`);
  }
  const fillers = kit.fillers
    .map((f) => `${f.target}${f.translit ? ` (${f.translit})` : ""}`)
    .join(", ");
  const circ = kit.circumlocution
    .map((f) => `${f.target}${f.translit ? ` (${f.translit})` : ""}`)
    .join(", ");
  void script; // yazı sistemi şimdilik gösterimi değiştirmiyor
  return [
    lines.join("\n"),
    fillers ? `- zaman kazanma: ${fillers}` : "",
    circ ? `- tarif etmeye başlama: ${circ}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
