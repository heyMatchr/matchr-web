"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

type ProfileGalleryItem = {
  duration_seconds: number | null;
  id: string;
  media_type: string;
  media_url: string;
};

type ProfileGallerySectionProps = {
  displayName: string;
  photos: ProfileGalleryItem[];
};

export function ProfileGallerySection({
  displayName,
  photos,
}: ProfileGallerySectionProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [pointerStart, setPointerStart] = useState<number | null>(null);
  const activeItem = activeIndex === null ? null : photos[activeIndex] ?? null;
  const canGoPrevious = activeIndex !== null && activeIndex > 0;
  const canGoNext = activeIndex !== null && activeIndex < photos.length - 1;

  useEffect(() => {
    if (!activeItem) return;

    const html = document.documentElement;
    const body = document.body;
    const appShell = document.querySelector<HTMLElement>(".matchr-app-shell");
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousShellOverflow = appShell?.style.overflow;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (appShell) {
      appShell.style.overflow = "hidden";
    }

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      if (appShell) {
        appShell.style.overflow = previousShellOverflow ?? "";
      }
    };
  }, [activeItem]);

  const closeViewer = useCallback(() => {
    setActiveIndex(null);
    setPointerStart(null);
  }, []);

  const goPrevious = useCallback(() => {
    setActiveIndex((currentIndex) =>
      currentIndex === null ? currentIndex : Math.max(0, currentIndex - 1),
    );
  }, []);

  const goNext = useCallback(() => {
    setActiveIndex((currentIndex) =>
      currentIndex === null
        ? currentIndex
        : Math.min(photos.length - 1, currentIndex + 1),
    );
  }, [photos.length]);

  useEffect(() => {
    if (!activeItem) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeViewer();
      }

      if (event.key === "ArrowLeft") {
        goPrevious();
      }

      if (event.key === "ArrowRight") {
        goNext();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeItem, closeViewer, goNext, goPrevious]);

  const progressItems = useMemo(
    () =>
      photos.map((photo, index) => ({
        active: activeIndex !== null && index <= activeIndex,
        id: photo.id,
      })),
    [activeIndex, photos],
  );

  if (!photos.length) {
    return null;
  }

  return (
    <>
      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
            Gallery
          </p>
          <p className="text-xs text-neutral-500">{photos.length}/8</p>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              aria-label={`Open ${displayName}'s gallery item ${index + 1}`}
              onClick={() => setActiveIndex(index)}
              className="relative aspect-square overflow-hidden rounded-xl border border-neutral-900 bg-neutral-950 transition-colors hover:border-neutral-700"
            >
              {photo.media_type === "gallery_video" ? (
                <>
                  <video
                    src={photo.media_url}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute right-1.5 top-1.5 rounded-full border border-white/15 bg-black/60 px-2 py-0.5 text-[10px] font-black text-white">
                    Video
                  </span>
                </>
              ) : (
                <Image
                  src={photo.media_url}
                  alt={`${displayName} profile photo ${index + 1}`}
                  fill
                  sizes="(min-width: 768px) 120px, 25vw"
                  className="object-cover"
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {activeItem && activeIndex !== null ? (
        <div
          className="fixed inset-0 z-[120] flex h-[100dvh] w-screen flex-col overflow-hidden bg-black"
          onPointerDown={(event) => setPointerStart(event.clientX)}
          onPointerUp={(event) => {
            if (pointerStart === null) return;

            const delta = event.clientX - pointerStart;
            setPointerStart(null);

            if (delta > 48) {
              goPrevious();
            }

            if (delta < -48) {
              goNext();
            }
          }}
        >
          <div className="relative z-30 flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/75 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+24px)] backdrop-blur md:px-6 md:pt-4">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex gap-1.5">
                {progressItems.map((item) => (
                  <span
                    key={item.id}
                    className={`h-1 flex-1 rounded-full ${
                      item.active ? "bg-white" : "bg-white/20"
                    }`}
                  />
                ))}
              </div>
              <p className="truncate text-sm font-black text-white">
                {displayName}
              </p>
              <p className="text-xs text-neutral-400">
                {activeIndex + 1}/{photos.length}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close profile gallery"
              onClick={closeViewer}
              className="min-h-11 shrink-0 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15"
            >
              Close
            </button>
          </div>
          <div className="relative z-10 min-h-0 flex-1 select-none">
            <button
              type="button"
              aria-label="Previous gallery item"
              disabled={!canGoPrevious}
              onClick={goPrevious}
              className="absolute inset-y-0 left-0 z-20 w-1/2 disabled:cursor-default"
            />
            <button
              type="button"
              aria-label="Next gallery item"
              disabled={!canGoNext}
              onClick={goNext}
              className="absolute inset-y-0 right-0 z-20 w-1/2 disabled:cursor-default"
            />
            <div className="relative z-10 flex h-full items-center justify-center p-4 pb-[calc(env(safe-area-inset-bottom)+24px)] md:p-8">
              {activeItem.media_type === "gallery_video" ? (
                <video
                  key={activeItem.id}
                  src={activeItem.media_url}
                  autoPlay
                  muted
                  loop
                  playsInline
                  controls={false}
                  className="max-h-full w-full max-w-3xl rounded-3xl border border-white/10 object-contain shadow-2xl"
                />
              ) : (
                <div className="relative h-full max-h-full w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-neutral-950 shadow-2xl">
                  <Image
                    src={activeItem.media_url}
                    alt={`${displayName} profile photo`}
                    fill
                    sizes="100vw"
                    className="object-contain"
                    priority
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
