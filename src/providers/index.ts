import { Profile } from "../types";
import { anthropicProvider } from "./anthropic";
import { deepseekProvider } from "./deepseek";
import { geminiProvider } from "./gemini";
import { openaiProvider } from "./openai";
import { Provider, ProviderId } from "./types";

export * from "./types";

export const PROVIDERS: Record<ProviderId, Provider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  gemini: geminiProvider,
  deepseek: deepseekProvider,
};

/** Ekranlarda listelemek için — sıralama kaliteden ucuzluğa doğru. */
export const PROVIDER_LIST: Provider[] = [
  anthropicProvider,
  openaiProvider,
  geminiProvider,
  deepseekProvider,
];

export function isProviderId(v: unknown): v is ProviderId {
  return v === "anthropic" || v === "openai" || v === "gemini" || v === "deepseek";
}

export function providerOf(profile: Profile): Provider {
  const id = profile.provider;
  return isProviderId(id) ? PROVIDERS[id] : anthropicProvider;
}

/** Seçili sağlayıcının anahtarı. Eski profillerde anahtar `apiKey` alanındaydı. */
export function keyFor(profile: Profile, id: ProviderId): string {
  const stored = profile.apiKeys?.[id];
  if (stored) return stored;
  return id === "anthropic" ? profile.apiKey ?? "" : "";
}

export function modelFor(profile: Profile, id: ProviderId): string {
  return profile.models?.[id] || PROVIDERS[id].meta.defaultModel;
}

export interface ActiveSetup {
  provider: Provider;
  model: string;
  apiKey: string;
}

/** Turu hangi sağlayıcı, hangi model ve hangi anahtarla atacağımızı çözer. */
export function activeSetup(profile: Profile): ActiveSetup {
  const provider = providerOf(profile);
  const id = provider.meta.id;
  return {
    provider,
    model: modelFor(profile, id),
    apiKey: keyFor(profile, id),
  };
}

/** Seçili sağlayıcının anahtarı girilmiş mi. */
export function hasKey(profile: Profile): boolean {
  return activeSetup(profile).apiKey.trim().length > 0;
}
