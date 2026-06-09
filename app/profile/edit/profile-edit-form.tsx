"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useActionState, useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import {
  GENDER_IDENTITY_OPTIONS,
  PRONOUN_OPTIONS,
  SEXUAL_ORIENTATION_OPTIONS,
} from "@/lib/identity";
import type { ProfileRow } from "@/lib/supabase/types";
import {
  AVATAR_ALLOWED_TYPES,
  AVATAR_MAX_SIZE_BYTES,
  PROFILE_GALLERY_PHOTO_ALLOWED_TYPES,
  PROFILE_GALLERY_PHOTO_MAX_COUNT,
  PROFILE_GALLERY_PHOTO_MAX_SIZE_BYTES,
  PROFILE_MEDIA_BUCKET_NAME,
  PROFILE_PREVIEW_VIDEO_ALLOWED_TYPES,
  PROFILE_PREVIEW_VIDEO_MAX_DURATION_SECONDS,
  PROFILE_PREVIEW_VIDEO_MAX_SIZE_BYTES,
} from "@/lib/supabase/storage";
import type { Database } from "@/lib/supabase/types";
import { updateProfile } from "./actions";
import {
  addGalleryPhoto,
  removeGalleryPhoto,
  setGalleryPhotoAsAvatar,
  updateGalleryPhotoOrder,
} from "./gallery-actions";
import type { ProfileEditFormState } from "./types";

type EditableProfile = Pick<
  ProfileRow,
  | "avatar_url"
  | "age"
  | "accepting_dating"
  | "bio"
  | "body_type"
  | "country"
  | "country_flag"
  | "display_name"
  | "drinking"
  | "gender"
  | "gender_identity"
  | "height"
  | "interested_in"
  | "interests"
  | "location"
  | "occupation"
  | "looking_for"
  | "open_to_long_distance"
  | "pronouns"
  | "relationship_intent"
  | "relationship_status"
  | "sexual_orientation"
  | "show_gender_on_profile"
  | "show_orientation_on_profile"
  | "smoking"
  | "weight"
>;

type ActiveProfilePreviewVideo = {
  duration_seconds: number | null;
  id: string;
  media_url: string;
};

type GalleryPhoto = {
  created_at: string;
  id: string;
  media_url: string;
  sort_order: number;
  storage_path: string;
};

type ProfileEditFormProps = {
  activePreviewVideo?: ActiveProfilePreviewVideo | null;
  anonKey: string;
  galleryPhotos: GalleryPhoto[];
  profile: EditableProfile;
  supabaseUrl: string;
  userId: string;
};

const initialState: ProfileEditFormState = {
  message: "",
};

function getPreviewVideoExtension(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension && ["mp4", "webm", "mov"].includes(extension)) {
    return extension;
  }

  if (file.type === "video/quicktime") {
    return "mov";
  }

  return file.type.split("/").pop() || "mp4";
}

function getGalleryPhotoExtension(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension && ["jpg", "jpeg", "png", "webp"].includes(extension)) {
    return extension;
  }

  return file.type.split("/").pop() || "jpg";
}

