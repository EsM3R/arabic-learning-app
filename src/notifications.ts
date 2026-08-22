import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { getActivePack } from "./languages";
import { loadReminders, saveReminders } from "./storage";

let handlerReady = false;

/** Bildirim uygulama açıkken de görünsün. Bir kez kurulur. */
function ensureHandler(): void {
  if (handlerReady) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  handlerReady = true;
}

export interface ScheduleOutcome {
  ok: boolean;
  reason?: string;
}

/**
 * Üstaz'ın hatırlatıcı kurmasını sağlar. Expo Go'da yerel bildirimler çalışır;
 * izin verilmezse veya ortam desteklemezse sessizce başarısız olur — uygulamayı
 * çökertmez, modele neden başarısız olduğu bildirilir.
 */
export async function scheduleReminder(
  hoursFromNow: number,
  message: string
): Promise<ScheduleOutcome> {
  try {
    ensureHandler();

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      const asked = await Notifications.requestPermissionsAsync();
      granted = asked.granted;
    }
    if (!granted) {
      return { ok: false, reason: "Öğrenci bildirim izni vermemiş." };
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("hatirlatici", {
        name: "Ders hatırlatıcıları",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const seconds = Math.round(hoursFromNow * 3600);
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `Lisan Hocası — ${getActivePack().teacherName}`,
        body: message,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        repeats: false,
        channelId: Platform.OS === "android" ? "hatirlatici" : undefined,
      },
    });

    const reminders = await loadReminders();
    await saveReminders([
      ...reminders,
      {
        id: `r${Date.now()}${Math.floor(Math.random() * 1000)}`,
        message,
        fireAt: new Date(Date.now() + seconds * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        notificationId,
      },
    ]);

    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** Geçmiş hatırlatıcıları temizler; panelde bekleyen sayısını göstermek için kalanları döndürür. */
export async function pendingReminders() {
  const reminders = await loadReminders();
  const now = Date.now();
  const upcoming = reminders.filter((r) => new Date(r.fireAt).getTime() > now);
  if (upcoming.length !== reminders.length) await saveReminders(upcoming);
  return upcoming;
}
