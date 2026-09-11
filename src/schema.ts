/**
 * Depo şema sürümü ve göç zinciri — SAF modül (React/RN importu YOK;
 * tests/schema.test.ts).
 *
 * NEDEN VAR: uygulamanın bütün hafızası AsyncStorage'daki JSON dizeleridir ve
 * şimdiye kadar hiçbir sürüm damgası yoktu. Bunun iki somut riski var:
 *
 * 1. İLERİ GÖÇ: yarın bir alanın biçimi değişirse eski kayıtları okuyan kod
 *    ya çöker ya da sessizce yanlış okur. Göçün yapılacağı bir yer olmadığı
 *    için de çözüm "kullanıcı sıfırdan başlasın"a düşerdi — aylarca birikmiş
 *    kelime defteri için kabul edilemez.
 * 2. GERİ SÜRÜM: öğrenci eski bir APK kurarsa (ki bu uygulamada APK elle
 *    kuruluyor, çok olası), yeni biçimdeki veriyi tanımayan eski kod onun
 *    üstüne yazar ve veri sessizce bozulur. Damga olmadan bunu FARK ETMEK
 *    bile mümkün değil.
 *
 * Bugün göç listesi boş; makinenin kendisi ve geri-sürüm koruması asıl değer.
 */

/** Bu derlemenin yazdığı şema sürümü. Biçim değiştikçe artar. */
export const SCHEMA_VERSION = 1;

/** Sürümün saklandığı depo anahtarı (dil-bağımsız). */
export const SCHEMA_KEY = "schema.version";

export interface Migration {
  /** Bu göç tamamlanınca ulaşılan sürüm. */
  to: number;
  /** Ne yaptığı — kayıt ve hata ayıklama için. */
  note: string;
  /** Ham anahtar→değer haritasını dönüştürür. SAF olmalı. */
  apply: (entries: Record<string, string>) => Record<string, string>;
}

/**
 * Göç zinciri, `to` sırasına göre. Bir göç EKLERKEN kural: asla yerinde
 * silme yapma — yeni anahtarı yaz, eskisini bırak. Yarım kalan bir göçün
 * ardından uygulama açıldığında veri hâlâ okunabilir olmalı.
 */
export const MIGRATIONS: Migration[] = [];

export type SchemaStatus = "bos" | "guncel" | "goc-gerekli" | "gelecekten";

/**
 * Depodaki damgaya bakarak ne yapılacağını söyler.
 * - "bos": hiç damga yok (ilk kurulum ya da damgadan önceki sürüm)
 * - "gelecekten": veri bu derlemeden YENİ — dokunmak tehlikeli
 */
export function schemaStatus(stored: number | null): SchemaStatus {
  if (stored === null) return "bos";
  if (stored > SCHEMA_VERSION) return "gelecekten";
  if (stored < SCHEMA_VERSION) return "goc-gerekli";
  return "guncel";
}

/** `from` sürümünden bugüne çalıştırılacak göçler, sırasıyla. */
export function planMigrations(from: number): Migration[] {
  return MIGRATIONS.filter((m) => m.to > from && m.to <= SCHEMA_VERSION).sort(
    (a, b) => a.to - b.to
  );
}

export interface MigrationResult {
  entries: Record<string, string>;
  /** Ulaşılan sürüm. */
  version: number;
  /** Uygulanan göçlerin notları (boşsa hiçbir şey yapılmadı). */
  applied: string[];
}

/**
 * Göçleri sırayla uygular. Bir göç patlarsa ORADA DURUR ve o ana kadar
 * ulaşılan sürümü döndürür — kalan göçler bir sonraki açılışta yeniden
 * denenir. Yarım göçü "tamam" diye damgalamak, veriyi sessizce bozmanın
 * en kolay yoludur.
 */
export function runMigrations(
  entries: Record<string, string>,
  from: number
): MigrationResult {
  let current = entries;
  let version = from;
  const applied: string[] = [];
  for (const m of planMigrations(from)) {
    try {
      current = m.apply(current);
      version = m.to;
      applied.push(m.note);
    } catch {
      break; // bir sonraki açılışta tekrar denenir
    }
  }
  return { entries: current, version, applied };
}

/**
 * Geri sürüm uyarısı. Uygulama bu durumda VERİYE DOKUNMAMALI: öğrenciye
 * güncellemesi söylenir, yoksa yeni biçimdeki kayıtların üstüne eski biçim
 * yazılır ve kayıp geri alınamaz.
 */
export const FUTURE_SCHEMA_WARNING =
  "Bu cihazdaki öğrenme verisi, yüklü uygulamadan DAHA YENİ bir sürümle yazılmış. " +
  "Veriyi bozmamak için uygulamayı güncelleyene kadar hiçbir değişiklik kaydedilmeyecek. " +
  "Güncel APK'yı kurduğunda her şey yerinde olacak.";
