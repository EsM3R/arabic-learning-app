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
  | "curriculum"
  | "fluency";

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
  /** Tamamlanan akıcılık (4/3/2) turu sayısı. */
  fluencyTotal: number;
  readingsFinished: number;
  /** Son çalışmadan bu yana geçen tam gün. */
  daysSinceActivity: number;
  /** Bu haftaki sesli iş: mikrofon denemesi + gölgeleme (bkz. progress.ts). */
  voiceWorkWeek: number;
  /** Bu haftaki sessiz iş: kelime tekrarı + okunan cümle. */
  silentWorkWeek: number;
  /** Son 7 günde çalışılan gün sayısı — tek günlük patlama denge sanılmasın. */
  activeDays7: number;
}

/** Tekrar yükü bu sayıyı aşınca "önce tekrar" her şeyin önüne geçer. */
export const DUE_URGENT = 10;

/** Denge kontrolünün anlamlı olması için gereken en az sessiz iş hacmi. */
export const SILENT_WORK_FLOOR = 20;
/** Sesli işin toplam işe oranı bunun altındaysa uygulama araya girer. */
export const VOICE_RATIO_MIN = 0.2;
/** Denge kontrolü için gereken en az aktif gün — tek oturum yeterli değil. */
export const BALANCE_MIN_DAYS = 2;

/**
 * Konuşma boşluğu — uygulamanın asıl hedefine göre en kritik kural.
 *
 * Eskiden burada tek seferlik bir kapı vardı (`spokenTotal === 0`): öğrenci
 * hayatında BİR KEZ mikrofona bastıktan sonra uygulama onu bir daha konuşmaya
 * itmiyordu. Yazmak her zaman daha kolay olduğu için bu, sessizce "dili bilen
 * ama konuşamayan" öğrenci üretir. Kontrol artık SÜREKLİ: her hafta sesli ve
 * sessiz iş oranına bakılır.
 */
export function speakingGap(s: StudyState): NextAction | null {
  if (s.spokenTotal === 0) {
    return {
      screen: "pronunciation",
      label: "Sesli çalışmayı dene",
      reason: "Henüz hiç sesli çalışmadın — konuşma ancak konuşarak gelişir.",
    };
  }
  if (s.shadowedTotal === 0) {
    return {
      screen: "shadowing",
      label: "Gölgeleme yap",
      reason: "Akıcılığın motoru gölgelemedir; hocanın üstüne konuş.",
    };
  }
  // Akıcılık alıştırması hiç denenmemişse: konuşabilmenin önündeki engel
  // çoğu zaman kelime değil DURAKSAMADIR; antrenmanı yalnız burada var.
  if (s.fluencyTotal === 0) {
    return {
      screen: "fluency",
      label: "Akıcılık Odası'nı dene",
      reason: "Aynı şeyi azalan sürede üç kez anlat — duraksamayı eriten alıştırma.",
    };
  }

  const total = s.voiceWorkWeek + s.silentWorkWeek;
  const imbalanced =
    s.activeDays7 >= BALANCE_MIN_DAYS &&
    s.silentWorkWeek >= SILENT_WORK_FLOOR &&
    total > 0 &&
    s.voiceWorkWeek / total < VOICE_RATIO_MIN;
  if (!imbalanced) return null;

  const silentPct = Math.round((1 - s.voiceWorkWeek / total) * 100);
  // Hangi sesli iş daha zayıfsa oraya yönlendir: bu hafta hiç gölgelemediyse
  // akıcılık, gölgeledi ama konuşmadıysa telaffuz/üretim.
  return {
    screen: s.voiceWorkWeek === 0 ? "pronunciation" : "shadowing",
    label: "Sesli çalış",
    reason: `Bu haftaki çalışmanın %${silentPct}'i sessiz geçti — ağzını açmadan konuşma gelmez.`,
  };
}

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

  // Uygulamanın asıl hedefi konuşmak: bu kapı bir kez değil HER HAFTA bakar.
  const gap = speakingGap(s);
  if (gap) return gap;

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

  // (Gölgeleme ve sesli çalışma dürtmesi artık yukarıda, speakingGap içinde:
  // en sona bırakılırsa haftalarca sıraya gelmiyordu.)

  // Her şey güncel: serbest sohbet her zaman değerlidir.
  return {
    screen: "lesson",
    label: "Hocanla serbest sohbet",
    reason: "Her şey güncel — konuşarak pekiştir.",
  };
}
