import type { ExportReminder } from "../../backup";
import type { MigrationScope } from "../../fusha";
import type { LanguagePack } from "../../languages";
import type { NextAction } from "../../nextaction";
import type { WeekDay } from "../../stats";
import type { CurriculumModule, MistakeEntry, NavigationSuggestion, Profile, VocabCard } from "../../types";

/**
 * Ana ekranın dört sekmesinin ortak modeli. Veri ve eylemler tek yerde
 * (DashboardScreen) toplanır; sekmeler yalnız çizer.
 */
export interface HomeModel {
  profile: Profile;
  pack: LanguagePack;
  loaded: boolean;
  vocabTotal: number;
  vocabDue: number;
  mistakeCount: number;
  weekLine: string | null;
  /** Deftere son eklenen kelimeler (yeniden eskiye). */
  recentWords: VocabCard[];
  /** Açık hatalardan en yenileri. */
  recentMistakes: MistakeEntry[];
  week: WeekDay[];
  today: NextAction | null;
  teacherNote: string | null;
  teacherSuggestion: NavigationSuggestion | null;
  fusha: MigrationScope | null;
  backupWarn: ExportReminder | null;
  building: boolean;
  buildElapsed: number;
  buildError: string | null;
  totalModules: number;
  doneModules: number;
  progress: number;

  openToday: () => void;
  onSuggestionPress: () => void;
  startCurriculumBuild: () => void;
  confirmFushaMigration: () => void;
  startQuiz: () => void;
  pickLanguage: () => void;
  confirmReset: () => void;
  onOpenModule: (m: CurriculumModule) => void;
  onFreeChat: () => void;
  onOpenReview: () => void;
  onOpenMistakes: () => void;
  onOpenPronunciation: () => void;
  onOpenReading: () => void;
  onOpenShadowing: () => void;
  onOpenFluency: () => void;
  onOpenConversation: () => void;
  onOpenSentences: () => void;
  onOpenLevel: () => void;
  onLevelUp: () => void;
  onOpenSettings: () => void;
  goTab: (tab: "today" | "practice" | "notebook" | "profile") => void;
}
