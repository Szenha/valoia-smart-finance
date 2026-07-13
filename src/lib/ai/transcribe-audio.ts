import { createServerFn } from "@tanstack/react-start";

type TranscribeAudioInput = {
  audioBase64: string;
  mimeType: string;
  durationMs?: number;
};

export type TranscriptionResult = {
  text: string;
  model: string;
  duration_seconds: number | null;
  estimated_cost_usd: number | null;
};

const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const TRANSCRIPTION_COST_PER_MINUTE_USD = 0.003;

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType || "audio/webm" });
}

function estimateCost(
  durationMs?: number,
): Pick<TranscriptionResult, "duration_seconds" | "estimated_cost_usd"> {
  if (!durationMs || durationMs <= 0) {
    return { duration_seconds: null, estimated_cost_usd: null };
  }
  const durationSeconds = Math.max(durationMs / 1000, 0);
  return {
    duration_seconds: Number(durationSeconds.toFixed(3)),
    estimated_cost_usd: Number(
      ((durationSeconds / 60) * TRANSCRIPTION_COST_PER_MINUTE_USD).toFixed(6),
    ),
  };
}

export const transcribeAudioFn = createServerFn({ method: "POST" })
  .validator((data: TranscribeAudioInput) => data)
  .handler(async ({ data }): Promise<TranscriptionResult> => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY não configurada.");
    if (!data.audioBase64) throw new Error("Áudio vazio.");

    const model = process.env.OPENAI_TRANSCRIPTION_MODEL ?? DEFAULT_TRANSCRIPTION_MODEL;
    const formData = new FormData();
    const blob = base64ToBlob(data.audioBase64, data.mimeType);
    const extension = data.mimeType.includes("mp4")
      ? "mp4"
      : data.mimeType.includes("mpeg")
        ? "mp3"
        : data.mimeType.includes("ogg")
          ? "ogg"
          : "webm";

    formData.set("file", new File([blob], `voice-entry.${extension}`, { type: blob.type }));
    formData.set("model", model);
    formData.set("language", "pt");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Falha na transcrição OpenAI: ${response.status} ${errorText}`);
    }

    const parsed = (await response.json()) as { text?: string };
    const text = parsed.text?.trim();
    if (!text) throw new Error("A transcrição não retornou texto compreensível.");

    return {
      text,
      model,
      ...estimateCost(data.durationMs),
    };
  });
