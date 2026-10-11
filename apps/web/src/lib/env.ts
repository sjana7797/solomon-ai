export const AI_API_URL = (
  process.env.NEXT_PUBLIC_AI_API_URL ?? "http://127.0.0.1:3001"
).replace(/\/$/, "");
