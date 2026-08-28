export type Role = "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
  /** Bu mesaj sırasında Üstaz'ın kullandığı araçların özetleri (UI'da rozet olarak gösterilir). */
  actions?: string[];
}

/** Seviye değerlendirme sonucu — konuşma (ammice) ve okuma (fusha) ayrı ölçülür. */
export interface Assessment {
  speakingLevel: string; // A0–C2, Şami ammicesi (konuşma)
  readingLevel: string; // A0–C2, fusha (okuma)
  strengths: string[];
  weaknesses: string[];
  summary: string; // Türkçe özet
}

export type Track = "konusma" | "okuma";

export interface CurriculumModule {
  id: string;
  track: Track;
  title: string;
  description: string;
  level: string;
  objectives: string[];
}

export interface Curriculum {
  modules: CurriculumModule[];
  generatedAt: string;
}

export interface Profile {
  name: string;
  /** Eski kayıtlardan gelen Anthropic anahtarı; artık apiKeys.anthropic kullanılır. */
  apiKey: string;
  /** Aktif model sağlayıcısı ("anthropic" | "openai" | "gemini" | "deepseek"). */
  provider?: string;
  /** Sağlayıcı başına API anahtarı — hepsi yalnızca bu cihazda saklanır. */
  apiKeys?: Record<string, string>;
  /** Sağlayıcı başına seçilen model. */
  models?: Record<string, string>;
  /** Aktif dil paketi ("ar" | "en" | "es"). Eski kayıtlarda yoktur → "ar". */
  activeLanguage?: string;
  /** Aktif dilin ilerlemesi — dil değişince langprog deposuna taşınır. */
  assessment?: Assessment;
  curriculum?: Curriculum;
  completedModuleIds: string[];
}

/** SRS kelime kartı — Üstaz'ın kelime_kaydet aracıyla oluşturulur. */
export interface VocabCard {
  id: string;
  arabic: string;
  transliteration: string;
  turkish: string;
  track: Track;
  note?: string;
  addedAt: string;
  due: string; // ISO — bu tarihten sonra tekrar sorulur
  /** FSRS aralığının aynası (geriye uyumluluk; 0 = bilemedi beklemesi). */
  intervalDays: number;
  /** FSRS difficulty'den türetilen SM-2 aynası (eski APK'ya dönüş güvencesi). */
  ease: number;
  /** Başarılı tekrar sayısı (FSRS: unutma reps'i SIFIRLAMAZ). */
  reps: number;
  /** Kaç kez "Bilemedim" denildi. Eski kayıtlarda olmayabilir. */
  lapses?: number;
  /** Son tekrarın zamanı (ISO). Eski kayıtlarda olmayabilir. */
  lastReviewedAt?: string;
  /** FSRS hafıza gücü (gün): hatırlama olasılığının %90'a düştüğü süre.
   *  Eski SM-2 kayıtlarında ve hiç çalışılmamış kartlarda yoktur; ilk puanlamada yazılır. */
  stability?: number;
  /** FSRS zorluğu, 1 (çok kolay) – 10 (çok zor). Yeni kartta hocanın kolay/orta/zor
   *  tohumunu taşır; ilk puanlamada gerçek D0'a dönüşür. Eski kayıtlarda yoktur. */
  difficulty?: number;
}

/** Tekrar notu: 0 = bilemedim, 1 = zor, 2 = bildim, 3 = çok kolay */
export type ReviewGrade = 0 | 1 | 2 | 3;

/** Hata defteri girdisi — Üstaz'ın hata_kaydet aracıyla oluşturulur. */
export interface MistakeEntry {
  id: string;
  mistake: string;
  correction: string;
  explanation: string;
  topic: string;
  createdAt: string;
  /**
   * Aynı konudaki hata kaç kez kaydedildi. 3'e ulaşan hata "fosilleşiyor"
   * demektir ve derste açıkça işlenmek üzere hafızada öne çıkarılır —
   * AI hocaların en bilinen kusuru, tekrarlayan hatayı anlayıp geçmesidir.
   * Eski kayıtlarda olmayabilir (→ 1 sayılır).
   */
  timesSeen?: number;
  /** Hangi parkurda yapıldı — hafıza filtrelemesi için. Eski kayıtlarda olmayabilir. */
  track?: Track;
  /** Üstaz "artık bu hatayı yapmıyor" dediğinde işaretlenir; hafızadan düşer. */
  resolved?: boolean;
  resolvedAt?: string;
}