export function ProfileEditForm({
  activePreviewVideo,
  anonKey,
  galleryPhotos,
  profile,
  supabaseUrl,
  userId,
}: ProfileEditFormProps) {
  const [avatarError, setAvatarError] = useState("");
  const [avatarPreview, setAvatarPreview] = useState(profile.avatar_url ?? "");
  const [galleryActionMessage, setGalleryActionMessage] = useState("");
  const [galleryActionStatus, setGalleryActionStatus] = useState<"error" | "success" | "">("");
  const [galleryBusyId, setGalleryBusyId] = useState("");
  const [galleryPhotoList, setGalleryPhotoList] = useState(galleryPhotos);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [previewVideoDuration, setPreviewVideoDuration] = useState("");
  const [previewVideoError, setPreviewVideoError] = useState("");
  const [previewVideoMimeType, setPreviewVideoMimeType] = useState("");
  const [previewVideoName, setPreviewVideoName] = useState("");
  const [previewVideoPath, setPreviewVideoPath] = useState("");
  const [previewVideoStatus, setPreviewVideoStatus] = useState(
    activePreviewVideo ? "Current preview saved" : "",
  );
  const [previewVideoUploading, setPreviewVideoUploading] = useState(false);
  const [previewVideoUrl, setPreviewVideoUrl] = useState(
    activePreviewVideo?.media_url ?? "",
  );
  const [state, formAction, pending] = useActionState(
    updateProfile,
    initialState,
  );
  const supabase = useMemo(
    () => createBrowserClient<Database>(supabaseUrl, anonKey),
    [anonKey, supabaseUrl],
  );

  useEffect(() => {
    return () => {
      if (avatarPreview && avatarPreview.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreview);
      }
      if (previewVideoUrl && previewVideoUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewVideoUrl);
      }
    };
  }, [avatarPreview, previewVideoUrl]);

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (avatarPreview.startsWith("blob:")) {
      URL.revokeObjectURL(avatarPreview);
    }

    setAvatarError("");

    if (!file) {
      setAvatarPreview(profile.avatar_url ?? "");
      return;
    }

    if (!AVATAR_ALLOWED_TYPES.includes(file.type as (typeof AVATAR_ALLOWED_TYPES)[number])) {
      event.target.value = "";
      setAvatarError("Upload a JPG, PNG, WebP, or GIF avatar.");
      setAvatarPreview(profile.avatar_url ?? "");
      return;
    }

    if (file.size > AVATAR_MAX_SIZE_BYTES) {
      event.target.value = "";
      setAvatarError("Keep your avatar under 5 MB.");
      setAvatarPreview(profile.avatar_url ?? "");
      return;
    }

    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleGalleryPhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setGalleryActionMessage("");
    setGalleryActionStatus("");

    if (!files.length) {
      return;
    }

    if (galleryPhotoList.length >= PROFILE_GALLERY_PHOTO_MAX_COUNT) {
      event.target.value = "";
      setGalleryActionMessage("You can keep up to 8 profile photos.");
      setGalleryActionStatus("error");
      return;
    }

    const remainingSlots = PROFILE_GALLERY_PHOTO_MAX_COUNT - galleryPhotoList.length;
    const selectedFiles = files.slice(0, remainingSlots);
    const invalidFile = selectedFiles.find(
      (file) =>
        !PROFILE_GALLERY_PHOTO_ALLOWED_TYPES.includes(
          file.type as (typeof PROFILE_GALLERY_PHOTO_ALLOWED_TYPES)[number],
        ) || file.size > PROFILE_GALLERY_PHOTO_MAX_SIZE_BYTES,
    );

    if (invalidFile) {
      event.target.value = "";
      setGalleryActionMessage("Upload JPG, PNG, or WebP photos under 5 MB.");
      setGalleryActionStatus("error");
      return;
    }

    setGalleryUploading(true);

    try {
      const addedPhotos: GalleryPhoto[] = [];

      for (const file of selectedFiles) {
        const storagePath = `${userId}/gallery/photo-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.${getGalleryPhotoExtension(file)}`;
        const { error: uploadError } = await supabase.storage
          .from(PROFILE_MEDIA_BUCKET_NAME)
          .upload(storagePath, file, {
            cacheControl: "3600",
            contentType: file.type,
          });

        if (uploadError) {
          setGalleryActionMessage(uploadError.message || "Photo upload failed.");
          setGalleryActionStatus("error");
          continue;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from(PROFILE_MEDIA_BUCKET_NAME).getPublicUrl(storagePath);

        if (!publicUrl) {
          await supabase.storage.from(PROFILE_MEDIA_BUCKET_NAME).remove([storagePath]);
          setGalleryActionMessage("Photo uploaded, but no public URL was generated.");
          setGalleryActionStatus("error");
          continue;
        }

        const result = await addGalleryPhoto({
          mediaUrl: publicUrl,
          mimeType: file.type,
          storagePath,
        });

        if (result.success && result.photo) {
          addedPhotos.push(result.photo);
          continue;
        }

        setGalleryActionMessage(result.message || "Photo could not be saved.");
        setGalleryActionStatus("error");
      }

      if (addedPhotos.length) {
        setGalleryPhotoList((current) =>
          [...current, ...addedPhotos]
            .slice(0, PROFILE_GALLERY_PHOTO_MAX_COUNT)
            .sort((a, b) => a.sort_order - b.sort_order),
        );
        setGalleryActionMessage(
          addedPhotos.length === 1 ? "Photo added" : "Photos added",
        );
        setGalleryActionStatus("success");
      }
    } finally {
      setGalleryUploading(false);
      event.target.value = "";
    }
  }

  async function handleRemoveGalleryPhoto(photo: GalleryPhoto) {
    setGalleryBusyId(photo.id);
    setGalleryActionMessage("");
    setGalleryActionStatus("");

    try {
      const result = await removeGalleryPhoto(photo.id);

      if (!result.success) {
        setGalleryActionMessage(result.message);
        setGalleryActionStatus("error");
        return;
      }

      setGalleryPhotoList((current) =>
        current.filter((currentPhoto) => currentPhoto.id !== photo.id),
      );
      setGalleryActionMessage(result.message);
      setGalleryActionStatus("success");
    } finally {
      setGalleryBusyId("");
    }
  }

  async function handleSetGalleryAvatar(photo: GalleryPhoto) {
    setGalleryBusyId(photo.id);
    setGalleryActionMessage("");
    setGalleryActionStatus("");

    try {
      const result = await setGalleryPhotoAsAvatar(photo.id);

      if (!result.success) {
        setGalleryActionMessage(result.message);
        setGalleryActionStatus("error");
        return;
      }

      setAvatarPreview(photo.media_url);
      setGalleryActionMessage(result.message);
      setGalleryActionStatus("success");
    } finally {
      setGalleryBusyId("");
    }
  }

  async function moveGalleryPhoto(photoId: string, direction: -1 | 1) {
    const currentIndex = galleryPhotoList.findIndex((photo) => photo.id === photoId);
    const nextIndex = currentIndex + direction;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= galleryPhotoList.length) {
      return;
    }

    const nextPhotos = [...galleryPhotoList];
    const [photo] = nextPhotos.splice(currentIndex, 1);
    nextPhotos.splice(nextIndex, 0, photo);
    const orderedPhotos = nextPhotos.map((nextPhoto, index) => ({
      ...nextPhoto,
      sort_order: index,
    }));

    setGalleryPhotoList(orderedPhotos);
    setGalleryActionMessage("");
    setGalleryActionStatus("");

    const result = await updateGalleryPhotoOrder(
      orderedPhotos.map((nextPhoto) => nextPhoto.id),
    );

    if (!result.success) {
      setGalleryActionMessage(result.message);
      setGalleryActionStatus("error");
    }
  }

  async function handlePreviewVideoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (previewVideoUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewVideoUrl);
    }

    setPreviewVideoDuration("");
    setPreviewVideoError("");
    setPreviewVideoMimeType("");
    setPreviewVideoName("");
    setPreviewVideoPath("");
    setPreviewVideoStatus("");

    if (!file) {
      setPreviewVideoUrl(activePreviewVideo?.media_url ?? "");
      setPreviewVideoStatus(activePreviewVideo ? "Current preview saved" : "");
      return;
    }

    if (
      !PROFILE_PREVIEW_VIDEO_ALLOWED_TYPES.includes(
        file.type as (typeof PROFILE_PREVIEW_VIDEO_ALLOWED_TYPES)[number],
      )
    ) {
      event.target.value = "";
      setPreviewVideoUrl(activePreviewVideo?.media_url ?? "");
      setPreviewVideoStatus(activePreviewVideo ? "Current preview saved" : "");
      setPreviewVideoError("Upload an MP4, WebM, or MOV preview video.");
      return;
    }

    if (file.size > PROFILE_PREVIEW_VIDEO_MAX_SIZE_BYTES) {
      event.target.value = "";
      setPreviewVideoUrl(activePreviewVideo?.media_url ?? "");
      setPreviewVideoStatus(activePreviewVideo ? "Current preview saved" : "");
      setPreviewVideoError("Keep preview videos under 20 MB.");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewVideoUrl(objectUrl);
    setPreviewVideoName(file.name || "Preview video");
    setPreviewVideoStatus("Checking duration...");
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = async () => {
      const duration = video.duration;
      setPreviewVideoDuration(String(duration));

      if (duration > PROFILE_PREVIEW_VIDEO_MAX_DURATION_SECONDS) {
        event.target.value = "";
        URL.revokeObjectURL(objectUrl);
        setPreviewVideoUrl(activePreviewVideo?.media_url ?? "");
        setPreviewVideoDuration("");
        setPreviewVideoName("");
        setPreviewVideoStatus(activePreviewVideo ? "Current preview saved" : "");
        setPreviewVideoError("Keep preview videos at 15 seconds or less.");
        return;
      }

      setPreviewVideoStatus("Preview ready");
      setPreviewVideoUploading(true);

      try {
        const nextPath = `${userId}/preview-${Date.now()}.${getPreviewVideoExtension(
          file,
        )}`;
        const { error } = await supabase.storage
          .from(PROFILE_MEDIA_BUCKET_NAME)
          .upload(nextPath, file, {
            cacheControl: "3600",
            contentType: file.type,
          });

        if (error) {
          event.target.value = "";
          setPreviewVideoDuration("");
          setPreviewVideoMimeType("");
          setPreviewVideoName("");
          setPreviewVideoPath("");
          setPreviewVideoUrl(activePreviewVideo?.media_url ?? "");
          setPreviewVideoStatus(activePreviewVideo ? "Current preview saved" : "");
          setPreviewVideoError(error.message || "Preview upload failed.");
          URL.revokeObjectURL(objectUrl);
          return;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from(PROFILE_MEDIA_BUCKET_NAME).getPublicUrl(nextPath);

        setPreviewVideoPath(nextPath);
        setPreviewVideoMimeType(file.type);
        setPreviewVideoUrl(publicUrl || objectUrl);
        setPreviewVideoStatus("Preview uploaded. Save profile to publish.");
        if (publicUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      } catch (error) {
        event.target.value = "";
        setPreviewVideoDuration("");
        setPreviewVideoMimeType("");
        setPreviewVideoName("");
        setPreviewVideoPath("");
        setPreviewVideoUrl(activePreviewVideo?.media_url ?? "");
        setPreviewVideoStatus(activePreviewVideo ? "Current preview saved" : "");
        setPreviewVideoError(
          error instanceof Error ? error.message : "Preview upload failed.",
        );
        URL.revokeObjectURL(objectUrl);
      } finally {
        setPreviewVideoUploading(false);
      }
    };
    video.onerror = () => {
      event.target.value = "";
      URL.revokeObjectURL(objectUrl);
      setPreviewVideoUrl(activePreviewVideo?.media_url ?? "");
      setPreviewVideoName("");
      setPreviewVideoStatus(activePreviewVideo ? "Current preview saved" : "");
      setPreviewVideoError("Could not read this video. Try another file.");
    };
    video.src = objectUrl;
  }

  const inputClass =
    "rounded-full border border-neutral-700 bg-black/40 px-5 py-3.5 text-white placeholder:text-neutral-400 transition-colors focus:border-emerald-300 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 md:px-6 md:py-4";
  const previewPublished =
    Boolean(previewVideoPath) &&
    state.success &&
    state.savedPreviewVideoPath === previewVideoPath;
  const submittedPreviewVideoDuration = previewPublished
    ? ""
    : previewVideoDuration;
  const submittedPreviewVideoMimeType = previewPublished
    ? ""
    : previewVideoMimeType;
  const submittedPreviewVideoPath = previewPublished ? "" : previewVideoPath;
  const displayedPreviewVideoStatus = previewPublished
    ? "Preview video saved"
    : previewVideoStatus;

  return (
    <form
      action={formAction}
      className="mt-6 grid gap-5 sm:grid-cols-2 md:mt-8"
      encType="multipart/form-data"
    >
      <div className="sm:col-span-2">
        <label
          htmlFor="avatar"
          className="flex min-h-44 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-neutral-700 bg-black/40 px-6 py-7 text-center transition-colors hover:border-neutral-500 md:min-h-52"
        >
          {avatarPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarPreview}
              alt="Avatar preview"
              className="h-32 w-32 rounded-full object-cover shadow-[0_0_35px_rgba(74,222,128,0.16)] md:h-36 md:w-36"
            />
          ) : (
            <>
              <p className="text-sm font-medium text-white">Upload avatar</p>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                JPG, PNG, WebP, or GIF under 5 MB
              </p>
            </>
          )}
          <span className="mt-4 rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-300">
            Replace photo
          </span>
        </label>
        <input
          id="avatar"
          name="avatar"
          type="file"
          accept="image/*"
          disabled={pending}
          onChange={handleAvatarChange}
          className="sr-only"
        />
        <p
          aria-live="polite"
          className="mt-3 min-h-5 text-sm text-red-300"
          role={avatarError ? "alert" : undefined}
        >
          {avatarError}
        </p>
      </div>

      <div className="sm:col-span-2 rounded-3xl border border-neutral-800 bg-black/35 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-white">Photos</p>
            <p className="mt-1 text-xs text-neutral-500">
              {galleryPhotoList.length}/{PROFILE_GALLERY_PHOTO_MAX_COUNT} photos
            </p>
          </div>
          <label
            htmlFor="gallery_photos"
            className={`inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              galleryPhotoList.length >= PROFILE_GALLERY_PHOTO_MAX_COUNT ||
              galleryUploading
                ? "pointer-events-none border-neutral-800 text-neutral-500"
                : "border-emerald-300/30 text-emerald-100 hover:bg-emerald-300/10"
            }`}
          >
            {galleryUploading ? "Uploading..." : "Add photo"}
          </label>
          <input
            id="gallery_photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={
              pending ||
              galleryUploading ||
              galleryPhotoList.length >= PROFILE_GALLERY_PHOTO_MAX_COUNT
            }
            onChange={handleGalleryPhotoChange}
            className="sr-only"
          />
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {galleryPhotoList.map((photo, index) => (
            <div
              key={photo.id}
              className="group relative aspect-square overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.media_url}
                alt={`Profile photo ${index + 1}`}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-x-1 bottom-1 flex flex-wrap justify-center gap-1 rounded-xl bg-black/70 p-1 opacity-100 backdrop-blur sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                <button
                  type="button"
                  aria-label="Move photo earlier"
                  disabled={galleryBusyId === photo.id || index === 0}
                  onClick={() => void moveGalleryPhoto(photo.id, -1)}
                  className="min-h-8 min-w-8 rounded-full border border-white/10 px-2 text-xs text-white disabled:opacity-35"
                >
                  ←
                </button>
                <button
                  type="button"
                  disabled={galleryBusyId === photo.id}
                  onClick={() => void handleSetGalleryAvatar(photo)}
                  className="min-h-8 rounded-full border border-white/10 px-2 text-[11px] text-white disabled:opacity-35"
                >
                  Avatar
                </button>
                <button
                  type="button"
                  aria-label="Move photo later"
                  disabled={
                    galleryBusyId === photo.id ||
                    index === galleryPhotoList.length - 1
                  }
                  onClick={() => void moveGalleryPhoto(photo.id, 1)}
                  className="min-h-8 min-w-8 rounded-full border border-white/10 px-2 text-xs text-white disabled:opacity-35"
                >
                  →
                </button>
                <button
                  type="button"
                  disabled={galleryBusyId === photo.id}
                  onClick={() => void handleRemoveGalleryPhoto(photo)}
                  className="min-h-8 rounded-full border border-red-300/25 px-2 text-[11px] text-red-100 disabled:opacity-35"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          {Array.from({
            length: PROFILE_GALLERY_PHOTO_MAX_COUNT - galleryPhotoList.length,
          }).map((_, index) => (
            <label
              key={`empty-gallery-slot-${index}`}
              htmlFor="gallery_photos"
              className="grid aspect-square cursor-pointer place-items-center rounded-2xl border border-dashed border-neutral-800 bg-white/[0.02] text-xs text-neutral-600 transition-colors hover:border-neutral-700 hover:text-neutral-400"
            >
              Add
            </label>
          ))}
        </div>

        <p
          aria-live="polite"
          className={`mt-3 min-h-5 text-sm ${
            galleryActionStatus === "success" ? "text-emerald-200" : "text-red-300"
          }`}
          role={galleryActionMessage ? "alert" : undefined}
        >
          {galleryActionMessage}
        </p>
      </div>

      <div className="sm:col-span-2">
        <label
          htmlFor="preview_video"
          className="flex min-h-44 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-emerald-300/20 bg-emerald-300/10 px-6 py-7 text-center transition-colors hover:border-emerald-300/40 md:min-h-52"
        >
          {previewVideoUrl ? (
            <video
              src={previewVideoUrl}
              muted
              loop
              playsInline
              preload="metadata"
              className="h-36 w-full max-w-xs rounded-2xl object-cover shadow-[0_0_35px_rgba(74,222,128,0.12)]"
            />
          ) : (
            <>
              <p className="text-sm font-medium text-white">Preview video</p>
              <p className="mt-2 text-sm leading-6 text-neutral-300">
                Upload a 10-15s teaser
              </p>
              <p className="mt-1 text-xs text-emerald-100/70">
                Shown on your profile
              </p>
            </>
          )}
          <span className="mt-4 rounded-full border border-emerald-300/25 px-4 py-2 text-xs text-emerald-100">
            {previewVideoUrl ? "Replace preview" : "Add preview"}
          </span>
        </label>
        <input
          id="preview_video"
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          disabled={pending}
          onChange={handlePreviewVideoChange}
          className="sr-only"
        />
        <input
          name="preview_video_path"
          type="hidden"
          value={submittedPreviewVideoPath}
        />
        <input
          name="preview_video_duration"
          type="hidden"
          value={submittedPreviewVideoDuration}
        />
        <input
          name="preview_video_mime_type"
          type="hidden"
          value={submittedPreviewVideoMimeType}
        />
        {previewVideoName || displayedPreviewVideoStatus ? (
          <div className="mt-3 rounded-2xl border border-emerald-300/15 bg-black/30 px-4 py-3 text-left">
            {previewVideoName ? (
              <p className="truncate text-sm font-medium text-emerald-50">
                {previewVideoName}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-emerald-100/75">
              {previewVideoUploading
                ? "Uploading preview..."
                : displayedPreviewVideoStatus || "Preview ready"}
            </p>
            {previewVideoDuration ? (
              <p className="mt-1 text-xs text-neutral-500">
                Duration checked: {Number(previewVideoDuration).toFixed(1)}s
              </p>
            ) : null}
          </div>
        ) : null}
        <p
          aria-live="polite"
          className="mt-3 min-h-5 text-sm text-red-300"
          role={previewVideoError ? "alert" : undefined}
        >
          {previewVideoError}
        </p>
      </div>

      <label className="sr-only" htmlFor="display_name">
        Display name
      </label>
      <input
        id="display_name"
        name="display_name"
        required
        disabled={pending}
        placeholder="Display name"
        defaultValue={profile.display_name}
        className={inputClass}
      />

      <label className="sr-only" htmlFor="age">
        Age
      </label>
      <input
        id="age"
        name="age"
        type="number"
        min={18}
        max={120}
        required
        disabled={pending}
        placeholder="Age"
        defaultValue={profile.age}
        className={inputClass}
      />

      <label className="sr-only" htmlFor="gender">
        Gender
      </label>
      <select
        id="gender"
        name="gender"
        required
        disabled={pending}
        className={inputClass}
        defaultValue={profile.gender}
      >
        <option>Woman</option>
        <option>Man</option>
        <option>Non-binary</option>
        <option>Prefer to self-describe</option>
      </select>

      <label className="sr-only" htmlFor="gender_identity">
        Gender identity
      </label>
      <select
        id="gender_identity"
        name="gender_identity"
        disabled={pending}
        className={inputClass}
        defaultValue={profile.gender_identity ?? ""}
      >
        <option value="">Gender identity optional</option>
        {GENDER_IDENTITY_OPTIONS.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>

      <label className="sr-only" htmlFor="pronouns">
        Pronouns
      </label>
      <select
        id="pronouns"
        name="pronouns"
        disabled={pending}
        className={inputClass}
        defaultValue={profile.pronouns ?? ""}
      >
        <option value="">Pronouns optional</option>
        {PRONOUN_OPTIONS.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>

      <label className="sr-only" htmlFor="sexual_orientation">
        Sexual orientation
      </label>
      <select
        id="sexual_orientation"
        name="sexual_orientation"
        disabled={pending}
        className={inputClass}
        defaultValue={profile.sexual_orientation ?? ""}
      >
        <option value="">Sexual orientation optional</option>
        {SEXUAL_ORIENTATION_OPTIONS.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>

      <label className="sr-only" htmlFor="interested_in">
        Interested in
      </label>
      <select
        id="interested_in"
        name="interested_in"
        required
        disabled={pending}
        className={inputClass}
        defaultValue={profile.interested_in}
      >
        <option>Women</option>
        <option>Men</option>
        <option>Everyone</option>
        <option>Still exploring</option>
      </select>

      <label className="sr-only" htmlFor="occupation">
        Occupation
      </label>
      <input
        id="occupation"
        name="occupation"
        required
        disabled={pending}
        placeholder="Occupation"
        defaultValue={profile.occupation}
        className={inputClass}
      />

      <label className="sr-only" htmlFor="relationship_intent">
        Relationship intent
      </label>
      <select
        id="relationship_intent"
        name="relationship_intent"
        required
        disabled={pending}
        className={inputClass}
        defaultValue={profile.relationship_intent}
      >
        <option>Long-term relationship</option>
        <option>Intentional dating</option>
        <option>Something casual</option>
        <option>Open to exploring</option>
      </select>

      <label className="sr-only" htmlFor="location">
        Location
      </label>
      <input
        id="location"
        name="location"
        required
        disabled={pending}
        placeholder="Location"
        defaultValue={profile.location}
        className={`${inputClass} sm:col-span-2`}
      />

      <label className="sr-only" htmlFor="country">
        Country
      </label>
      <input
        id="country"
        name="country"
        disabled={pending}
        placeholder="Country"
        defaultValue={profile.country ?? ""}
        className={inputClass}
      />

      <label className="sr-only" htmlFor="country_flag">
        Country flag
      </label>
      <input
        id="country_flag"
        name="country_flag"
        disabled={pending}
        placeholder="Country flag"
        defaultValue={profile.country_flag ?? ""}
        className={inputClass}
      />

      <label className="sr-only" htmlFor="height">
        Height
      </label>
      <input
        id="height"
        name="height"
        disabled={pending}
        placeholder="Height"
        defaultValue={profile.height ?? ""}
        className={inputClass}
      />

      <label className="sr-only" htmlFor="weight">
        Weight
      </label>
      <input
        id="weight"
        name="weight"
        disabled={pending}
        placeholder="Weight"
        defaultValue={profile.weight ?? ""}
        className={inputClass}
      />

      <label className="sr-only" htmlFor="body_type">
        Body type
      </label>
      <select
        id="body_type"
        name="body_type"
        disabled={pending}
        className={inputClass}
        defaultValue={profile.body_type ?? ""}
      >
        <option value="">Body type</option>
        <option>Lean</option>
        <option>Athletic</option>
        <option>Average</option>
        <option>Curvy</option>
        <option>Full-figured</option>
        <option>Prefer not to say</option>
      </select>

      <label className="sr-only" htmlFor="relationship_status">
        Relationship status
      </label>
      <select
        id="relationship_status"
        name="relationship_status"
        disabled={pending}
        className={inputClass}
        defaultValue={profile.relationship_status ?? ""}
      >
        <option value="">Relationship status</option>
        <option>Single</option>
        <option>Separated</option>
        <option>Divorced</option>
        <option>Widowed</option>
        <option>It&apos;s complicated</option>
      </select>

      <label className="sr-only" htmlFor="looking_for">
        Looking for
      </label>
      <input
        id="looking_for"
        name="looking_for"
        disabled={pending}
        placeholder="Looking for"
        defaultValue={profile.looking_for ?? ""}
        className={`${inputClass} sm:col-span-2`}
      />

      <label className="sr-only" htmlFor="drinking">
        Drinking
      </label>
      <select
        id="drinking"
        name="drinking"
        disabled={pending}
        className={inputClass}
        defaultValue={profile.drinking ?? ""}
      >
        <option value="">Drinking</option>
        <option>Never</option>
        <option>Sometimes</option>
        <option>Socially</option>
        <option>Often</option>
        <option>Prefer not to say</option>
      </select>

      <label className="sr-only" htmlFor="smoking">
        Smoking
      </label>
      <select
        id="smoking"
        name="smoking"
        disabled={pending}
        className={inputClass}
        defaultValue={profile.smoking ?? ""}
      >
        <option value="">Smoking</option>
        <option>Never</option>
        <option>Sometimes</option>
        <option>Socially</option>
        <option>Often</option>
        <option>Prefer not to say</option>
      </select>

      <label className="flex items-center gap-3 rounded-3xl border border-neutral-700 bg-black/40 px-5 py-4 text-sm text-neutral-200">
        <input
          name="accepting_dating"
          type="checkbox"
          defaultChecked={profile.accepting_dating}
          disabled={pending}
          className="h-4 w-4 accent-emerald-300"
        />
        Accepting dating
      </label>

      <label className="flex items-center gap-3 rounded-3xl border border-neutral-700 bg-black/40 px-5 py-4 text-sm text-neutral-200">
        <input
          name="open_to_long_distance"
          type="checkbox"
          defaultChecked={profile.open_to_long_distance}
          disabled={pending}
          className="h-4 w-4 accent-emerald-300"
        />
        Open to long distance
      </label>

      <label className="flex items-center gap-3 rounded-3xl border border-neutral-700 bg-black/40 px-5 py-4 text-sm text-neutral-200">
        <input
          name="show_gender_on_profile"
          type="checkbox"
          defaultChecked={profile.show_gender_on_profile}
          disabled={pending}
          className="h-4 w-4 accent-emerald-300"
        />
        Show gender identity on profile
      </label>

      <label className="flex items-center gap-3 rounded-3xl border border-neutral-700 bg-black/40 px-5 py-4 text-sm text-neutral-200">
        <input
          name="show_orientation_on_profile"
          type="checkbox"
          defaultChecked={profile.show_orientation_on_profile}
          disabled={pending}
          className="h-4 w-4 accent-emerald-300"
        />
        Show sexual orientation on profile
      </label>

      <label className="sr-only" htmlFor="interests">
        Interests
      </label>
      <input
        id="interests"
        name="interests"
        required
        disabled={pending}
        placeholder="Interests, separated by commas"
        defaultValue={profile.interests.join(", ")}
        className={`${inputClass} sm:col-span-2`}
      />

      <label className="sr-only" htmlFor="bio">
        Bio
      </label>
      <textarea
        id="bio"
        name="bio"
        required
        maxLength={500}
        disabled={pending}
        placeholder="Bio"
        defaultValue={profile.bio}
        className="min-h-32 rounded-3xl border border-neutral-700 bg-black/40 px-5 py-4 text-white placeholder:text-neutral-400 transition-colors focus:border-emerald-300 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2 md:px-6"
      />

      <p
        aria-live="polite"
        className={`min-h-5 text-sm sm:col-span-2 ${
          state.success ? "text-emerald-200" : "text-red-300"
        }`}
        role={state.message ? "alert" : undefined}
      >
        {state.message}
      </p>

      <button
        type="submit"
        disabled={
          pending ||
          galleryUploading ||
          previewVideoUploading ||
          Boolean(avatarError) ||
          Boolean(previewVideoError)
        }
        className="rounded-full bg-white px-8 py-4 text-base font-medium text-black transition-all duration-300 hover:scale-[1.02] hover:bg-neutral-200 hover:shadow-[0_0_35px_rgba(255,255,255,0.12)] disabled:cursor-not-allowed disabled:scale-100 disabled:bg-neutral-300 sm:col-span-2"
      >
        {galleryUploading
          ? "Uploading photos..."
          : previewVideoUploading
          ? "Uploading preview..."
          : pending
            ? "Saving profile..."
            : "Save profile"}
      </button>
    </form>
  );
}
