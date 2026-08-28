/**
 * Chat Completions akışında araç çağrısı parçalarının birleştirilmesi —
 * SAF modül (React/RN importu YOK; tests/toolstream.test.ts ile test edilir).
 *
 * Akışta tool_calls tek parça gelmez: her chunk'ta index'li bir delta gelir;
 * id ve name genelde ilk parçada, arguments ise karakter karakter dağılmış
 * olarak. Bu birleştirici DeepSeek (OpenAI-uyumlu) akışı için kullanılır.
 */

export interface ToolCallDraft {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolCallDelta {
  index: number;
  id?: string | null;
  function?: { name?: string | null; arguments?: string | null } | null;
}

/** Delta'yı taslak listesine işler (yerinde). Bilinmeyen index boşluklarını doldurur. */
export function mergeToolCallDelta(drafts: ToolCallDraft[], delta: ToolCallDelta): void {
  const i = delta.index;
  if (!Number.isInteger(i) || i < 0) return;
  while (drafts.length <= i) drafts.push({ id: "", name: "", arguments: "" });
  const d = drafts[i];
  if (delta.id) d.id = delta.id;
  if (delta.function?.name) d.name += delta.function.name;
  if (delta.function?.arguments) d.arguments += delta.function.arguments;
}

/** Ad ve id'si oluşmuş, çalıştırılabilir taslaklar. */
export function completedToolCalls(drafts: ToolCallDraft[]): ToolCallDraft[] {
  return drafts.filter((d) => d.name.length > 0 && d.id.length > 0);
}
