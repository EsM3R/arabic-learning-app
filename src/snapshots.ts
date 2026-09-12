/**
 * Otomatik anlık görüntünün DOSYA tarafı. Politika src/autobackup.ts'te
 * (saf ve test edilebilir); burada yalnız dosya sistemi tesisatı var.
 *
 * Dosyalar cihazın BELGE klasörüne yazılır (Paths.document), önbelleğe
 * değil: önbelleği Android yer darlığında kendiliğinden temizler ve yedek
 * diye tuttuğumuz şey sessizce kaybolurdu.
 */
import { Directory, File, Paths } from "expo-file-system";
import { buildBackup } from "./backup";
import { isSnapshotName, planPrune, snapshotName } from "./autobackup";
import { buildLabel } from "./buildInfo";
import { dumpAllEntries } from "./storage";

/** Anlık görüntülerin klasörü — elle alınan yedeklerle karışmasın. */
const DIR = "anlik-goruntuler";

function dir(): Directory {
  return new Directory(Paths.document, DIR);
}

function ensureDir(): Directory {
  const d = dir();
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

/** Klasördeki anlık görüntü dosyalarının adları (en yeni başta). */
export function listSnapshots(): string[] {
  try {
    const d = dir();
    if (!d.exists) return [];
    return d
      .list()
      .map((e) => e.name)
      .filter(isSnapshotName)
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export interface SnapshotWrite {
  ok: boolean;
  name?: string;
  /** Silinen eski anlık görüntü sayısı. */
  pruned: number;
  error?: string;
}

/**
 * Bütün depoyu tek dosyaya yazar ve eskileri budar.
 *
 * ÖNCE YAZ SONRA BUDA: ters sırada, yazma başarısız olursa elde hiç kopya
 * kalmayabilirdi. Budama hatası yazmayı geçersiz kılmaz — fazladan dosya
 * kalması, kopyasız kalmaktan iyidir.
 */
export async function writeSnapshot(now = new Date()): Promise<SnapshotWrite> {
  try {
    const backup = buildBackup(await dumpAllEntries(), buildLabel(), now);
    const d = ensureDir();
    const name = snapshotName(now);
    const file = new File(d, name);
    if (file.exists) file.delete();
    file.create();
    file.write(JSON.stringify(backup));

    let pruned = 0;
    try {
      const { remove } = planPrune(listSnapshots());
      for (const old of remove) {
        const f = new File(d, old);
        if (f.exists) {
          f.delete();
          pruned += 1;
        }
      }
    } catch {
      // budama başarısız: fazladan dosya kalır, veri güvende
    }
    return { ok: true, name, pruned };
  } catch (e) {
    return { ok: false, pruned: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

/** En yeni anlık görüntünün tam yolu (paylaşmak için); yoksa null. */
export function latestSnapshotUri(): string | null {
  const names = listSnapshots();
  if (names.length === 0) return null;
  try {
    const f = new File(dir(), names[0]);
    return f.exists ? f.uri : null;
  } catch {
    return null;
  }
}
