"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { getVisibleStatusBadges, StatusBadge } from "@/app/_components/status-badge";

type ProfileGalleryItem = {
  duration_seconds: number | null;
  id: string;
  media_type: string;
  media_url: string;
};

type ProfilePreviewVideo = {
  duration_seconds: number | null;
  id: string;
  media_url: string;
};

type ProfileMediaItem = ProfileGalleryItem & {
  label: string;
};

type ProfileGallerySectionProps = {
  activePremium?: boolean;
  age?: number | null;
  avatarUrl?: string | null;
  country?: string | null;
  countryFlag?: string | null;
  displayName: string;
  hasActiveStories?: boolean;
  location?: string | null;
  occupation?: string | null;
  photos: ProfileGalleryItem[];
  previewVideo?: ProfilePreviewVideo | null;
  verified?: boolean | null;
};

function initialFor(name: string) {
  return name.trim().charAt(0).toUpperCase() || "M";
}

export function ProfileGallerySection({
  activePremium = false,
  age,
  avatarUrl,
  country,
  countryFlag,
  displayName,
  hasActiveStories = false,
  location,
  occupation,
  photos,
  previewVideo,
  verified = false,
}: ProfileGallerySectionProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [pointerStart, setPointerStart] = useState<number | null>(null);
  const swipeHandledRef = useRef(false);
  const [failedMediaIds, setFailedMediaIds] = useState<Set<string>>(
    () => new Set(),
  );
  const mediaItems = useMemo<ProfileMediaItem[]>(() => {
    const galleryItems = photos.map((photo, index) => ({
      ...photo,
      label:
        photo.media_type === "gallery_video"
          ? `${displayName} gallery video ${index + 1}`
          : `${displayName} gallery photo ${index + 1}`,
    }));
    const items: ProfileMediaItem[] = [];

    if (previewVideo?.media_url) {
      items.push({
        duration_seconds: previewVideo.duration_seconds,
        id: `preview-${previewVideo.id}`,
        label: `${displayName} preview video`,
        media_type: "preview_video",
        media_url: previewVideo.media_url,
      });
    }

    const normalizedAvatarUrl = avatarUrl?.trim();
    const avatarAlreadyIncluded =
      normalizedAvatarUrl &&
      [...items, ...galleryItems].some(
        (item) => item.media_url === normalizedAvatarUrl,
      );

    if (normalizedAvatarUrl && !avatarAlreadyIncluded) {
      items.push({
        duration_seconds: null,
        id: "profile-avatar",
        label: `${displayName} profile photo`,
        media_type: "gallery_photo",
        media_url: normalizedAvatarUrl,
      });
    }

    return [...items, ...galleryItems];
  }, [avatarUrl, displayName, photos, previewVideo]);
  const activeItem = mediaItems[activeIndex] ?? null;
  const visibleBadges = getVisibleStatusBadges([
    verified ? { type: "verified" } : null,
    activePremium ? { type: "premium" } : null,
  ]);
  const canGoPrevious = activeIndex > 0;
  const canGoNext = activeIndex < mediaItems.length - 1;
  const activeMediaFailed = activeItem
    ? failedMediaIds.has(activeItem.id)
    : false;

  const goPrevious = useCallback(() => {
    setActiveIndex((currentIndex) => Math.max(0, currentIndex - 1));
  }, []);

  const goNext = useCallback(() => {
    setActiveIndex((currentIndex) =>
      Math.min(mediaItems.length - 1, currentIndex + 1),
    );
  }, [mediaItems.length]);

  const markMediaFailed = useCallback((id: string) => {
    setFailedMediaIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.add(id);
      return nextIds;
    });
  }, []);

  const profileLocation = [
    countryFlag ? countryFlag : null,
    location,
    country,
  ]
    .filter(Boolean)
    .join(" ");
  const displayTitle = age ? `${displayName}, ${age}` : displayName;
  const progressItems = mediaItems.length ? mediaItems : [{ id: "empty" }];

  return (
    <section
      className={`relative mt-6 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 md:mt-10 ${
        hasActiveStories ? "ring-2 ring-emerald-300/70" : ""
      }`}
    >
      <div
        className="relative h-[calc(100dvh-140px)] min-h-[520px] max-h-[780px] select-none md:h-[min(780px,calc(100dvh-120px))]"
        onClick={(event) => {
          if (!mediaItems.length) return;

          if (swipeHandledRef.current) {
            swipeHandledRef.current = false;
            return;
          }

          const bounds = event.currentTarget.getBoundingClientRect();
          const tappedLeft = event.clientX < bounds.left + bounds.width / 2;

          if (tappedLeft) {
            goPrevious();
          } else {
            goNext();
          }
        }}
        onPointerDown={(event) => {
          swipeHandledRef.current = false;
          setPointerStart(event.clientX);
        }}
        onPointerUp={(event) => {
          if (pointerStart === null || !mediaItems.length) return;

          const delta = event.clientX - pointerStart;
          setPointerStart(null);

          if (delta > 48) {
            swipeHandledRef.current = true;
            goPrevious();
          }

          if (delta < -48) {
            swipeHandledRef.current = true;
            goNext();
          }
        }}
      >
        {activeItem && !activeMediaFailed ? (
          activeItem.media_type === "preview_video" ||
          activeItem.media_type === "gallery_video" ? (
            <video
              key={activeItem.id}
              src={activeItem.media_url}
              autoPlay
              muted
              loop
              playsInline
              controls={false}
              onError={() => markMediaFailed(activeItem.id)}
              className="h-full w-full object-cover"
            />
          ) : (
            // Main profile media uses the browser image element so Supabase
            // media can render without involving the Next image optimizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={activeItem.media_url}
              alt={activeItem.label}
              onError={() => markMediaFailed(activeItem.id)}
              className="h-full w-full object-cover"
            />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-neutral-950 text-7xl font-black text-neutral-700">
            {activeMediaFailed ? "Media unavailable" : initialFor(displayName)}
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/45" />

        <div className="absolute inset-x-0 top-0 z-20 px-4 pt-4 sm:px-6">
          <div className="flex gap-1.5">
            {progressItems.map((item, index) => (
              <span
                key={item.id}
                className={`h-1 flex-1 rounded-full ${
                  index <= activeIndex ? "bg-white" : "bg-white/25"
                }`}
              />
            ))}
          </div>
        </div>

        {canGoPrevious ? (
          <div className="pointer-events-none absolute left-4 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white backdrop-blur sm:flex">
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
          <div className="pointer-events-none absolute right-4 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white backdrop-blur sm:flex">
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

        <div className="absolute inset-x-0 bottom-0 z-20 p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] sm:p-7">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              {visibleBadges.map((badge) => (
                <StatusBadge
                  key={badge.type}
                  level={badge.level}
                  type={badge.type}
                />
              ))}
              {activeItem?.media_type === "preview_video" ? (
                <span className="rounded-full border border-white/15 bg-black/35 px-3 py-1 text-xs text-white/90 backdrop-blur">
                  Preview
                </span>
              ) : null}
              {activeItem?.media_type === "gallery_video" ? (
                <span className="rounded-full border border-white/15 bg-black/35 px-3 py-1 text-xs text-white/90 backdrop-blur">
                  Video
                </span>
              ) : null}
            </div>
            <h2 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-6xl">
              {displayTitle}
            </h2>
            {profileLocation || occupation ? (
              <div className="mt-2 space-y-1 text-sm text-white/75 sm:text-base">
                {profileLocation ? <p>{profileLocation}</p> : null}
                {occupation ? <p>{occupation}</p> : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
