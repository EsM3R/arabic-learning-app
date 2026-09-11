// Tip-yalnız importlar: node --experimental-strip-types bunları siler, böylece
// önbellek yerleşimi SDK yüklemeden test edilebilir (tests/caching.test.ts).
// Bu dosya maliyeti belirliyor — işaret yanlış yere konursa fatura sessizce
// katlanır ve kimse fark etmez.
import type Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage } from "./types.ts";

/**
 * Önbellek düzeni — saf (React Native bağımlılığı yok) olduğu için test edilebilir.
 *
 * Anthropic önbelleği ÖN-EK eşleşmesiyle çalışır: işaretten önceki içerik bayt
 * bayt aynıysa %10 fiyata okunur, tek bayt değişirse sonrasının tamamı düşer.
 *
 * Düzen:
 *   araçlar → sistem(sabit) → [ ...kalıcı geçmiş... ][işaret][ güncel mesaj + değişken hafıza ]
 *
 * Kalıcı geçmiş turdan tura yalnızca SONUNA eklenerek büyür; bu yüzden önceki
 * turda önbelleğe yazılan ön-ek sonraki turda aynen eşleşir. Değişken hafıza
 * (hata defteri + tekrar durumu) her turda değiştiğinden işaretin ARKASINA konur.
 */
export function buildMessages(
  messages: ChatMessage[],
  dynamic?: string
): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const last = out.length - 1;
  if (last < 0) return out;

  // Geçmişin sonuna önbellek işareti. İlk turda geçmiş yoktur, atlanır.
  if (last >= 1) {
    const prev = out[last - 1];
    out[last - 1] = {
      role: prev.role,
      content: [
        {
          type: "text",
          text: String(prev.content),
          cache_control: { type: "ephemeral" },
        },
      ],
    };
  }

  if (dynamic && dynamic.trim()) {
    const cur = out[last];
    out[last] = {
      role: cur.role,
      content: `${String(cur.content)}\n\n[Aşağısı uygulamanın sana ilettiği güncel durum bilgisidir; öğrenci bu kısmı görmüyor.]${dynamic}`,
    };
  }
  return out;
}

/** Sistem bloğu yalnızca sabit kısmı taşır; değişken kısım mesajların sonuna gider. */
export function systemBlocks(stable: string): Anthropic.TextBlockParam[] {
  return [{ type: "text", text: stable, cache_control: { type: "ephemeral" } }];
}

/** Araç listesinin son elemanına önbellek işareti koyar (araçlar sabittir). */
export function cachedTools(tools: Anthropic.Tool[]): Anthropic.Tool[] {
  return tools.map((t, i) =>
    i === tools.length - 1 ? { ...t, cache_control: { type: "ephemeral" as const } } : t
  );
}

/**
 * Bir isteğin önbelleklenen ön-ekini düz metne çevirir. Yalnızca testlerde
 * kullanılır: iki ardışık turun ön-eklerinin gerçekten eşleştiğini doğrular.
 */
export function cachedPrefix(messages: Anthropic.MessageParam[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    if (typeof m.content === "string") {
      parts.push(`${m.role}:${m.content}`);
      continue;
    }
    for (const block of m.content) {
      if (block.type !== "text") continue;
      parts.push(`${m.role}:${block.text}`);
      if ("cache_control" in block && block.cache_control) return parts.join("\n");
    }
  }
  return ""; // işaret yoksa önbelleklenen ön-ek yok
}
