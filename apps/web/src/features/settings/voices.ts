/** Kokoro voices served by the AI service (`GET /api/v1/tts/voices`). */
export const VOICES = [
  { id: "af_heart", name: "Heart", accent: "American", gender: "Female" },
  { id: "af_bella", name: "Bella", accent: "American", gender: "Female" },
  { id: "af_nicole", name: "Nicole", accent: "American", gender: "Female" },
  { id: "am_michael", name: "Michael", accent: "American", gender: "Male" },
  { id: "am_fenrir", name: "Fenrir", accent: "American", gender: "Male" },
  { id: "bf_emma", name: "Emma", accent: "British", gender: "Female" },
  { id: "bm_george", name: "George", accent: "British", gender: "Male" },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];

export const DEFAULT_VOICE: VoiceId = "af_heart";
export const SPEED_MIN = 0.5;
export const SPEED_MAX = 2;
export const SPEED_STEP = 0.25;