/** Üstaz'ın kendine yazdığı ders notu — sonraki derslere hafıza olarak beslenir. */
export interface TeacherNote {
  id: string;
  note: string;
  createdAt: string;
}

/** Telaffuz pratiği öğesi — Üstaz seviyeye ve kelime defterine göre üretir. */
export interface PronunciationItem {
  arabic: string;
  transliteration: string;
  turkish: string;
  /** Türk öğrenciye özel telaffuz ipucu (örn. ع sesi nasıl çıkarılır). */
  tip: string;
}

export interface PronunciationSet {
  items: PronunciationItem[];
  createdAt: string;
}

/** Üstaz'ın ekrana_git aracıyla önerdiği yönlendirme (zorlamaz, öneri çipi olarak gösterilir). */
export interface NavigationSuggestion {
  screen: "dashboard" | "review" | "quiz" | "pronunciation" | "mistakes" | "module" | "reading";
  moduleId?: string;
  label: string;
}

/** Üstaz'ın kendi kurduğu hatırlatıcı. */
export interface Reminder {
  id: string;
  message: string;
  fireAt: string;
  createdAt: string;
  notificationId?: string;
}

// ---------------------------------------------------------------------------
// Okuma Salonu — kelime defterinden üretilen okuma metinleri
// ---------------------------------------------------------------------------

/** Okuma metni uzunluk kademesi. */
export type ReadingLength = "kisa" | "orta" | "uzun";

export interface ReadingSentence {
  /** Hedef dilin kendi yazımıyla TEK cümle (Arapça'da hareke politikasına göre). */
  target: string;
  /** Türkçe okunuşa yakın Latin transkripsiyon; Latin dillerde "". */
  translit: string;
  /** Doğal Türkçe çeviri. */
  tr: string;
}

export interface ReadingNewWord {
  /** Hedef yazım (Arapça'da HER ZAMAN tam harekeli). */
  word: string;
  translit: string;
  tr: string;
  /** Anlamın bağlamdan nasıl çıkarılacağına dair 1 cümlelik Türkçe ipucu. */
  hint: string;
}

export interface ReadingQuestion {
  /** Türkçe soru. */
  q: string;
  /** 3 Türkçe seçenek. */
  choices: string[];
  /** Doğru seçeneğin 0 tabanlı indeksi. */
  answer: number;
}

/** Metin sonu üretim görevi — okuma tanımayla değil transferle bitsin. */
export interface ReadingProductionTask {
  /** Türkçe yönerge ("Metindeki kelimelerle dün ne yediğini yaz" gibi). */
  instruction: string;
  /** Hedef dilde tek cümlelik örnek cevap (öğrenci yazdıktan sonra açılır). */
  example: string;
}

/** Modelden dönen ham üretim — provider.structured<ReadingGenPayload>. */
export interface ReadingGenPayload {
  title: string; // hedef dilde başlık
  titleTr: string; // Türkçe başlık
  sentences: ReadingSentence[];
  newWords: ReadingNewWord[];
  /** Metne gömüldüğü beyan edilen tekrar kelimeleri (verilen yazımla aynen). */
  usedReviewWords: string[];
  questions: ReadingQuestion[];
  productionTask: ReadingProductionTask;
}

/** Kütüphanede saklanan okuma metni. */
export interface ReadingText extends ReadingGenPayload {
  id: string; // "r" + epoch + rastgele (newCard id kalıbı)
  topic: string;
  /** Konu bir müfredat modülünden türetildiyse. */
  moduleId?: string;
  level: string; // üretim anındaki readingLevel
  length: ReadingLength;
  /** Soğuk başlangıç metni mi (defter < COLD_START_MIN). */
  coldStart: boolean;
  createdAt: string; // ISO
  /** bilinen/toplam — yaklaşık GERÇEK kapsam (yeni kelimeler bilinmeyen sayılır). Tanı amaçlı. */
  knownRatio: number;
  /** (bilinen + bildirilmiş yeni)/toplam — KURAL UYUMU; uyarı bandı buna bakar. */
  complianceRatio: number;
  /** newWords'te bildirilmeden geçen bilinmeyen tokenlar (normalize halleriyle, en fazla 20). */
  unplannedUnknown: string[];
  /** Cihazda metne eşlenen tekrar kartı id'leri. */
  reviewCardIds: string[];
  /** Bu metinden deftere eklenen kartların id'leri (mükerrer eklemeyi önler). */
  addedWordIds: string[];
  /** Okuma bitti işareti + soru skoru. */
  finishedAt?: string;
  quizCorrect?: number;
  quizTotal?: number;
}
