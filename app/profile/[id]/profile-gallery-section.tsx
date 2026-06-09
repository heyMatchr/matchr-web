"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

type ProfileGalleryItem = {
  duration_seconds: number | null;
  id: string;
  media_type: string;
  media_url: string;
};

type GalleryViewerItem = ProfileGalleryItem & {
  label: string;
};

type ProfileGallerySectionProps = {
  avatarUrl?: string | null;
  displayName: string;
  photos: ProfileGalleryItem[];
};

export function ProfileGallerySection({
  avatarUrl,
  displayName,
  photos,
}: ProfileGallerySectionProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [pointerStart, setPointerStart] = useState<number | null>(null);
  const [failedMediaIds, setFailedMediaIds] = useState<Set<string>>(
    () => new Set(),
  );
  const viewerItems = useMemo<GalleryViewerItem[]>(() => {
    const galleryItems = photos.map((photo, index) => ({
      ...photo,
      label:
        photo.media_type === "gallery_video"
          ? `${displayName} gallery video ${index + 1}`
          : `${displayName} gallery photo ${index + 1}`,
    }));
    const normalizedAvatarUrl = avatarUrl?.trim();
    const avatarAlreadyInGallery =
      normalizedAvatarUrl &&
      galleryItems.some((item) => item.media_url === normalizedAvatarUrl);

    if (!normalizedAvatarUrl || avatarAlreadyInGallery) {
      return galleryItems;
    }

    return [
      {
        duration_seconds: null,
        id: "profile-avatar",
        label: `${displayName} profile photo`,
        media_type: "gallery_photo",
        media_url: normalizedAvatarUrl,
      },
      ...galleryItems,
    ];
  }, [avatarUrl, displayName, photos]);
  const galleryStartIndex = viewerItems.length - photos.length;
  const activeItem =
    activeIndex === null ? null : viewerItems[activeIndex] ?? null;
  const canGoPrevious = activeIndex !== null && activeIndex > 0;
  const canGoNext =
    activeIndex !== null && activeIndex < viewerItems.length - 1;
  const activeMediaFailed = activeItem
    ? failedMediaIds.has(activeItem.id)
    : false;

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
        : Math.min(viewerItems.length - 1, currentIndex + 1),
    );
  }, [viewerItems.length]);

  const markMediaFailed = useCallback((id: string) => {
    setFailedMediaIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.add(id);
      return nextIds;
    });
  }, []);

  const openGalleryItem = useCallback(
    (galleryIndex: number) => {
      setActiveIndex(galleryIndex + galleryStartIndex);
    },
    [galleryStartIndex],
  );

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
      viewerItems.map((item, index) => ({
        active: activeIndex !== null && index <= activeIndex,
        id: item.id,
      })),
    [activeIndex, viewerItems],
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
              onClick={() => openGalleryItem(index)}
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
          className="fixed inset-0 z-[140] flex h-[100dvh] w-screen flex-col overflow-hidden bg-black"
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
          <div className="relative z-40 flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/80 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+24px)] backdrop-blur md:px-6 md:pt-4">
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
                {activeIndex + 1}/{viewerItems.length}
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
          <div
            className="relative z-10 min-h-0 flex-1 select-none"
            onClick={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              const tappedLeft = event.clientX < bounds.left + bounds.width / 2;

              if (tappedLeft) {
                goPrevious();
              } else {
                goNext();
              }
            }}
          >
            {canGoPrevious ? (
              <div className="pointer-events-none absolute left-4 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white backdrop-blur">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </div>
            ) : null}
            {canGoNext ? (
              <div className="pointer-events-none absolute right-4 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white backdrop-blur">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </div>
            ) : null}
            <div className="relative z-10 flex h-full items-center justify-center p-4 pb-[calc(env(safe-area-inset-bottom)+24px)] md:p-8">
              {activeMediaFailed ? (
                <div className="flex min-h-48 w-full max-w-sm flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
                  <p className="text-sm font-semibold text-white">
                    Media unavailable
                  </p>
                  <p className="mt-1 text-xs text-neutral-400">
                    Try another item or close the viewer.
                  </p>
                </div>
              ) : activeItem.media_type === "gallery_video" ? (
                <video
                  key={activeItem.id}
                  src={activeItem.media_url}
                  autoPlay
                  muted
                  loop
                  playsInline
                  controls={false}
                  onError={() => markMediaFailed(activeItem.id)}
                  className="max-h-full w-full max-w-3xl rounded-3xl border border-white/10 object-contain shadow-2xl"
                />
              ) : (
                <div className="relative h-full max-h-full w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-neutral-950 shadow-2xl">
                  <Image
                    src={activeItem.media_url}
                    alt={activeItem.label}
                    fill
                    sizes="100vw"
                    className="object-contain"
                    onError={() => markMediaFailed(activeItem.id)}
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
