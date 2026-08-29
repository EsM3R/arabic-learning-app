/**
 * Yapılandırılmış üretim (müfredat, okuma metni, telaffuz seti) cevaplarının
 * güvenli ayrıştırılması — SAF modül (React/RN importu YOK;
 * tests/structparse.test.ts ile test edilir).
 *
 * Şema zorlaması sağlayıcıya göre değişir: Anthropic/OpenAI/Gemini şemayı
 * sunucuda uygular, DeepSeek yalnız "geçerli JSON" garantisi verir. Bu modül
 * en kötü durumu varsayar: çitli (```json) metin, bozuk JSON, eksik alan.
 */
import type { CurriculumModule } from "./types";

/** ```json ... ``` çitlerini soyar; çit yoksa metni aynen döndürür. */
export function stripJsonFences(text: string): string {
  const t = text.trim();
  const m = t.match(/^```[a-zA-Z]*\s*\n?([\s\S]*?)\n?\s*```$/);
  return m ? m[1].trim() : t;
}

/**
 * Model cevabını JSON olarak ayrıştırır; bozuksa kullanıcıya ne olduğunu
 * söyleyen Türkçe bir hata fırlatır (çıplak "Unexpected token" yerine).
 */
export function parseStructuredJson<T>(text: string): T {
  const t = stripJsonFences(text);
  try {
    return JSON.parse(t) as T;
  } catch {
    const head = t.slice(0, 80).replace(/\s+/g, " ");
    throw new Error(
      `Model geçerli JSON döndürmedi (başı: "${head}…"). Tekrar denemek genelde çözer.`
    );
  }
}

/** Modelin yazabileceği parkur adları → uygulamadaki değer. */
function normalizeTrack(v: unknown): "konusma" | "okuma" | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  if (t === "konusma" || t === "konuşma" || t === "speaking") return "konusma";
  if (t === "okuma" || t === "reading") return "okuma";
  return null;
}

/**
 * Müfredat cevabını cihazda toparlar: bozuk/eksik modüller elenir, eksik
 * alanlar makul varsayılanla doldurulur, çakışan id'ler tekilleştirilir.
 * Şema uygulamayan sağlayıcıda (DeepSeek) tek savunma hattı budur.
 */
export function normalizeCurriculumModules(raw: unknown): CurriculumModule[] {
  const r = raw as { modules?: unknown } | null | undefined;
  const list = Array.isArray(r?.modules) ? (r.modules as unknown[]) : [];
  const out: CurriculumModule[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const track = normalizeTrack(m.track);
    const title = typeof m.title === "string" ? m.title.trim() : "";
    if (!track || !title) continue; // parkuru veya başlığı olmayan modül işe yaramaz
    out.push({
      id:
        typeof m.id === "string" && m.id.trim()
          ? m.id.trim()
          : `${track === "konusma" ? "k" : "o"}${out.length + 1}`,
      track,
      title,
      description: typeof m.description === "string" ? m.description : "",
      level: typeof m.level === "string" && m.level.trim() ? m.level.trim() : "A0",
      objectives: Array.isArray(m.objectives)
        ? (m.objectives as unknown[]).filter((o): o is string => typeof o === "string")
        : [],
    });
  }
  const seen = new Set<string>();
  for (const m of out) {
    let id = m.id;
    for (let n = 2; seen.has(id); n++) id = `${m.id}-${n}`;
    m.id = id;
    seen.add(id);
  }
  return out;
}
