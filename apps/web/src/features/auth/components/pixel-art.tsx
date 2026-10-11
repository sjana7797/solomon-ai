"use client";

import { useEffect, useRef } from "react";

/*
 * Pixel-art panel. A tiny palette image (54×72) is drawn as blocks on a canvas
 * over the full painting it was made from:
 * - on load the blocks build in with a diagonal sweep,
 * - a few blocks twinkle while idle,
 * - near the pointer the blocks fade, revealing the painting, then drift back.
 * Respects prefers-reduced-motion (static blocks, no reveal).
 */

const PIXELS_SRC = "/auth-art.png";
const PAINTING_SRC = "/auth-art-full.webp";
const REVEAL_RADIUS = 150; // CSS px around the pointer
const FADE_OUT = 0.22; // per-frame easing towards revealed
const FADE_IN = 0.045; // slower drift back to pixels
const BUILD_MS = 1100;
const TWINKLES = 18;

type Cell = { x: number; y: number; color: string; alpha: number; delay: number };

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function PixelArt({ className }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!wrap || !canvas || !ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cells: Cell[] = [];
    let cols = 0;
    let rows = 0;
    let size = 0; // cell size in CSS px
    let offsetX = 0;
    let offsetY = 0;
    let width = 0;
    let height = 0;
    let pointer: { x: number; y: number } | null = null;
    let frame = 0;
    let start = 0;
    let disposed = false;
    const twinkles = new Map<number, number>(); // cell index -> start time

    const layout = () => {
      const rect = wrap.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // "object-fit: cover", matching the painting underneath.
      size = Math.max(width / cols, height / rows);
      offsetX = (width - cols * size) / 2;
      offsetY = (height - rows * size) / 2;
    };

    const draw = (now: number) => {
      ctx.clearRect(0, 0, width, height);
      const built = reduce ? 1 : Math.min((now - start) / BUILD_MS, 1);
      let busy = built < 1 || twinkles.size > 0;
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i]!;
        const cx = offsetX + (cell.x + 0.5) * size;
        const cy = offsetY + (cell.y + 0.5) * size;
        let target = 1;
        if (pointer && !reduce) {
          const d = Math.hypot(cx - pointer.x, cy - pointer.y);
          target = Math.min(Math.max((d - REVEAL_RADIUS * 0.35) / (REVEAL_RADIUS * 0.65), 0), 1);
        }
        const speed = target < cell.alpha ? FADE_OUT : FADE_IN;
        cell.alpha += (target - cell.alpha) * speed;
        if (Math.abs(target - cell.alpha) > 0.004) busy = true;
        else cell.alpha = target;

        // Build-in: each block appears after its diagonal delay, popping slightly.
        const appear = Math.min(Math.max((built - cell.delay) / 0.18, 0), 1);
        const alpha = cell.alpha * appear;
        if (alpha <= 0.01) continue;
        const grow = 0.6 + 0.4 * appear;
        const s = size * grow;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = cell.color;
        ctx.fillRect(cx - s / 2, cy - s / 2, s + 0.5, s + 0.5);

        const twinkle = twinkles.get(i);
        if (twinkle !== undefined) {
          const t = (now - twinkle) / 1400;
          if (t >= 1) twinkles.delete(i);
          else {
            ctx.globalAlpha = alpha * Math.sin(t * Math.PI) * 0.45;
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(cx - s / 2, cy - s / 2, s + 0.5, s + 0.5);
          }
        }
      }
      ctx.globalAlpha = 1;
      return busy;
    };

    const tick = (now: number) => {
      if (disposed) return;
      // Start a new twinkle now and then (lower half: flowers and water).
      if (!reduce && twinkles.size < TWINKLES && Math.random() < 0.12) {
        const index = Math.floor(cells.length * (0.45 + Math.random() * 0.55));
        if (!twinkles.has(index)) twinkles.set(index, now);
      }
      draw(now);
      frame = requestAnimationFrame(tick);
    };

    const onMove = (event: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const onLeave = () => {
      pointer = null;
    };

    const observer = new ResizeObserver(() => {
      if (cols) layout();
    });

    void loadImage(PIXELS_SRC).then((img) => {
      if (disposed) return;
      cols = img.naturalWidth;
      rows = img.naturalHeight;
      const reader = document.createElement("canvas");
      reader.width = cols;
      reader.height = rows;
      const readCtx = reader.getContext("2d", { willReadFrequently: true })!;
      readCtx.drawImage(img, 0, 0);
      const data = readCtx.getImageData(0, 0, cols, rows).data;
      cells = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const o = (y * cols + x) * 4;
          // Sweep from bottom-left to top-right, with a little jitter.
          const diagonal = (x / cols + (rows - y) / rows) / 2;
          cells.push({
            x,
            y,
            color: `rgb(${data[o]} ${data[o + 1]} ${data[o + 2]})`,
            alpha: 1,
            delay: Math.min(diagonal * 0.8 + Math.random() * 0.06, 0.82),
          });
        }
      }
      layout();
      observer.observe(wrap);
      start = performance.now();
      if (reduce) draw(start);
      else frame = requestAnimationFrame(tick);
    });

    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerleave", onLeave);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={wrapRef} className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={PAINTING_SRC} alt="" className="absolute inset-0 size-full object-cover" />
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      {/* Fine stitch texture over everything. */}
      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,oklch(1_0_0/0.07)_0_1px,transparent_1px_4px),repeating-linear-gradient(90deg,oklch(0_0_0/0.05)_0_1px,transparent_1px_6px)] mix-blend-overlay" />
    </div>
  );
}
