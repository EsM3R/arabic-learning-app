/**
 * Hoca mesajlarının biçim ayrıştırması — saf, React'siz, test edilebilir.
 * Görsel katman src/components/RichText.tsx.
 */

export const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export type BlockType = "blank" | "heading" | "bullet" | "numbered" | "quote" | "text";

export interface Block {
  type: BlockType;
  /** Görüntülenecek metin (işaretler ayıklanmış). */
  text: string;
  /** numbered için sıra numarası, bullet için "•". */
  marker?: string;
  /** heading için 1-4. */
  level?: number;
}

export function classifyLine(raw: string): Block {
  const line = raw.trimEnd();
  if (!line.trim()) return { type: "blank", text: "" };

  const heading = /^(#{1,4})\s+(.*)$/.exec(line);
  if (heading) {
    return { type: "heading", text: heading[2], level: heading[1].length };
  }

  const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
  if (bullet) return { type: "bullet", text: bullet[1], marker: "•" };

  const numbered = /^\s*(\d{1,2})[.)]\s+(.*)$/.exec(line);
  if (numbered) return { type: "numbered", text: numbered[2], marker: `${numbered[1]}.` };

  const quote = /^\s*>\s+(.*)$/.exec(line);
  if (quote) return { type: "quote", text: quote[1] };

  return { type: "text", text: line };
}

export type InlineKind = "plain" | "bold" | "italic" | "code";

export interface InlineToken {
  kind: InlineKind;
  text: string;
}

/** **kalın**, *eğik* ve `kod` parçalarını ayırır. */
export function splitInline(text: string): InlineToken[] {
  const out: InlineToken[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.push({ kind: "plain", text: text.slice(last, m.index) });
    const token = m[0];
    if (token.startsWith("**")) out.push({ kind: "bold", text: token.slice(2, -2) });
    else if (token.startsWith("`")) out.push({ kind: "code", text: token.slice(1, -1) });
    else out.push({ kind: "italic", text: token.slice(1, -1) });
    last = m.index + token.length;
  }
  if (last < text.length) out.push({ kind: "plain", text: text.slice(last) });
  return out.filter((t) => t.text.length > 0);
}

export interface ScriptRun {
  arabic: boolean;
  text: string;
}

/**
 * Metni Arap harfli / Latin koşulara böler. Arapça, Latin metinle aynı
 * puntoda okunmadığı için görsel katman Arapça koşuları büyütür.
 */
export function splitScript(text: string): ScriptRun[] {
  if (!ARABIC_RE.test(text)) return [{ arabic: false, text }];
  const parts = text.split(
    /([؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿][؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿\s،؛؟ـ]*)/g
  );
  const out: ScriptRun[] = [];
  for (const part of parts) {
    if (!part) continue;
    out.push({ arabic: ARABIC_RE.test(part), text: part });
  }
  return out;
}
