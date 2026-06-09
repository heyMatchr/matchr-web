"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type ProfileGalleryPhoto = {
  id: string;
  media_url: string;
};

type ProfileGallerySectionProps = {
  displayName: string;
  photos: ProfileGalleryPhoto[];
};

export function ProfileGallerySection({
  displayName,
  photos,
}: ProfileGallerySectionProps) {
  const [activePhoto, setActivePhoto] = useState<ProfileGalleryPhoto | null>(null);

  useEffect(() => {
    if (!activePhoto) return;

    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
    };
  }, [activePhoto]);

  if (!photos.length) {
    return null;
  }

  return (
    <>
      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
            Photos
          </p>
          <p className="text-xs text-neutral-500">{photos.length}/8</p>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              aria-label={`Open ${displayName}'s profile photo ${index + 1}`}
              onClick={() => setActivePhoto(photo)}
              className="relative aspect-square overflow-hidden rounded-xl border border-neutral-900 bg-neutral-950 transition-colors hover:border-neutral-700"
            >
              <Image
                src={photo.media_url}
                alt={`${displayName} profile photo ${index + 1}`}
                fill
                sizes="(min-width: 768px) 120px, 25vw"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      </div>

      {activePhoto ? (
        <div className="fixed inset-0 z-[120] flex h-[100dvh] w-screen flex-col overflow-hidden bg-black">
          <div className="relative z-10 flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/75 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+24px)] backdrop-blur md:px-6 md:pt-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-white">
                {displayName}
              </p>
              <p className="text-xs text-neutral-400">Profile photo</p>
            </div>
            <button
              type="button"
              aria-label="Close profile photo"
              onClick={() => setActivePhoto(null)}
              className="min-h-11 shrink-0 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15"
            >
              Close
            </button>
          </div>
          <button
            type="button"
            aria-label="Close profile photo"
            className="absolute inset-0 z-0"
            onClick={() => setActivePhoto(null)}
          />
          <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center p-4 pb-[calc(env(safe-area-inset-bottom)+24px)] md:p-8">
            <div className="relative h-full max-h-full w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-neutral-950 shadow-2xl">
              <Image
                src={activePhoto.media_url}
                alt={`${displayName} profile photo`}
                fill
                sizes="100vw"
                className="object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
