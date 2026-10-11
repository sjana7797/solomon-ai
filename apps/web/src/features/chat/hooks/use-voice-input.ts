"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { transcribeSpeech } from "../api/ai-client";
import { toWav16k } from "../lib/wav";

export type VoiceInputStatus = "idle" | "recording" | "transcribing";

const MAX_SECONDS = 120; // matches the server's STT_MAX_SECONDS

/** Record from the microphone, then transcribe with the local STT model. */
export function useVoiceInput(onTranscript: (text: string) => void) {
  const [status, setStatus] = useState<VoiceInputStatus>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const cancelled = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const cleanup = useCallback(() => {
    clearInterval(timer.current);
    recorder.current?.stream.getTracks().forEach((track) => track.stop());
    recorder.current = null;
  }, []);

  useEffect(() => () => {
    cancelled.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    cleanup();
  }, [cleanup]);

  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelled.current = true;
    stop();
  }, [stop]);

  const start = useCallback(async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access was blocked. Allow it in your browser to use voice input.");
      return;
    }
    const chunks: Blob[] = [];
    const media = new MediaRecorder(stream);
    recorder.current = media;
    cancelled.current = false;
    media.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    media.onstop = async () => {
      cleanup();
      if (cancelled.current || chunks.length === 0) {
        setStatus("idle");
        return;
      }
      setStatus("transcribing");
      try {
        const wav = await toWav16k(new Blob(chunks, { type: media.mimeType }));
        const { text } = await transcribeSpeech(wav);
        if (text) onTranscriptRef.current(text);
        else setError("Didn't catch that. Try speaking a little closer to the mic.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Transcription failed.");
      } finally {
        setStatus("idle");
      }
    };
    media.start();
    setSeconds(0);
    setStatus("recording");
    const started = Date.now();
    timer.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS) media.stop();
    }, 250);
  }, [cleanup]);

  return { status, seconds, error, start, stop, cancel };
}
