"use client";

import { useId, useMemo, useState } from "react";

import { formatPrice } from "../lib/format";
import type { HistoryRange, PricePoint } from "../types";

const WIDTH = 1000;
const STROKE = { up: "oklch(0.7 0.13 160)", down: "oklch(0.68 0.15 15)" };

function formatTime(time: number, range: HistoryRange) {
  const options: Intl.DateTimeFormatOptions =
    range === "1d"
      ? { hour: "numeric", minute: "2-digit" }
      : range === "5d"
        ? { weekday: "short", hour: "numeric", minute: "2-digit" }
        : { day: "numeric", month: "short", year: range === "1y" || range === "5y" ? "numeric" : undefined };
  return new Intl.DateTimeFormat(undefined, options).format(time);
}

/**
 * Area chart of closing prices with a hover readout. Coloured by the change
 * over the range; a dashed line marks the previous close on the 1-day view.
 */
export function PriceChart({
  points,
  range,
  currency,
  baseline,
  height = 260,
}: {
  points: PricePoint[];
  range: HistoryRange;
  currency: string | null;
  /** Reference price (previous close) for colour and the dashed line. */
  baseline?: number | null;
  height?: number;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const closes = points.map((p) => p.close);
    const reference = baseline ?? points[0]!.close;
    const min = Math.min(...closes, range === "1d" ? reference : Infinity);
    const max = Math.max(...closes, range === "1d" ? reference : -Infinity);
    const pad = (max - min) * 0.08 || max * 0.01 || 1;
    const lo = min - pad;
    const hi = max + pad;
    const x = (i: number) => (i / (points.length - 1)) * WIDTH;
    const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.close).toFixed(1)}`).join("");
    return {
      line,
      area: `${line}L${WIDTH},${height}L0,${height}Z`,
      x,
      y,
      reference,
      direction: points.at(-1)!.close >= reference ? ("up" as const) : ("down" as const),
    };
  }, [points, baseline, range, height]);

  if (!geometry) {
    return (
      <div style={{ height }} className="grid place-items-center text-sm text-muted-foreground">
        Not enough data for this range.
      </div>
    );
  }

  const stroke = STROKE[geometry.direction];
  const active = hover !== null ? points[hover] : undefined;

  return (
    <div className="relative select-none" style={{ height }}>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 size-full overflow-visible"
        role="img"
        aria-label={`Price chart, ${range}`}
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const ratio = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
          setHover(Math.round(ratio * (points.length - 1)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {range === "1d" && (
          <line
            x1="0"
            x2={WIDTH}
            y1={geometry.y(geometry.reference)}
            y2={geometry.y(geometry.reference)}
            stroke="currentColor"
            className="text-muted-foreground/40"
            strokeDasharray="4 6"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path d={geometry.area} fill={`url(#${gradientId})`} />
        <path
          d={geometry.line}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {hover !== null && (
          <line
            x1={geometry.x(hover)}
            x2={geometry.x(hover)}
            y1="0"
            y2={height}
            stroke="currentColor"
            className="text-foreground/25"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {active && hover !== null && (
        <>
          <span
            className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card"
            style={{
              left: `${(geometry.x(hover) / WIDTH) * 100}%`,
              top: geometry.y(active.close),
              background: stroke,
            }}
          />
          <div
            className="pointer-events-none absolute top-0 rounded-lg border border-border/70 bg-popover px-2.5 py-1.5 text-xs shadow-sm"
            style={{
              left: `${(geometry.x(hover) / WIDTH) * 100}%`,
              transform: `translateX(${hover > points.length / 2 ? "calc(-100% - 8px)" : "8px"})`,
            }}
          >
            <div className="font-medium tabular-nums">{formatPrice(active.close, currency)}</div>
            <div className="text-muted-foreground">{formatTime(active.time, range)}</div>
          </div>
        </>
      )}
    </div>
  );
}
