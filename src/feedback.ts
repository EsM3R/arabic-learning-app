/**
 * Dokunsal geri bildirim.
 *
 * Kelime sınavında doğru/yanlış anı yalnız bir metin satırıydı; sonucun
 * "hissedilmesi" hatırlamayı güçlendirir ve ekrana bakmadan da anlaşılır.
 * Titreşim hiçbir akışın kritik yolunda değildir: cihaz desteklemiyorsa ya
 * da izin yoksa sessizce yutulur — ders asla titreşim yüzünden kırılmaz.
 */
import * as Haptics from "expo-haptics";

export async function feedback(correct: boolean): Promise<void> {
  try {
    await Haptics.notificationAsync(
      correct
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning
    );
  } catch {
    // bilinçli sessiz — bkz. yukarıdaki not
  }
}

/** Seçim/dokunma gibi hafif etkileşimler için. */
export async function tap(): Promise<void> {
  try {
    await Haptics.selectionAsync();
  } catch {
    // bilinçli sessiz
  }
}
