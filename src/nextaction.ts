/**
 * "Şimdi ne yapmalıyım?" — SAF karar mantığı (React/RN importu YOK;
 * tests/nextaction.test.ts).
 *
 * Denetimde çıkan en büyük arayüz kusuru: panelde 14 dokunulabilir blok
 * vardı ve hepsi aynı görsel ağırlıktaydı; öğrenci ekrana bakıp ne
 * yapacağını bilemiyordu. Bu modül uygulamanın TUTTUĞU veriden tek bir
 * öneri üretir; panel onu tepeye, diğer her şeyden büyük basar.
 *
 * Sıralama ilkesi: önce ÇÜRÜMEYİ durdur (tekrarı gelen kelime unutulmak
 * üzeredir), sonra EKSİK BECERİYİ kapat (hiç konuşmamış), sonra İLERLE
 * (sıradaki modül), en sonda pekiştir.
 */
import type { CurriculumModule } from "./types";

export type ActionScreen =
  | "review"
  | "lesson"
  | "module"
  | "reading"
  | "pronunciation"
  | "shadowing"
  | "mistakes"
  | "curriculum";

export interface NextAction {
  screen: ActionScreen;
  /** Düğme üstündeki kısa çağrı. */
  label: string;
  /** Neden bu — öğrenciye gerekçe (tek cümle). */
  reason: string;
  /** Modül önerisiyse hangi modül. */
  moduleId?: string;
  /** Sayısal rozet (ör. bekleyen tekrar sayısı). */
  badge?: number;
}

export interface StudyState {
  vocabTotal: number;
  dueCount: number;
  openMistakes: number;
  /** Müfredat kurulu mu. */
  hasCurriculum: boolean;
  /** Tamamlanmamış ilk modül (varsa). */
  nextModule?: Pick<CurriculumModule, "id" | "title" | "track">;
  /** Tüm modüller bitti mi. */
  curriculumDone: boolean;
  /** Bu hafta ve toplam sayaçlar. */
  spokenTotal: number;
  shadowedTotal: number;
  readingsFinished: number;
  /** Son çalışmadan bu yana geçen tam gün. */
  daysSinceActivity: number;
}

/** Tekrar yükü bu sayıyı aşınca "önce tekrar" her şeyin önüne geçer. */
export const DUE_URGENT = 10;

/**
 * Tek öneri döndürür. Sıra bilinçlidir ve gerekçesi yorumlarda:
 * boş defter → önce ders (öğrenecek malzeme yok), tekrar birikmiş →
 * tekrar (unutma en pahalı kayıp), hiç konuşmamış → konuşma (uygulamanın
 * asıl hedefi), sonra müfredat, sonra pekiştirme.
 */
export function nextAction(s: StudyState): NextAction {
  // Müfredat yoksa yapılacak tek anlamlı iş onu kurmaktır.
  if (!s.hasCurriculum) {
    return {
      screen: "curriculum",
      label: "Müfredatını kur",
      reason: "Sıfırdan başlıyorsun; hocan sana iki parkurluk bir yol çizsin.",
    };
  }

  // Defter boşken tekrar/okuma anlamsız: önce ders yapıp kelime biriktir.
  if (s.vocabTotal === 0) {
    return s.nextModule
      ? {
          screen: "module",
          moduleId: s.nextModule.id,
          label: `İlk dersine başla: ${s.nextModule.title}`,
          reason: "Defterin boş — hocan derste öğrendiğin kelimeleri kendisi yazacak.",
        }
      : {
          screen: "lesson",
          label: "Hocanla ilk sohbetini yap",
          reason: "Defterin boş — sohbet ettikçe kelimeler birikmeye başlar.",
        };
  }

  // Ara verilmişse dönüş kolay olmalı: en yüksek getirili iş tekrardır.
  if (s.daysSinceActivity >= 3 && s.dueCount > 0) {
    return {
      screen: "review",
      label: "Tekrarla başla",
      reason: `${s.daysSinceActivity} gün ara verdin; ${s.dueCount} kelime seni bekliyor.`,
      badge: s.dueCount,
    };
  }

  // Unutma en pahalı kayıptır: biriken tekrar her şeyin önüne geçer.
  if (s.dueCount >= DUE_URGENT) {
    return {
      screen: "review",
      label: "Kelime tekrarı",
      reason: `${s.dueCount} kelimenin tekrarı gelmiş — unutmadan geç.`,
      badge: s.dueCount,
    };
  }

  // Uygulamanın asıl hedefi konuşmak; hiç denenmemişse önce o açılır.
  if (s.spokenTotal === 0) {
    return {
      screen: "pronunciation",
      label: "Sesli çalışmayı dene",
      reason: "Henüz hiç sesli çalışmadın — konuşma ancak konuşarak gelişir.",
    };
  }

  // Seviye bitmişse ilerlemenin yolu yeni müfredattır.
  if (s.curriculumDone) {
    return {
      screen: "curriculum",
      label: "Sıradaki seviyeye geç",
      reason: "Bu seviyenin tüm modüllerini bitirdin.",
    };
  }

  // Normal gün: sıradaki modül.
  if (s.nextModule) {
    return {
      screen: "module",
      moduleId: s.nextModule.id,
      label: s.nextModule.title,
      reason:
        s.nextModule.track === "okuma"
          ? "Sıradaki okuma dersin."
          : "Sıradaki konuşma dersin.",
    };
  }

  // Az sayıda tekrar varsa onu kapat.
  if (s.dueCount > 0) {
    return {
      screen: "review",
      label: "Kelime tekrarı",
      reason: `${s.dueCount} kelimenin tekrarı gelmiş.`,
      badge: s.dueCount,
    };
  }

  // Açık hata birikmişse pekiştirme yeri orasıdır.
  if (s.openMistakes >= 3) {
    return {
      screen: "lesson",
      label: "Hocanla hatalarını çalış",
      reason: `${s.openMistakes} açık hata var; hocan bunları derste işlesin.`,
      badge: s.openMistakes,
    };
  }

  // Hiç okuma bitirmemişse okuma salonunu tanıt.
  if (s.readingsFinished === 0) {
    return {
      screen: "reading",
      label: "Okuma Salonu'nu aç",
      reason: "Kendi kelimelerinden örülmüş bir metin oku.",
    };
  }

  // Gölgeleme akıcılığın motorudur ve en çok atlanan iştir.
  if (s.shadowedTotal === 0) {
    return {
      screen: "shadowing",
      label: "Gölgeleme yap",
      reason: "Akıcılık için hocanın üstüne konuş.",
    };
  }

  // Her şey güncel: serbest sohbet her zaman değerlidir.
  return {
    screen: "lesson",
    label: "Hocanla serbest sohbet",
    reason: "Her şey güncel — konuşarak pekiştir.",
  };
}
