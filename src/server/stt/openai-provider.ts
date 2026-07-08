import { getServerEnv } from "@/server/env";
import type { SttStream, SttStreamOptions } from "./types";
import { SttProviderError } from "./types";

export class OpenAiSttStream implements SttStream {
  readonly provider = "openai" as const;

  constructor(private readonly options: SttStreamOptions) {}

  start() {
    const env = getServerEnv();
    if (!env.OPENAI_STT_ENABLED) {
      throw new SttProviderError(this.provider, "OPENAI_STT_NOT_CONFIGURED", "OpenAI STT is not configured");
    }

    if (!env.OPENAI_API_KEY) {
      throw new SttProviderError(this.provider, "OPENAI_STT_CREDENTIALS_MISSING", "OpenAI API key is missing");
    }

    throw new SttProviderError(
      this.provider,
      "OPENAI_STT_NOT_IMPLEMENTED",
      `OpenAI STT provider is scaffolded for ${env.OPENAI_STT_MODEL}, but realtime audio STT is not implemented yet`
    );
  }

  send() {
    // Placeholder: OpenAI realtime/audio STT will stream audio here when implemented.
  }

  stop() {
    this.options.onClose();
  }
}
