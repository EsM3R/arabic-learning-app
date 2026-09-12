/**
 * Otomatik anlık görüntü — SAF politika (React/RN importu YOK;
 * tests/autobackup.test.ts). Dosya yazma işi src/snapshots.ts'te.
 *
 * NE YAPAR, NE YAPMAZ — bu ayrım önemli, yoksa yanlış güven verir:
 *
 * YAPAR: uygulama her açıldığında, gerekiyorsa, bütün deponun bir kopyasını
 * cihazın belge klasörüne yazar ve son birkaçını saklar. Bu, uygulamanın
 * KENDİ verisini bozmasına karşı koruma sağlar — yarım yazma, bozuk göç,
 * hatalı geri yükleme, "yanlışlıkla sıfırla" gibi durumlarda geri dönülecek
 * bir nokta olur.
 *
 * YAPMAZ: telefon kaybolur ya da uygulama silinirse bu dosyalar da gider.
 * Ona karşı tek koruma öğrencinin dosyayı DIŞARI almasıdır (bkz. backup.ts
 * exportReminder). Bu modül o hatırlatmanın yerine geçmez, yanına durur.
 */

/** İki anlık görüntü arasındaki en kısa süre. */
export const SNAPSHOT_INTERVAL_HOURS = 24;
/** Saklanan anlık görüntü sayısı — disk sonsuz değil, geçmiş de gerekli. */
export const KEEP_SNAPSHOTS = 3;
/** Bu kadar kelime birikmeden anlık görüntü alınmaz. */
export const SNAPSHOT_MIN_VOCAB = 10;

export interface SnapshotDecision {
  due: boolean;
  /** Neden alınmadı/alınıyor — hata ayıklama ve Ayarlar ekranı için. */
  reason: string;
}

/**
 * Şimdi anlık görüntü alınmalı mı.
 *
 * Boş deftere anlık görüntü almak anlamsız (korunacak emek yok) ve ilk
 * açılışı yavaşlatır; bu yüzden alt sınır var.
 */
export function snapshotDue(
  lastAt: string | null,
  vocabCount: number,
  now = new Date()
): SnapshotDecision {
  if (vocabCount < SNAPSHOT_MIN_VOCAB) {
    return { due: false, reason: "Korunacak kadar veri yok." };
  }
  if (!lastAt) return { due: true, reason: "Hiç anlık görüntü alınmamış." };
  const then = new Date(lastAt).getTime();
  if (!Number.isFinite(then)) {
    return { due: true, reason: "Önceki kaydın tarihi okunamadı." };
  }
  const hours = (now.getTime() - then) / 3_600_000;
  if (hours < 0) {
    // Saat geri alınmış: bir sonraki açılışta yeniden değerlendirilir.
    return { due: false, reason: "Cihaz saati geri alınmış görünüyor." };
  }
  if (hours >= SNAPSHOT_INTERVAL_HOURS) {
    return { due: true, reason: `Son anlık görüntü ${Math.floor(hours)} saat önce.` };
  }
  return { due: false, reason: `Son anlık görüntü ${Math.floor(hours)} saat önce — henüz gerekmiyor.` };
}

/** Dosya adı: anlik-2026-09-12T08-30-00.json (sıralanabilir olsun diye ISO). */
export function snapshotName(now = new Date()): string {
  return `anlik-${now.toISOString().replace(/[:.]/g, "-")}.json`;
}

/** Bir dosya adı bu modülün ürettiği anlık görüntü mü. */
export function isSnapshotName(name: string): boolean {
  return /^anlik-.*\.json$/.test(name);
}

/**
 * Budama sonrası SAKLANACAK dosyalar ve SİLİNECEKLER.
 *
 * Sıralama ada göre: ad ISO zaman damgası taşıdığı için alfabetik sıra
 * kronolojik sıradır. Dosya sistemi zaman damgasına güvenilmiyor — geri
 * yükleme ve kopyalama onu değiştirir.
 */
export function planPrune(names: string[]): { keep: string[]; remove: string[] } {
  const snaps = names.filter(isSnapshotName).sort().reverse(); // en yeni başta
  return { keep: snaps.slice(0, KEEP_SNAPSHOTS), remove: snaps.slice(KEEP_SNAPSHOTS) };
}

/** Ayarlar ekranındaki tek satırlık durum metni. */
export function snapshotStatus(lastAt: string | null, count: number, now = new Date()): string {
  if (!lastAt || count === 0) {
    return "Henüz otomatik anlık görüntü alınmadı.";
  }
  const hours = Math.floor((now.getTime() - new Date(lastAt).getTime()) / 3_600_000);
  const when =
    !Number.isFinite(hours) || hours < 0
      ? "bilinmeyen bir zamanda"
      : hours < 1
        ? "az önce"
        : hours < 24
          ? `${hours} saat önce`
          : `${Math.floor(hours / 24)} gün önce`;
  return `Son otomatik anlık görüntü ${when} alındı (${count} kopya saklanıyor). Bunlar telefonda durur; telefonu kaybedersen gitmesinler diye ayrıca dışarı yedek al.`;
}
