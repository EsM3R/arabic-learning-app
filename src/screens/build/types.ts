/**
 * Kartların ortak tipleri: bir denemenin ekranda gösterilen sonucu.
 */
import type { StepVerdict } from "../../sentencebuilding";

export interface Attempt {
  verdict: StepVerdict;
  /** "Bilmiyorum" ile doğrusu açıldı. */
  revealed: boolean;
  /** Mikrofonla söylendiyse ses tanımanın duyduğu (n-best'te seçilen). */
  heard?: string;
  feedback: string;
  /** Kıyaslanan doğru biçim (öğrencinin seçtiği söyleyişle). */
  expected: string;
  spoken: boolean;
  /** Tuzak kelimeye düşüldü mü (kimliği). */
  trapId?: string;
  /**
   * Hocaya danışma: denetleyici "olmadı" dediğinde söyleyiş hocaya sorulur.
   * bakiyor → cevap bekleniyor; kabul → hoca doğru buldu (karar "dogru"ya
   * çıkar); ret → hoca da yanlış buldu; hata → hocaya ulaşılamadı.
   */
  judge?: "bakiyor" | "kabul" | "ret" | "hata";
  /** Hocanın NEDEN açıklaması (ya da ulaşılamama sebebi). */
  why?: string;
}

/** Kartın paylaştığı gösterim ayarları. */
export interface ViewOpts {
  rtl: boolean;
  /** Arapçada harekeler görünsün mü. */
  harakat: boolean;
  /** Hedef metni gösterime hazırlar (hareke anahtarı). */
  show: (t: string) => string;
}
