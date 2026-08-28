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
  intervalDays: number;
  ease: number;
  reps: number;
  /** Kaç kez "Bilemedim" denildi. Eski kayıtlarda olmayabilir. */
  lapses?: number;
  /** Son tekrarın zamanı (ISO). Eski kayıtlarda olmayabilir. */
  lastReviewedAt?: string;
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
  screen: "dashboard" | "review" | "quiz" | "pronunciation" | "mistakes" | "module";
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
