/**
 * İlerleme özeti — hocanın CİHAZDA ÖLÇÜLEN yeterlilik verisini görmesi için.
 * SAF modül (React/RN importu YOK; tests/progress.test.ts).
 *
 * Denetimde çıkan asıl kusur şuydu: uygulama iki gerçek yeterlilik ölçümü
 * yapıyor — okuduğunu anlama skoru ve sesbirim ayırt etme doğruluğu — ama
 * ikisi de çıkmaz sokaktı; ne hocaya ne seviye kararına ulaşıyordu. Seviye
 * yalnız kelime tekrarına ve hata defterine bakılarak veriliyordu.
 * Bu modül o veriyi hocanın okuyabileceği tek bir Türkçe özete çevirir.
 */
import type { FluencyTrend } from "./fluency.ts";
import type { StatsSummary } from "./stats.ts";
import type { ReadingText } from "./types";

export interface ReadingPerformance {
  finished: number;
  /** Soruların doğru cevaplanma oranı (0-1); hiç bitmiş metin yoksa null. */
  accuracy: number | null;
  /** Bitmiş metinlerin seviyeleri, yeniden eskiye (en fazla 5). */
  recentLevels: string[];
  /** Kural uyumu düşük (model defterin dışına taşmış) metin sayısı. */
  lowCompliance: number;
}

export function readingPerformance(
  readings: ReadingText[],
  complianceWarn: number
): ReadingPerformance {
  const finished = readings.filter((r) => r.finishedAt);
  let correct = 0;
  let total = 0;
  for (const r of finished) {
    correct += r.quizCorrect ?? 0;
    total += r.quizTotal ?? 0;
  }
  const byNewest = [...finished].sort(
    (a, b) => Date.parse(b.finishedAt ?? "") - Date.parse(a.finishedAt ?? "")
  );
  return {
    finished: finished.length,
    accuracy: total > 0 ? correct / total : null,
    recentLevels: byNewest.slice(0, 5).map((r) => r.level),
    lowCompliance: readings.filter((r) => !r.coldStart && r.complianceRatio < complianceWarn)
      .length,
  };
}

function pct(x: number): string {
  return `%${Math.round(x * 100)}`;
}

// ---------------------------------------------------------------------------
// Konuşma dengesi — uygulamanın NİHAİ HEDEFİ konuşmak, ama en az direnç
// gösteren yol yazmak. Bu ölçüm o kaymayı görünür kılar.
// ---------------------------------------------------------------------------

/** Haftalık sessiz çalışma bu hacmi aşınca denge ölçümü anlamlı olur. */
export const SILENT_WORK_FLOOR = 20;
/** Sesli çalışmanın toplam çalışmaya oranı bunun altındaysa denge bozuk. */
export const VOICE_RATIO_MIN = 0.2;

export interface SpeakingBalance {
  /** Bu hafta ağzını açtığı iş: mikrofon denemesi + gölgeleme. */
  voiceWork: number;
  /** Bu hafta sessiz iş: kelime tekrarı + okunan cümle. */
  silentWork: number;
  /** voiceWork / (voiceWork + silentWork); hiç iş yoksa null. */
  ratio: number | null;
  /** Hayatı boyunca mikrofona hiç basmadı mı. */
  neverSpoken: boolean;
  /** Hayatı boyunca hiç gölgeleme yapmadı mı. */
  neverShadowed: boolean;
  /** Ölçüm anlamlı ve oran düşük mü — "hep yazıyor" hâli. */
  imbalanced: boolean;
}

/**
 * Sessiz/sesli çalışma dengesi. "produced" sayacı KULLANILMAZ: o hem yazılı
 * hem sözlü doğru üretimde artıyor, yani iki tarafa birden yazılırdı ve
 * dengeyi ölçemezdi. Burada yalnız KESİN sınıflandırılabilen sayaçlar var.
 */
export function speakingBalance(stats: StatsSummary): SpeakingBalance {
  const w = stats.week;
  const voiceWork = (w.spoken ?? 0) + (w.shadowed ?? 0);
  const silentWork = (w.reviewed ?? 0) + (w.readSentence ?? 0);
  const totalWork = voiceWork + silentWork;
  return {
    voiceWork,
    silentWork,
    ratio: totalWork > 0 ? voiceWork / totalWork : null,
    neverSpoken: (stats.total.spoken ?? 0) === 0,
    neverShadowed: (stats.total.shadowed ?? 0) === 0,
    imbalanced:
      silentWork >= SILENT_WORK_FLOOR && totalWork > 0 && voiceWork / totalWork < VOICE_RATIO_MIN,
  };
}

/**
 * Hocaya sunulan ilerleme raporu. Veri yoksa o satır hiç yazılmaz — modele
 * "0 metin okudu" demek yerine susmak daha dürüst: henüz ölçüm yok demektir.
 */
