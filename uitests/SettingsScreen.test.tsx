/**
 * Ayarlar ekranı testi.
 *
 * Bu ekranın verebileceği zarar diğerlerinden farklı: burada kaybedilen şey
 * bir alıştırma turu değil, AYLARIN BİRİKİMİ. "Yedekten dön" cihazdaki her
 * şeyi siler; yanlış dosyayla ya da onaysız çalışırsa kelime defteri, hata
 * defteri, hocanın notları ve bütün sohbetler geri getirilemez biçimde
 * gider. Bu yüzden buradaki testlerin çoğu OLMAMASI gerekeni ölçüyor:
 * onay verilmeden depo değişmemeli, bozuk dosya okunmamalı.
 *
 * İkinci mesele sessiz anahtar kaybı: ekran bütün sağlayıcıların anahtarını
 * aynı anda taslakta tutar. Kaydetme yalnız seçili olanı yazsaydı,
 * sağlayıcı değiştiren öğrenci öbürünün anahtarını fark etmeden silerdi.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { Alert } from "react-native";
import SettingsScreen from "../src/screens/SettingsScreen";
import { backupFileName, buildBackup, serializeBackup } from "../src/backup";
import { setActiveLanguage } from "../src/languages";
import { loadVocab, saveVocab } from "../src/storage";
import type { Profile, VocabCard } from "../src/types";

const mockTestConnection = jest.fn();
jest.mock("../src/claude", () => ({
  testConnection: (...args: unknown[]) => mockTestConnection(...args),
}));

function profile(over: Partial<Profile> = {}): Profile {
  return {
    name: "Mehmet",
    apiKey: "sk-ant-eski",
    provider: "anthropic",
    apiKeys: { anthropic: "sk-ant-eski" },
    models: {},
    completedModuleIds: [],
    ...over,
  } as unknown as Profile;
}

function card(over: Partial<VocabCard> = {}): VocabCard {
  return {
    id: "v1",
    arabic: "بَيْت",
    transliteration: "beyt",
    turkish: "ev",
    track: "okuma",
    addedAt: "2026-09-01T10:00:00.000Z",
    due: "2026-09-02T10:00:00.000Z",
    intervalDays: 1,
    ease: 2.5,
    reps: 1,
    lapses: 0,
    ...over,
  } as VocabCard;
}

type Btn = { text?: string; onPress?: () => void; style?: string };
const alerts: { title?: string; body?: string; buttons?: Btn[] }[] = [];
function lastAlert() {
  return alerts[alerts.length - 1];
}
function pressAlert(label: RegExp) {
  const btn = lastAlert()?.buttons?.find((b) => label.test(b.text ?? ""));
  if (!btn) throw new Error(`Uyarıda "${label}" düğmesi yok: ${JSON.stringify(lastAlert())}`);
  act(() => {
    btn.onPress?.();
  });
}

/** Belge seçiciye bir dosya yerleştirir (bellek içi dosya sistemine yazarak). */
function placePickedFile(contents: string, uri = "file:///picked/yedek.json") {
  (global as unknown as { __fs: Map<string, string> }).__fs.set(uri, contents);
  const picker = require("expo-document-picker");
  picker.getDocumentAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri }] });
}

const saved: Profile[] = [];
let restored = 0;

beforeEach(async () => {
  alerts.length = 0;
  saved.length = 0;
  restored = 0;
  mockTestConnection.mockReset();
  mockTestConnection.mockResolvedValue({ ok: true, title: "Bağlantı çalışıyor", detail: "—" });
  setActiveLanguage("ar");
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
  (global as unknown as { __fs: Map<string, string> }).__fs.clear();
  const sharing = require("expo-sharing");
  sharing.isAvailableAsync.mockReset();
  sharing.isAvailableAsync.mockResolvedValue(true);
  sharing.shareAsync.mockReset();
  sharing.shareAsync.mockResolvedValue(undefined);
  const picker = require("expo-document-picker");
  picker.getDocumentAsync.mockReset();
  picker.getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
  jest
    .spyOn(Alert, "alert")
    .mockImplementation((title?: string, body?: string, buttons?: Btn[]) => {
      alerts.push({ title, body, buttons });
    });
});

