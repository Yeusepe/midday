import { anthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";

export type AIProvider = "openai" | "google" | "anthropic";
export type AIModelPurpose = "default" | "small" | "nano";
export type AIEmbeddingProvider = "openai" | "google";

const DEFAULT_PROVIDER: AIProvider = "openai";

const LANGUAGE_MODELS: Record<AIProvider, Record<AIModelPurpose, string>> = {
  openai: {
    default: "gpt-4.1-mini",
    small: "gpt-4o-mini",
    nano: "gpt-5-nano",
  },
  google: {
    default: "gemini-2.5-flash",
    small: "gemini-2.5-flash-lite",
    nano: "gemini-2.5-flash-lite",
  },
  anthropic: {
    default: "claude-sonnet-4-5",
    small: "claude-3-5-haiku-latest",
    nano: "claude-3-5-haiku-latest",
  },
};

const EMBEDDING_MODELS: Record<AIEmbeddingProvider, string> = {
  openai: "text-embedding-3-small",
  google: "gemini-embedding-001",
};

const google = createGoogleGenerativeAI({
  apiKey:
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY,
});

function parseProvider(value: string | undefined): AIProvider {
  if (value === "google" || value === "anthropic" || value === "openai") {
    return value;
  }

  return DEFAULT_PROVIDER;
}

function parseEmbeddingProvider(
  value: string | undefined,
): AIEmbeddingProvider | null {
  if (value === "google" || value === "openai") {
    return value;
  }

  return null;
}

export function getAIProvider(): AIProvider {
  return parseProvider(process.env.MIDDAY_AI_PROVIDER);
}

export function getAIModelName(
  purpose: AIModelPurpose = "default",
  modelOverride?: string,
): string {
  if (modelOverride) {
    return modelOverride;
  }

  const provider = getAIProvider();
  const envModel =
    purpose === "small"
      ? process.env.MIDDAY_AI_SMALL_MODEL
      : purpose === "nano"
        ? process.env.MIDDAY_AI_NANO_MODEL
        : process.env.MIDDAY_AI_MODEL;

  return envModel ?? LANGUAGE_MODELS[provider][purpose];
}

export function getLanguageModel(
  purpose: AIModelPurpose = "default",
  modelOverride?: string,
) {
  const provider = getAIProvider();
  const model = getAIModelName(purpose, modelOverride);

  switch (provider) {
    case "google":
      return google(model);
    case "anthropic":
      return anthropic(model);
    case "openai":
      return openai(model);
  }
}

export function getEmbeddingProvider(): AIEmbeddingProvider {
  const explicit = parseEmbeddingProvider(
    process.env.MIDDAY_AI_EMBEDDING_PROVIDER,
  );

  if (explicit) {
    return explicit;
  }

  const languageProvider = getAIProvider();
  return languageProvider === "google" ? "google" : "openai";
}

export function getEmbeddingModelName(modelOverride?: string): string {
  const provider = getEmbeddingProvider();
  return (
    modelOverride ??
    process.env.MIDDAY_AI_EMBEDDING_MODEL ??
    EMBEDDING_MODELS[provider]
  );
}

export function getEmbeddingModel(modelOverride?: string) {
  const provider = getEmbeddingProvider();
  const model = getEmbeddingModelName(modelOverride);

  switch (provider) {
    case "google":
      return google.embeddingModel(model);
    case "openai":
      return openai.embeddingModel(model);
  }
}

export function getToolIndexCacheName(): string {
  return `.toolpick-cache-${getEmbeddingProvider()}-${getEmbeddingModelName().replace(
    /[^a-zA-Z0-9._-]/g,
    "_",
  )}.json`;
}

export function getWebSearchTools(options: {
  countryCode?: string | null;
  timezone?: string | null;
}): Record<string, unknown> {
  const provider = getAIProvider();

  if (provider === "openai") {
    return {
      web_search: openai.tools.webSearch({
        searchContextSize: "medium",
        userLocation: {
          type: "approximate",
          country: options.countryCode ?? undefined,
          timezone: options.timezone ?? undefined,
        },
      }),
    };
  }

  if (provider === "google") {
    return {
      google_search: google.tools.googleSearch({}),
    };
  }

  return {};
}
