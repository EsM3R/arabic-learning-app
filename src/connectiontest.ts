/**
 * Sağlayıcı bağlantı testi — SAF sonuç yorumlama (React/RN importu YOK;
 * tests/connectiontest.test.ts). Çağrının kendisi src/claude.ts'te.
 *
 * NEDEN VAR: uygulamada dört sağlayıcı var ama yalnız ikisi gerçekten
 * denendi; diğer ikisinin kod yolu KÖRDÜ. "DENENMEDİ" rozeti dürüsttü ama
 * çözüm değildi — öğrenci anahtarını girip ders açıyor, hata ancak dersin
 * ortasında, uzun bir bekleyişin sonunda çıkıyordu. Artık Ayarlar'da tek
 * dokunuşla, beş saniyede sınanabiliyor.
 *
 * Burada tutulan şey HATA YORUMU: ham API hatası ("401", "fetch failed")
 * öğrenciye hiçbir şey anlatmaz; ne yapacağını söyleyen Türkçe bir cümleye
 * çevrilir.
 */

export type TestOutcome = "calisiyor" | "anahtar" | "kota" | "model" | "ag" | "bilinmiyor";

export interface TestResult {
  outcome: TestOutcome;
  ok: boolean;
  /** Öğrenciye gösterilecek başlık. */
  title: string;
  /** Ne olduğu ve NE YAPACAĞI. */
  detail: string;
}

/** Sınamada modele sorulan şey — cevabın içeriği önemli değil, ulaşması önemli. */
export const TEST_PROMPT = "Yalnızca 'tamam' yaz.";
/** Sınama çağrısının üst sınırı; uzun beklemek testin amacını bozar. */
export const TEST_TIMEOUT_MS = 20_000;

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

/**
 * Ham hatayı öğrencinin anlayacağı sonuca çevirir.
 *
 * Sınıflandırma HTTP koduna değil metne bakıyor: dört farklı SDK dört farklı
 * biçimde hata veriyor ve hiçbiri ortak bir alan sunmuyor.
 */
export function classifyError(raw: string): TestResult {
  const e = (raw ?? "").toLowerCase();

  if (includesAny(e, ["401", "403", "unauthorized", "invalid api key", "invalid_api_key", "api key not valid", "authentication", "permission_denied"])) {
    return {
      outcome: "anahtar",
      ok: false,
      title: "Anahtar kabul edilmedi",
      detail:
        "Sağlayıcı bu API anahtarını tanımadı. Anahtarı panodan yeniden kopyala (başında/sonunda boşluk kalmasın) ve doğru sağlayıcının anahtarı olduğundan emin ol.",
    };
  }
  if (includesAny(e, ["429", "quota", "rate limit", "rate_limit", "insufficient", "billing", "credit"])) {
    return {
      outcome: "kota",
      ok: false,
      title: "Kota ya da bakiye sorunu",
      detail:
        "Anahtar geçerli ama hesapta kullanılabilir bakiye/kota yok ya da çok sık istek gönderildi. Sağlayıcının panelinden bakiyeni kontrol et, birkaç dakika sonra tekrar dene.",
    };
  }
  if (includesAny(e, ["404", "model not found", "does not exist", "unknown model", "not_found", "unsupported model"])) {
    return {
      outcome: "model",
      ok: false,
      title: "Model adı bulunamadı",
      detail:
        "Anahtar çalışıyor ama seçili model adı bu hesapta yok. Ayarlar'dan başka bir model seç — model adları sağlayıcı tarafından zamanla emekliye ayrılıyor.",
    };
  }
  // Node/RN hata kodları ("ETIMEDOUT") kelime arasında boşluk taşımadığı için
  // hem kod hem düz metin biçimleri aranıyor.
  if (
    includesAny(e, [
      "network",
      "fetch failed",
      "timeout",
      "timed out",
      "etimedout",
      "econn",
      "enotfound",
      "eai_again",
      "socket",
      "offline",
      "unable to resolve host",
    ])
  ) {
    return {
      outcome: "ag",
      ok: false,
      title: "Bağlantı kurulamadı",
      detail:
        "İnternete ya da sağlayıcıya ulaşılamadı. Wi-Fi/veri bağlantını kontrol et; VPN kullanıyorsan kapatıp dene.",
    };
  }
  return {
    outcome: "bilinmiyor",
    ok: false,
    title: "Bilinmeyen hata",
    detail: raw?.trim()
      ? `Sağlayıcı şunu döndürdü: ${raw.trim().slice(0, 300)}`
      : "Sağlayıcı bir açıklama vermeden başarısız oldu.",
  };
}

/** Başarılı sınama sonucu — cevabın kendisi değil, ULAŞMASI kanıttır. */
export function successResult(reply: string, model: string): TestResult {
  const clean = (reply ?? "").trim();
  return {
    outcome: "calisiyor",
    ok: true,
    title: "Bağlantı çalışıyor",
    detail: clean
      ? `${model} cevap verdi: "${clean.slice(0, 80)}"`
      : `${model} bağlandı ama boş cevap döndü — bağlantı kuruldu, modelin bu isteğe verecek sözü olmadı.`,
  };
}

/**
 * Boş anahtar için çağrı YAPILMAZ: sağlayıcıya boş anahtarla gitmek
 * gereksiz bir ağ turu ve anlamsız bir hata mesajı demektir.
 */
export function validateBeforeCall(apiKey: string, keyPrefix?: string): TestResult | null {
  const key = (apiKey ?? "").trim();
  if (!key) {
    return {
      outcome: "anahtar",
      ok: false,
      title: "Anahtar girilmemiş",
      detail: "Bu sağlayıcı için önce API anahtarını gir, sonra sına.",
    };
  }
  if (keyPrefix && !key.startsWith(keyPrefix)) {
    return {
      outcome: "anahtar",
      ok: false,
      title: "Anahtar biçimi tutmuyor",
      detail: `Bu sağlayıcının anahtarları "${keyPrefix}" ile başlar. Yanlış sağlayıcının anahtarını yapıştırmış olabilirsin.`,
    };
  }
  return null;
}