async function open(p: Profile = profile()) {
  render(
    <SettingsScreen
      profile={p}
      onSave={(next) => saved.push(next)}
      onRestored={() => {
        restored += 1;
      }}
      onBack={() => {}}
    />
  );
  await waitFor(() => expect(screen.getByText("SAĞLAYICI")).toBeTruthy());
}

// --- anahtarlar -------------------------------------------------------------

test("sağlayıcı değişse bile ÖBÜRÜNÜN anahtarı kaybolmaz", async () => {
  // Bu kırılsa hata çıkmaz: öğrenci geri döndüğünde anahtar alanını boş bulur
  // ve neden silindiğini asla anlayamaz.
  await open();
  fireEvent.press(screen.getByText("Google Gemini"));
  fireEvent.changeText(screen.getByPlaceholderText(/anahtarı yapıştır/), "gemini-anahtari");
  fireEvent.press(screen.getByText("Kaydet"));

  await waitFor(() => expect(saved).toHaveLength(1));
  expect(saved[0].apiKeys?.gemini).toBe("gemini-anahtari");
  expect(saved[0].apiKeys?.anthropic).toBe("sk-ant-eski"); // dokunulmadı
  expect(saved[0].provider).toBe("gemini");
});

test("eski apiKey alanı Anthropic anahtarıyla UYUMLU kalır", async () => {
  // Geriye dönük uyum: eski kod yollarının hepsi bu alanı okuyor.
  await open();
  fireEvent.changeText(screen.getByPlaceholderText(/sk-ant-/), "sk-ant-yeni");
  fireEvent.press(screen.getByText("Kaydet"));
  await waitFor(() => expect(saved).toHaveLength(1));
  expect(saved[0].apiKey).toBe("sk-ant-yeni");
});

test("anahtarsız kaydetmeye izin verilmez", async () => {
  await open(profile({ apiKey: "", apiKeys: {} } as Partial<Profile>));
  fireEvent.press(screen.getByText("Kaydet"));
  expect(lastAlert()?.title).toMatch(/Anahtar eksik/);
  expect(saved).toHaveLength(0);
});

test("ÖNEKİ tutmayan anahtar kaydedilmez — hata ders ortasında değil burada çıkar", async () => {
  await open();
  fireEvent.changeText(screen.getByPlaceholderText(/sk-ant-/), "yanlis-anahtar");
  fireEvent.press(screen.getByText("Kaydet"));
  expect(lastAlert()?.title).toMatch(/hatalı görünüyor/);
  expect(saved).toHaveLength(0);
});

test("BOZUK sağlayıcı kaydı ekranı çökertmez", async () => {
  // Eski ya da elle bozulmuş bir kayıtta find() undefined döner ve ekran
  // açılmazdı: ayarlara giremeyen kullanıcı anahtarını da düzeltemez.
  await open(profile({ provider: "uydurma-saglayici" } as unknown as Partial<Profile>));
  expect(screen.getByText("Anthropic (Claude)")).toBeTruthy();
});

// --- bağlantı sınaması ------------------------------------------------------

test("bağlantı sınaması EKRANDAKİ taslakla yapılır, kaydedilmişle değil", async () => {
  // Öğrenci anahtarı yeni yapıştırmış olur; kayıtlıyla sınamak "çalışmıyor"
  // deyip onu eski anahtara geri döndürürdü.
  await open();
  fireEvent.changeText(screen.getByPlaceholderText(/sk-ant-/), "sk-ant-taze");
  fireEvent.press(screen.getByText(/Bağlantıyı sına/));

  await waitFor(() => expect(mockTestConnection).toHaveBeenCalledTimes(1));
  const draft = mockTestConnection.mock.calls[0][0] as Profile;
  expect(draft.apiKeys?.anthropic).toBe("sk-ant-taze");
  await waitFor(() => expect(screen.getByText(/Bağlantı çalışıyor/)).toBeTruthy());
});

