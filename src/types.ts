export type Role = "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
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
