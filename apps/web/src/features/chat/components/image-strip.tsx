"use client";

import {
  ImageViewer,
  ImageViewerContent,
  ImageViewerGallery,
  ImageViewerThumbnail,
} from "@repo/ui/components/motion/morphing-lightbox";
import { useMemo } from "react";

import type { ImageResult } from "../types";

const VISIBLE = 4;

/** Perplexity-style image row from SearXNG results, with an expanding viewer. */
export function ImageStrip({ images }: { images: ImageResult[] }) {
  const items = useMemo(
    () =>
      images.slice(0, VISIBLE).map((image) => ({
        id: image.url,
        // Thumbnails keep the page light; originals can be very large.
        src: image.thumbnail_url,
        alt: image.title,
        width: image.width,
        height: image.height,
        caption: image.title,
      })),
    [images],
  );
  const sourceFor = useMemo(
    () => new Map(images.map((image) => [image.url, image])),
    [images],
  );

  if (items.length === 0) return null;

  return (
    <ImageViewer
      images={items}
      label="Images"
      renderCaption={(item) => {
        const image = sourceFor.get(item.id);
        return (
          <span className="flex items-center gap-3">
            <span className="truncate">{item.caption}</span>
            {image && (
              <a
                href={image.source_url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 underline underline-offset-4"
              >
                Source
              </a>
            )}
          </span>
        );
      }}
    >
      <ImageViewerGallery className="mb-4 grid-cols-4 gap-2 sm:grid-cols-4">
        {items.map((item) => (
          <ImageViewerThumbnail
            key={item.id}
            imageId={item.id}
            className="aspect-[4/3] overflow-hidden rounded-xl bg-muted"
            imageClassName="h-full w-full object-cover"
          />
        ))}
      </ImageViewerGallery>
      <ImageViewerContent />
    </ImageViewer>
  );
}
