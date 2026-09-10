/**
 * Ammiceden fushaya geçiş — SAF mantık (React/RN importu YOK;
 * tests/fusha.test.ts).
 *
 * Öğrenci Şam ammicesini zaten biliyordu ve uygulama ona ammice öğretiyordu;
 * artık yalnız fusha öğretiliyor. Defterdeki eski ammice kartların ve ammiceye
 * göre kurulmuş müfredatın temizlenmesi gerekiyor.
 *
 * İNCE NOKTA — bu modülün var olma sebebi: eski ammice kartlar track="konusma"
 * ile kaydedilmişti, ama geçişten SONRA "konusma" parkuru "sözlü fusha"
 * demek ve yeni kartlar da aynı etiketi alacak. Yani parkur etiketi tek
 * başına eski ammiceyi yeni fushadan AYIRT EDEMEZ. Bu yüzden temizlik tek
 * seferliktir ve kalıcı bir bayrakla kilitlenir: bayrak konduktan sonra bir
 * daha asla kart silinmez.
 */
import type { Curriculum, VocabCard } from "./types";

/** Geçişin yapıldığını işaretleyen depo anahtarı (dil-bağımsız değil: yalnız Arapça). */
export const FUSHA_MIGRATION_KEY = "fushaMigration.v1";

export interface MigrationScope {
  /** Silinecek eski ammice kart sayısı. */
  cardsToRemove: number;
  /** Defterde kalacak kart sayısı. */
  cardsKept: number;
  /** Sıfırlanacak müfredat modülü sayısı (0 = müfredat yok). */
  modulesToClear: number;
  /** Gösterilecek bir şey var mı — yoksa kart hiç çıkmaz. */
  needed: boolean;
}

/**
 * Geçişin kapsamını hesaplar. `migrated` true ise kapsam HER ZAMAN boştur:
 * geçiş bir kez yapılır, sonrasında "konusma" kartları yeni fusha kartlarıdır
 * ve silinmemelidir.
 */
export function migrationScope(
  vocab: VocabCard[],
  curriculum: Curriculum | undefined,
  migrated: boolean
): MigrationScope {
  if (migrated) {
    return { cardsToRemove: 0, cardsKept: vocab.length, modulesToClear: 0, needed: false };
  }
  const remove = vocab.filter((c) => c.track === "konusma").length;
  const modules = curriculum?.modules.length ?? 0;
  return {
    cardsToRemove: remove,
    cardsKept: vocab.length - remove,
    modulesToClear: modules,
    needed: remove > 0 || modules > 0,
  };
}

/**
 * Temizlenmiş defter. Yalnız geçiş yapılmamışken anlamlıdır — çağıran
 * migrationScope ile birlikte kullanır.
 */
export function withoutColloquial(vocab: VocabCard[]): VocabCard[] {
  return vocab.filter((c) => c.track !== "konusma");
}

/** Onay penceresinde gösterilecek Türkçe özet. */
export function migrationSummary(s: MigrationScope): string {
  const parts: string[] = [];
  if (s.cardsToRemove > 0) {
    parts.push(
      `Kelime defterindeki ${s.cardsToRemove} ammice kart silinecek (${s.cardsKept} kart kalacak).`
    );
  }
  if (s.modulesToClear > 0) {
    parts.push(`Ammiceye göre kurulmuş ${s.modulesToClear} modüllük müfredat sıfırlanacak.`);
  }
  parts.push("Bu geri alınamaz — istersen önce Ayarlar'dan yedek al.");
  return parts.join("\n\n");
}
