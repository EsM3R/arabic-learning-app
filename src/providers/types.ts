import { ChatMessage } from "../types";

export type ProviderId = "anthropic" | "openai" | "gemini" | "deepseek";

/** Düşünme derinliği — her sağlayıcı kendi karşılığına çevirir. */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Araç tanımı. Anthropic'in şekliyle aynı tutuldu (agent.ts onu üretiyor);
 * diğer sağlayıcılar bunu kendi biçimlerine çeviriyor. Üçü de parametreler
 * için JSON Schema kullandığı için çeviri kayıpsız.
 */
export interface ToolSpec {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export interface ToolOutcome {
  result: string;
  summary?: string;
}

/**
 * Canlı akış kancaları. Algılanan hızın asıl kaynağı bunlar: cevabın bitmesi
 * beklenmez, üretildikçe ekrana akar. Hepsi isteğe bağlıdır — vermeyen çağıran
 * (ör. panel arka plan kontrolü) eski davranışı aynen alır.
 */
export interface StreamHooks {
  /** Cevap metninin yeni parçası (kümülatif değil, delta). */
  onText?: (delta: string) => void;
  /** Model düşünmeye başladı/düşünüyor — UI "düşünüyor…" gösterebilir. */
  onThinking?: () => void;
  /** Model bir aracı çağırıyor; UI "defterine bakıyor…" gibi durum gösterebilir. */
  onTool?: (name: string) => void;
  /** Yeni model turu başladı (araç sonrası devam) — UI ayraç koyabilir. */
  onRound?: (round: number) => void;
}

export interface AgenticRequest extends StreamHooks {
  /** Sabit sistem promptu — önbelleklenir. */
  stable: string;
  /** Her turda değişen hafıza; önbellek işaretinin arkasına konur. */
  dynamic?: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
  maxRounds: number;
  effort: Effort;
  model: string;
  apiKey: string;
  /** Araç çağrısını çalıştırır (agent.ts'teki executeTool'a bağlanır). */
  runTool: (name: string, input: Record<string, unknown>) => Promise<ToolOutcome>;
}

export interface AgenticReply {
  text: string;
  /** UI'da rozet olarak gösterilecek eylem özetleri. */
  actions: string[];
}

export interface StructuredRequest {
  system: string;
  userMessage: string;
  /** JSON Schema — üç sağlayıcı da destekliyor. */
  schema: Record<string, unknown>;
  model: string;
  apiKey: string;
}

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  /** Anahtarın nereden alınacağı (kurulum ekranında gösterilir). */
  keyHint: string;
  /** Anahtar bu ön ekle başlamalı; boşsa doğrulama yapılmaz. */
  keyPrefix: string;
  defaultModel: string;
  /** Önerilen modeller — kullanıcı elle de yazabilir. */
  models: string[];
  /** Kabaca ders başına maliyet notu (kullanıcıya gösterilir). */
  costNote: string;
  /** Anthropic dışındakiler canlı API'ye karşı denenmedi. */
  experimental: boolean;
}

export interface Provider {
  meta: ProviderMeta;
  chat(req: AgenticRequest): Promise<AgenticReply>;
  structured<T>(req: StructuredRequest): Promise<T>;
}

/** Bütçe dolduğunda modele iletilen toparlama uyarısı. */
export function wrapUpNotice(remaining: number): string {
  return `[Sistem: bu tur için ${remaining} araç turun kaldı. Kalan araç çağrılarını en gerekliyle sınırla ve öğrenciye dönük cevabını şimdi yaz.]`;
}

/** Bütçe tükenince turu çöpe atmamak için kullanılan yedek metin. */
export const BUDGET_EXHAUSTED_TEXT =
  "Bu turda çok fazla işlem yaptım ve cevabımı yetiştiremedim. Kaldığımız yerden devam edelim — tekrar yazar mısın?";

export const REFUSAL_TEXT =
  "Model bu isteği güvenlik nedeniyle yanıtlamadı. Lütfen mesajı değiştirip tekrar deneyin.";

export const EMPTY_TEXT = "Modelden boş yanıt geldi, lütfen tekrar deneyin.";

/**
 * Değişken hafızayı güncel kullanıcı mesajının sonuna ekler. Önbellek
 * ön-ekinin arkasında kalması için bu şart (bkz. src/caching.ts).
 */
export function withDynamic(content: string, dynamic?: string): string {
  if (!dynamic || !dynamic.trim()) return content;
  return `${content}\n\n[Aşağısı uygulamanın sana ilettiği güncel durum bilgisidir; öğrenci bu kısmı görmüyor.]${dynamic}`;
}