test("sınama çökerse ekran değil SONUÇ hata gösterir", async () => {
  mockTestConnection.mockRejectedValueOnce(new Error("401 unauthorized"));
  await open();
  fireEvent.press(screen.getByText(/Bağlantıyı sına/));
  await waitFor(() => expect(screen.getByText(/Bağlantıyı sına/)).toBeTruthy());
  expect(screen.queryByText(/Bağlantı çalışıyor/)).toBeNull();
});

// --- yedek alma -------------------------------------------------------------

test("yedek dosyası GERÇEKTEN yazılır ve dışarı paylaşılır", async () => {
  await saveVocab([card()]);
  await open();
  fireEvent.press(screen.getByText("Yedek al"));

  const sharing = require("expo-sharing");
  await waitFor(() => expect(sharing.shareAsync).toHaveBeenCalledTimes(1));
  const fs = (global as unknown as { __fs: Map<string, string> }).__fs;
  const written = fs.get(`file:///cache/${backupFileName()}`);
  expect(written).toBeTruthy();
  expect(JSON.parse(written as string).entries["vocab.v1"]).toMatch(/بَيْت/);
});

test("yedek ANAHTAR TAŞIMAZ — dosya paylaşılacak bir yere gidiyor", async () => {
  await open();
  fireEvent.press(screen.getByText("Yedek al"));
  const sharing = require("expo-sharing");
  await waitFor(() => expect(sharing.shareAsync).toHaveBeenCalled());
  const fs = (global as unknown as { __fs: Map<string, string> }).__fs;
  const written = fs.get(`file:///cache/${backupFileName()}`) ?? "";
  expect(written).not.toMatch(/sk-ant-eski/);
});

// --- yedekten dönme (yıkıcı yol) --------------------------------------------

function backupWith(vocabJson: string, name = "Mehmet") {
  return serializeBackup(
    buildBackup(
      [
        ["vocab.v1", vocabJson],
        ["profile.v1", JSON.stringify({ name, apiKey: "sk-ant-baskasi" })],
      ],
      "test"
    )
  );
}

test("geri yükleme ÖNCE ne olacağını söyler ve onay ister", async () => {
  await saveVocab([card()]);
  placePickedFile(backupWith(JSON.stringify([card({ id: "y1", turkish: "kapı" })])));
  await open();
  fireEvent.press(screen.getByText("Yedekten dön"));

  await waitFor(() => expect(lastAlert()?.title).toMatch(/Yedekten dön/));
  expect(lastAlert()?.body).toMatch(/HER ŞEY silinip/);
  expect(lastAlert()?.body).toMatch(/1 kelime/); // neyin geleceği sayıyla
  expect(restored).toBe(0); // henüz hiçbir şey yapılmadı
});

test("VAZGEÇİLİRSE depo değişmez — aylarca birikim tek dokunuşla gitmez", async () => {
  await saveVocab([card({ turkish: "ev" })]);
  placePickedFile(backupWith(JSON.stringify([card({ id: "y1", turkish: "kapı" })])));
  await open();
  fireEvent.press(screen.getByText("Yedekten dön"));
  await waitFor(() => expect(lastAlert()?.title).toMatch(/Yedekten dön/));

  pressAlert(/Vazgeç/);
  await act(async () => {});
  const cards = await loadVocab();
  expect(cards).toHaveLength(1);
  expect(cards[0].turkish).toBe("ev"); // hâlâ cihazdaki
  expect(restored).toBe(0);
});

test("ONAYLANIRSA depo yedektekiyle değişir ve uygulama yeniden yüklenir", async () => {
  await saveVocab([card({ turkish: "ev" })]);
  placePickedFile(backupWith(JSON.stringify([card({ id: "y1", turkish: "kapı" })])));
  await open();
  fireEvent.press(screen.getByText("Yedekten dön"));
  await waitFor(() => expect(lastAlert()?.title).toMatch(/Yedekten dön/));

  pressAlert(/Evet, geri yükle/);
  await waitFor(() => expect(restored).toBe(1));
  const cards = await loadVocab();
  expect(cards).toHaveLength(1);
  expect(cards[0].turkish).toBe("kapı"); // yedekten gelen
});

