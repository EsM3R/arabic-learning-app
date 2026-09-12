/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Ekran testleri için cihaz modülü taklitleri.
 *
 * Gerçek Expo modülleri node altında yüklenemez (yerel kod isterler). Her
 * taklit, ekranın o modülden BEKLEDİĞİ sözleşmeyi karşılar; davranışı test
 * içinden sürülebilsin diye kancalar dışarı açılır.
 */

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

/**
 * Expo'nun akış destekli fetch'i node altında yüklenemez (yerel Response
 * sınıfını genişletir). Testlerde ağa çıkan bir yol yok; sağlayıcı modülleri
 * yalnızca IMPORT edilebilsin diye taklit ediliyor.
 */
jest.mock("expo/fetch", () => ({
  fetch: jest.fn(async () => {
    throw new Error("Testte ağ çağrısı yapılmamalı");
  }),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));

jest.mock("expo-speech", () => ({
  speak: jest.fn(),
  stop: jest.fn(),
  getAvailableVoicesAsync: jest.fn(async () => []),
}));

/**
 * Bellek içi dosya sistemi. Yedek alma/geri yükleme YAZIP OKUMA çevrimidir:
 * sahte bir File yalnız "çökmedi" der, yazılanın geri okunabildiğini söylemez.
 * __fs testten sürülür (dosya yerleştirmek, yazılanı denetlemek için).
 */
const fsFiles = new Map();
global.__fs = fsFiles;
jest.mock("expo-file-system", () => {
  const join = (base, name) => `${String(base).replace(/\/$/, "")}/${name}`;
  class MockFile {
    constructor(base, name) {
      this.uri = name === undefined ? String(base) : join(base, name);
    }
    get exists() {
      return global.__fs.has(this.uri);
    }
    create() {
      if (!global.__fs.has(this.uri)) global.__fs.set(this.uri, "");
    }
    write(text) {
      global.__fs.set(this.uri, String(text));
    }
    text() {
      const v = global.__fs.get(this.uri);
      if (v === undefined) throw new Error(`Dosya yok: ${this.uri}`);
      return Promise.resolve(v);
    }
    delete() {
      global.__fs.delete(this.uri);
    }
  }
  return {
    Paths: { document: "file:///doc", cache: "file:///cache" },
    File: MockFile,
    Directory: class {
      constructor(base, name) {
        this.uri = name === undefined ? String(base) : join(base, name);
        this.exists = true;
      }
      create() {}
      list() {
        return [...global.__fs.keys()]
          .filter((u) => u.startsWith(`${this.uri}/`))
          .map((u) => new MockFile(u));
      }
    },
  };
});

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {}),
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

/**
 * Ses kaydı: gerçek mikrofon yok. Kaydedici durumu __recorder üzerinden
 * sürülebilir ki "izin verilmedi" gibi yollar da test edilebilsin.
 */
const recorderState = { isRecording: false, uri: null, permission: true, prepared: 0, played: [] };
global.__recorder = recorderState;
jest.mock("expo-audio", () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  requestRecordingPermissionsAsync: jest.fn(async () => ({
    granted: global.__recorder.permission,
  })),
  setAudioModeAsync: jest.fn(async () => {}),
  useAudioRecorder: () => ({
    get isRecording() {
      return global.__recorder.isRecording;
    },
    get uri() {
      return global.__recorder.uri;
    },
    prepareToRecordAsync: async () => {
      global.__recorder.prepared += 1;
    },
    record: () => {
      global.__recorder.isRecording = true;
    },
    stop: async () => {
      global.__recorder.isRecording = false;
      global.__recorder.uri = "file:///rec.m4a";
    },
  }),
  useAudioPlayer: () => ({
    replace: (src) => global.__recorder.played.push(src),
    play: jest.fn(),
  }),
}));

jest.mock("expo-linear-gradient", () => {
  const { View } = require("react-native");
  return { LinearGradient: View };
});

jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: jest.fn(async () => "id"),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  setNotificationHandler: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
  setNotificationChannelAsync: jest.fn(async () => {}),
}));

/**
 * Mikrofon kancası: test onu SÜRER. __dictation üzerinden son seçenekleri ve
 * durum değiştiricileri açıyoruz ki "öğrenci şunu söyledi" senaryosu
 * kurulabilsin.
 */
const dictationState = { opts: null, started: 0, stopped: 0 };
global.__dictation = dictationState;
jest.mock("./src/useDictation", () => ({
  useDictation: (opts) => {
    global.__dictation.opts = opts;
    return {
      listening: false,
      partial: "",
      error: null,
      start: () => {
        global.__dictation.started += 1;
      },
      stop: () => {
        global.__dictation.stopped += 1;
      },
    };
  },
}));
