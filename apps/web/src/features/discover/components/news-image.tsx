"use client";

import { cn } from "@repo/ui/lib/utils";
import Image from "next/image";
import { useState } from "react";

/** Remote news thumbnail with a quiet tinted fallback when missing or blocked. */
export function NewsImage({
  src,
  alt,
  source,
  className,
  sizes,
}: {
  src: string | null;
  alt: string;
  source: string;
  className?: string;
  sizes: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      {src && !failed ? (
        <Image
          src={src}
          alt={alt}
          fill
          unoptimized
          sizes={sizes}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />
      ) : (
        <div className="grid h-full place-items-center bg-linear-to-br from-chart-1/60 to-chart-4/50">
          <span className="font-display text-3xl text-foreground/50">
            {source.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
}
