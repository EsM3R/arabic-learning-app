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
  apiKey: string;
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
