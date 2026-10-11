"use client";

import { ImageGeneration } from "@repo/ui/components/agents/image-generation";
import { useQuery } from "@tanstack/react-query";
import { DownloadIcon } from "lucide-react";
import { useEffect } from "react";

import { fetchGeneratedImage } from "../api/ai-client";
import type { GeneratedImageState } from "../types";

/** A reply's generated image: beui's progressive surface, then the result. */
export function GeneratedImage({
  image,
  onRetry,
}: {
  image: GeneratedImageState;
  onRetry?: () => void;
}) {
  const { data: url, isError } = useQuery({
    queryKey: ["generated-image", image.id],
    queryFn: ({ signal }) => fetchGeneratedImage(image.id!, signal),
    enabled: image.status === "complete" && Boolean(image.id),
    staleTime: Infinity,
  });

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const status =
    image.status === "error" || isError
      ? "error"
      : image.status === "complete"
        ? url
          ? "complete"
          : "refining"
        : (image.progress ?? 0) > 0.6
          ? "refining"
          : "generating";

  return (
    <div className="mb-2 w-full max-w-md">
      <ImageGeneration
        status={status}
        prompt={image.prompt}
        aspectRatio={image.width && image.height ? `${image.width} / ${image.height}` : "1 / 1"}
        resolution={image.width ? `${image.width}×${image.height}` : undefined}
        statusText={
          status === "generating" && image.progress
            ? `Generating · ${Math.round(image.progress * 100)}%`
            : undefined
        }
        onRetry={onRetry}
        size="fluid"
      >
        {url && (
          // Blob URL from an authenticated fetch, so next/image doesn't apply.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={image.prompt} className="h-full w-full object-cover" />
        )}
      </ImageGeneration>
      {url && (
        <a
          href={url}
          download={`solomon-${image.id}.png`}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <DownloadIcon className="size-3.5" />
          Download
        </a>
      )}
    </div>
  );
}