export function progressDigest(
  stats: StatsSummary,
  reading: ReadingPerformance,
  fluency?: FluencyTrend | null
): string {
  const lines: string[] = [];

  if (reading.finished > 0) {
    const acc =
      reading.accuracy === null
        ? "soru çözülmemiş"
        : `anlama soruları ${pct(reading.accuracy)} doğru`;
    const levels = reading.recentLevels.length
      ? ` (son metinler: ${reading.recentLevels.join(", ")})`
      : "";
    lines.push(`Okuma: ${reading.finished} metin bitirildi, ${acc}${levels}.`);
    if (reading.accuracy !== null && reading.accuracy >= 0.85) {
      lines.push(
        "  → Okuduğunu anlama bu seviyede sağlam; bir üst seviyeye geçmeyi düşünebilirsin."
      );
    } else if (reading.accuracy !== null && reading.accuracy < 0.6) {
      lines.push(
        "  → Anlama zayıf: metinler öğrenciye ağır geliyor, seviyeyi YÜKSELTME; kapsamı düşür."
      );
    }
  }
  if (reading.lowCompliance > 0) {
    lines.push(
      `Uyarı: ${reading.lowCompliance} metin kelime defterinin dışına taşmış (öğrenci plansız yeni kelimeyle karşılaşmış).`
    );
  }

  const w = stats.week;
  const disc = w.discrimination ?? 0;
  if (disc > 0) {
    const ok = w.discriminationCorrect ?? 0;
    lines.push(
      `Kulak (ses ayırt etme): bu hafta ${disc} denemede ${pct(ok / disc)} doğru.`
    );
    if (ok / disc < 0.7) {
      lines.push(
        "  → Sesleri ayırt etmekte zorlanıyor: telaffuz çalışması olmadan konuşma seviyesini yükseltme."
      );
    }
  }

  // Konuşma: uygulamanın öğrenciyi GERÇEKTEN duyduğu tek yer.
  const spoken = w.spoken ?? 0;
  if (spoken > 0) {
    const ok = w.spokenCorrect ?? 0;
    lines.push(
      `Konuşma (mikrofonla): bu hafta ${spoken} deneme, ${pct(ok / spoken)}'i doğru duyuldu.`
    );
    if (ok / spoken < 0.5) {
      lines.push(
        "  → Söyledikleri çoğunlukla tanınmıyor: telaffuz üzerinde çalış, konuşma seviyesini yükseltme."
      );
    } else if (ok / spoken >= 0.8) {
      lines.push("  → Telaffuzu anlaşılır; konuşma seviyesinde ilerleme var.");
    }
  }

  const produced = w.produced ?? 0;
  const shadowed = w.shadowed ?? 0;
  const readSentence = w.readSentence ?? 0;
  const reviewed = w.reviewed ?? 0;
  if (produced + shadowed + readSentence + reviewed > 0) {
    const parts: string[] = [];
    if (produced > 0) parts.push(`${produced} cümle üretti`);
    if (reviewed > 0) parts.push(`${reviewed} kelime tekrar etti`);
    if (readSentence > 0) parts.push(`${readSentence} cümle okudu`);
    if (shadowed > 0) parts.push(`${shadowed} cümle gölgeledi`);
    lines.push(
      `Bu hafta üretim: ${parts.join(", ")} — ${stats.activeDays7} gün aktif (son 30 günde ${stats.activeDays30} gün).`
    );
  }
  // Akıcılık: 4/3/2 alıştırmasının ölçtüğü konuşma HIZI. Uygulamanın
  // öğrencinin akıcılığı hakkında sahip olduğu tek sayısal kanıt budur.
  if (fluency) {
    const trendNote =
      fluency.previousAvgWpm === null
        ? "ilk oturum, kıyas yok"
        : fluency.latestWpm > fluency.previousAvgWpm
          ? `önceki oturumların ortalaması ${fluency.previousAvgWpm} idi — hızlanıyor`
          : fluency.latestWpm < fluency.previousAvgWpm
            ? `önceki oturumların ortalaması ${fluency.previousAvgWpm} idi — yavaşlamış`
            : "önceki oturumlarla aynı";
    lines.push(
      `Akıcılık (4/3/2): ${fluency.sessions} oturum; son bitiş hızı ${fluency.latestWpm} kelime/dk (${trendNote}).`
    );
  }

  // KONUŞMA DENGESİ — bu bölüm hocanın en sık kör kaldığı yer.
  // Eksik dürtmeleri yalnız ÇALIŞAN öğrenciye anlamlı: hiç verisi olmayana
  // "şunu yapmamışsın" demek, henüz hiçbir şey yapmamış birine tek eksiğini
  // söylemek olurdu.
  const bal = speakingBalance(stats);
  if (lines.length > 0) {
    if (bal.neverSpoken) {
      lines.push(
        "⚠️ KONUŞMA: Mikrofonla HİÇ konuşma denemesi yok — öğrenci baştan beri yalnız yazıyor. Bu dersin bir yerinde ondan bir cümleyi SESLİ söylemesini iste ve mikrofon düğmesini hatırlat; konuşma ancak konuşarak gelişir."
      );
    } else if (bal.imbalanced) {
      lines.push(
        `⚠️ KONUŞMA DENGESİ BOZUK: Bu hafta ${bal.silentWork} sessiz iş (tekrar/okuma) karşısında yalnız ${bal.voiceWork} sesli iş var — çalışmasının ${pct(1 - (bal.ratio ?? 0))}'i ağzını hiç açmadan geçiyor. Bu derste sesli üretim iste; yazılı cevabı kabul etmeden önce "bunu bir de sesli söyle" de.`
      );
    } else if (bal.voiceWork === 0 && bal.silentWork > 0) {
      lines.push(
        `KONUŞMA: Bu hafta hiç sesli çalışma yok (${bal.silentWork} sessiz iş var). Sesli bir görev ver.`
      );
    }
    if (bal.neverShadowed) {
      lines.push(
        "Gölgeleme hiç denenmemiş — akıcılığın motoru odur, öğrenciye öner."
      );
    }
  }

  if (lines.length === 0) {
    return "\n\nÖLÇÜLEN İLERLEME:\nHenüz ölçülmüş veri yok (okuma bitirilmemiş, kulak turu yapılmamış). Seviye kararını yalnız kelime tekrarı ve derslerdeki gözlemine dayandır.";
  }
  return `\n\nÖLÇÜLEN İLERLEME (cihazın tuttuğu objektif veri — beyan değil):\n${lines.join("\n")}`;
}
