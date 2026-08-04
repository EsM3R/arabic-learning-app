import Anthropic from "@anthropic-ai/sdk";
import { newCard } from "./srs";
import {
  loadMistakes,
  loadNotes,
  loadVocab,
  saveMistakes,
  saveNotes,
  saveVocab,
} from "./storage";
import { CurriculumModule, Profile, Track } from "./types";

/** Agentic tur boyunca taşınan bağlam. Profil değişiklikleri burada birikir. */
export interface AgentContext {
  profile: Profile;
  profileChanged: boolean;
  currentModuleId?: string;
}

export interface ToolOutcome {
  /** Modele geri dönen sonuç metni. */
  result: string;
  /** UI'da rozet olarak gösterilecek Türkçe özet (yoksa gösterilmez). */
  summary?: string;
}

const LEVELS = ["A0", "A1", "A2", "B1", "B2", "C1", "C2"];

/** Üstaz'ın kendi kararıyla kullanabildiği araçlar. */
export const TEACHER_TOOLS: Anthropic.Tool[] = [
  {
    name: "kelime_kaydet",
    description:
      "Öğrencinin kelime defterine (aralıklı tekrar sistemi) yeni bir kelime veya kalıp ekler. Öğrencinin bilmediği ya da yeni öğrendiği her önemli kelime/kalıp için proaktif olarak çağır. Aynı kelimeyi ikinci kez ekleme.",
    input_schema: {
      type: "object",
      properties: {
        arabic: { type: "string", description: "Kelime/kalıp, Arap harfleriyle" },
        transliteration: { type: "string", description: "Latin transkripsiyon" },
        turkish: { type: "string", description: "Türkçe anlamı" },
        track: {
          type: "string",
          enum: ["konusma", "okuma"],
          description: "konusma = ammice, okuma = fusha",
        },
        note: {
          type: "string",
          description: "İsteğe bağlı kısa kullanım notu veya örnek cümle",
        },
      },
      required: ["arabic", "transliteration", "turkish", "track"],
    },
  },
  {
    name: "hata_kaydet",
    description:
      "Öğrencinin yaptığı anlamlı bir dil hatasını hata defterine kaydeder. Tekrarlanan veya öğretici hatalar için çağır; sonraki dersler bu deftere göre şekillenir. Yazım gibi önemsiz tek seferlik hataları kaydetme.",
    input_schema: {
      type: "object",
      properties: {
        mistake: { type: "string", description: "Öğrencinin yanlış söylediği/yazdığı hâli" },
        correction: { type: "string", description: "Doğru hâli (Arap harfleri + transkripsiyon)" },
        explanation: { type: "string", description: "Kısa Türkçe açıklama: neden yanlış" },
        topic: { type: "string", description: "İlgili gramer/kelime konusu, örn. 'geçmiş zaman'" },
      },
      required: ["mistake", "correction", "explanation", "topic"],
    },
  },
  {
    name: "not_yaz",
    description:
      "Kendine (öğretmene) sonraki dersler için hafıza notu yazar. Ders sonlarında veya önemli bir gözlemde çağır: öğrencinin nerede kaldığı, neyi sevdiği, sıradaki adım. Notlar sonraki derslerin başında sana geri verilir.",
    input_schema: {
      type: "object",
      properties: {
        note: { type: "string", description: "Kısa ve öz Türkçe not" },
      },
      required: ["note"],
    },
  },
  {
    name: "seviye_guncelle",
    description:
      "Öğrencinin resmi seviyesini günceller. Sohbet ve derslerdeki performansına bakarak seviyenin değiştiğine ikna olduğunda çağır — sınav gerekmez. En az bir seviye alanı ver.",
    input_schema: {
      type: "object",
      properties: {
        speakingLevel: {
          type: "string",
          enum: LEVELS,
          description: "Yeni konuşma (ammice) seviyesi",
        },
        readingLevel: {
          type: "string",
          enum: LEVELS,
          description: "Yeni okuma (fusha) seviyesi",
        },
        reason: { type: "string", description: "Güncelleme gerekçesi (Türkçe)" },
      },
      required: ["reason"],
    },
  },
  {
    name: "modul_ekle",
    description:
      "Müfredata yeni bir modül ekler. Öğrencinin ihtiyaç duyduğu ama müfredatta olmayan bir konu fark ettiğinde çağır (örn. sürekli zorlandığı bir gramer konusu).",
    input_schema: {
      type: "object",
      properties: {
        track: { type: "string", enum: ["konusma", "okuma"] },
        title: { type: "string", description: "Türkçe modül başlığı" },
        description: { type: "string", description: "Türkçe kısa açıklama" },
        level: { type: "string", enum: LEVELS },
        objectives: {
          type: "array",
          items: { type: "string" },
          description: "3-5 somut öğrenme hedefi (Türkçe)",
        },
      },
      required: ["track", "title", "description", "level", "objectives"],
    },
  },
  {
    name: "modul_tamamla",
    description:
      "Bir müfredat modülünü tamamlandı olarak işaretler. Öğrenci dersin hedeflerine gerçekten ulaştığında çağır — erken kapatma, ama hak edince de bekletme.",
    input_schema: {
      type: "object",
      properties: {
        moduleId: { type: "string", description: "Tamamlanan modülün id'si, örn. 'k2'" },
      },
      required: ["moduleId"],
    },
  },
];

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: AgentContext
): Promise<ToolOutcome> {
  switch (name) {
    case "kelime_kaydet": {
      const arabic = String(input.arabic ?? "").trim();
      if (!arabic) return { result: "Hata: arabic alanı boş." };
      const cards = await loadVocab();
      if (cards.some((c) => c.arabic === arabic)) {
        return { result: `"${arabic}" zaten kelime defterinde kayıtlı.` };
      }
      const card = newCard(
        arabic,
        String(input.transliteration ?? ""),
        String(input.turkish ?? ""),
        (input.track === "okuma" ? "okuma" : "konusma") as Track,
        input.note ? String(input.note) : undefined
      );
      await saveVocab([...cards, card]);
      return {
        result: `Kelime kaydedildi: ${arabic}. Defterde toplam ${cards.length + 1} kelime var.`,
        summary: `📇 Kelime eklendi: ${arabic} (${card.turkish})`,
      };
    }

    case "hata_kaydet": {
      const entries = await loadMistakes();
      const entry = {
        id: `m${Date.now()}${Math.floor(Math.random() * 1000)}`,
        mistake: String(input.mistake ?? ""),
        correction: String(input.correction ?? ""),
        explanation: String(input.explanation ?? ""),
        topic: String(input.topic ?? ""),
        createdAt: new Date().toISOString(),
      };
      await saveMistakes([...entries, entry]);
      return {
        result: `Hata deftere kaydedildi (konu: ${entry.topic}).`,
        summary: `📒 Hata deftere işlendi: ${entry.topic}`,
      };
    }

    case "not_yaz": {
      const notes = await loadNotes();
      const note = {
        id: `n${Date.now()}${Math.floor(Math.random() * 1000)}`,
        note: String(input.note ?? ""),
        createdAt: new Date().toISOString(),
      };
      await saveNotes([...notes, note]);
      return { result: "Not kaydedildi.", summary: "🗒️ Üstaz kendine not aldı" };
    }

    case "seviye_guncelle": {
      const a = ctx.profile.assessment;
      if (!a) return { result: "Hata: henüz seviye değerlendirmesi yok." };
      const speaking = input.speakingLevel ? String(input.speakingLevel) : undefined;
      const reading = input.readingLevel ? String(input.readingLevel) : undefined;
      if (!speaking && !reading) {
        return { result: "Hata: speakingLevel veya readingLevel alanlarından en az biri gerekli." };
      }
      ctx.profile = {
        ...ctx.profile,
        assessment: {
          ...a,
          speakingLevel: speaking ?? a.speakingLevel,
          readingLevel: reading ?? a.readingLevel,
        },
      };
      ctx.profileChanged = true;
      const parts = [
        speaking ? `konuşma → ${speaking}` : null,
        reading ? `okuma → ${reading}` : null,
      ].filter(Boolean);
      return {
        result: `Seviye güncellendi: ${parts.join(", ")}.`,
        summary: `📈 Seviye güncellendi: ${parts.join(", ")}`,
      };
    }

    case "modul_ekle": {
      const curriculum = ctx.profile.curriculum;
      if (!curriculum) return { result: "Hata: henüz müfredat yok." };
      const track = (input.track === "okuma" ? "okuma" : "konusma") as Track;
      const prefix = track === "konusma" ? "k" : "o";
      const existing = curriculum.modules.filter((m) => m.track === track).length;
      const module: CurriculumModule = {
        id: `${prefix}x${existing + 1}-${Date.now() % 10000}`,
        track,
        title: String(input.title ?? ""),
        description: String(input.description ?? ""),
        level: String(input.level ?? "A1"),
        objectives: Array.isArray(input.objectives) ? input.objectives.map(String) : [],
      };
      ctx.profile = {
        ...ctx.profile,
        curriculum: { ...curriculum, modules: [...curriculum.modules, module] },
      };
      ctx.profileChanged = true;
      return {
        result: `Modül eklendi: "${module.title}" (id: ${module.id}).`,
        summary: `🗺️ Müfredata modül eklendi: ${module.title}`,
      };
    }

    case "modul_tamamla": {
      const moduleId = String(input.moduleId ?? ctx.currentModuleId ?? "");
      const module = ctx.profile.curriculum?.modules.find((m) => m.id === moduleId);
      if (!module) return { result: `Hata: '${moduleId}' id'li modül bulunamadı.` };
      if (ctx.profile.completedModuleIds.includes(moduleId)) {
        return { result: `Modül '${moduleId}' zaten tamamlanmış.` };
      }
      ctx.profile = {
        ...ctx.profile,
        completedModuleIds: [...ctx.profile.completedModuleIds, moduleId],
      };
      ctx.profileChanged = true;
      return {
        result: `Modül tamamlandı olarak işaretlendi: "${module.title}".`,
        summary: `✅ Modül tamamlandı: ${module.title}`,
      };
    }

    default:
      return { result: `Hata: bilinmeyen araç '${name}'.` };
  }
}