test("BOZUK dosya okunmaz ve depoya dokunulmaz", async () => {
  await saveVocab([card({ turkish: "ev" })]);
  placePickedFile("{ bu json değil");
  await open();
  fireEvent.press(screen.getByText("Yedekten dön"));

  await waitFor(() => expect(lastAlert()?.title).toMatch(/Yedek okunamadı/));
  expect((await loadVocab())[0].turkish).toBe("ev");
  expect(restored).toBe(0);
});

test("dosya seçimi İPTAL edilirse hiçbir uyarı çıkmaz, ekran kilitlenmez", async () => {
  await open();
  fireEvent.press(screen.getByText("Yedekten dön"));
  await waitFor(() => expect(screen.getByText("Yedekten dön")).toBeTruthy());
  expect(alerts).toHaveLength(0);
});

// --- hocanın sesi -----------------------------------------------------------

test("ses tercihi KAYDEDİLİR", async () => {
  await open();
  fireEvent.press(screen.getByText("OpenAI"));
  fireEvent.press(screen.getByText(/Nova ·/));
  fireEvent.press(screen.getByText(/Senin sesini de ses modeli çözsün/)); // varsayılan açık → kapat
  fireEvent.press(screen.getByText(/Aktif · Anthropic/)); // odanın beyni: aktif sağlayıcı
  fireEvent.press(screen.getByText("Kaydet"));
  await waitFor(() => expect(saved).toHaveLength(1));
  expect(saved[0].voice).toEqual({ provider: "openai", voiceId: "nova", transcribe: false, brain: "active" });
});

test("Gemini anahtarı yokken ses modeli için NE OLACAĞI söylenir, sınama kapalı", async () => {
  // Sessizce telefon sesine düşmek, kullanıcıyı "neden hâlâ robot" diye
  // bırakırdı. (Gemini sesi varsayılan; seçmeye gerek yok.)
  await open();
  expect(screen.getByText(/Gemini anahtarı gerekir/)).toBeTruthy();
  expect(screen.getByText(/Anahtar girilene kadar telefon sesi/)).toBeTruthy();
  const tryBtn = screen.getByText(/Sesi dene/);
  fireEvent.press(tryBtn); // devre dışı: hiçbir şey olmamalı
  await act(async () => {});
  expect(alerts.some((a) => /Ses denenemedi/.test(a.title ?? ""))).toBe(false);
});

test("telefon sesi seçilince ses modeli ayarları GÖRÜNMEZ", async () => {
  await open();
  fireEvent.press(screen.getByText(/Telefon sesi/));
  expect(screen.queryByText(/Sesi dene/)).toBeNull();
  expect(screen.queryByText(/Kore ·/)).toBeNull();
});

test("varsayılan ses GEMİNİ — ücretsiz kota; ses listesi Gemini sesleri", async () => {
  await open();
  expect(screen.getByText(/Kore ·/)).toBeTruthy();
  expect(screen.queryByText(/Nova ·/)).toBeNull();
  expect(screen.getByText(/ücretsiz kotasında ses için ödeme yok/)).toBeTruthy();
});

test("sağlayıcı değişince ses listesi ve varsayılan ses DEĞİŞİR", async () => {
  // Gemini'de "Kore", OpenAI'da "ash"; eski sesin adı öbür sağlayıcıya sızmasın.
  await open();
  fireEvent.press(screen.getByText("OpenAI"));
  expect(screen.getByText(/Nova ·/)).toBeTruthy();
  expect(screen.queryByText(/Kore ·/)).toBeNull();
  fireEvent.press(screen.getByText("Kaydet"));
  await waitFor(() => expect(saved).toHaveLength(1));
  expect(saved[0].voice?.voiceId).toBe("ash");
});

test("DeepSeek anahtarı yokken oda beyninin ne olacağı söylenir", async () => {
  await open();
  expect(screen.getByText(/DeepSeek anahtarı yok — oda şimdilik/)).toBeTruthy();
});
