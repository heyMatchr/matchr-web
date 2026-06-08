"use client";

import { useActionState, useEffect, useState } from "react";
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
  PROFILE_PREVIEW_VIDEO_ALLOWED_TYPES,
  PROFILE_PREVIEW_VIDEO_MAX_DURATION_SECONDS,
  PROFILE_PREVIEW_VIDEO_MAX_SIZE_BYTES,
} from "@/lib/supabase/storage";
import { updateProfile } from "./actions";
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

type ProfileEditFormProps = {
  activePreviewVideo?: ActiveProfilePreviewVideo | null;
  profile: EditableProfile;
};

const initialState: ProfileEditFormState = {
  message: "",
};

export function ProfileEditForm({
  activePreviewVideo,
  profile,
}: ProfileEditFormProps) {
  const [avatarError, setAvatarError] = useState("");
  const [avatarPreview, setAvatarPreview] = useState(profile.avatar_url ?? "");
  const [previewVideoDuration, setPreviewVideoDuration] = useState("");
  const [previewVideoError, setPreviewVideoError] = useState("");
  const [previewVideoUrl, setPreviewVideoUrl] = useState(
    activePreviewVideo?.media_url ?? "",
  );
  const [state, formAction, pending] = useActionState(
    updateProfile,
    initialState,
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

  function handlePreviewVideoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (previewVideoUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewVideoUrl);
    }

    setPreviewVideoDuration("");
    setPreviewVideoError("");

    if (!file) {
      setPreviewVideoUrl(activePreviewVideo?.media_url ?? "");
      return;
    }

    if (
      !PROFILE_PREVIEW_VIDEO_ALLOWED_TYPES.includes(
        file.type as (typeof PROFILE_PREVIEW_VIDEO_ALLOWED_TYPES)[number],
      )
    ) {
      event.target.value = "";
      setPreviewVideoUrl(activePreviewVideo?.media_url ?? "");
      setPreviewVideoError("Upload an MP4, WebM, or MOV preview video.");
      return;
    }

    if (file.size > PROFILE_PREVIEW_VIDEO_MAX_SIZE_BYTES) {
      event.target.value = "";
      setPreviewVideoUrl(activePreviewVideo?.media_url ?? "");
      setPreviewVideoError("Keep preview videos under 20 MB.");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = video.duration;
      setPreviewVideoDuration(String(duration));

      if (duration > PROFILE_PREVIEW_VIDEO_MAX_DURATION_SECONDS) {
        event.target.value = "";
        URL.revokeObjectURL(objectUrl);
        setPreviewVideoUrl(activePreviewVideo?.media_url ?? "");
        setPreviewVideoDuration("");
        setPreviewVideoError("Keep preview videos at 15 seconds or less.");
        return;
      }

      setPreviewVideoUrl(objectUrl);
    };
    video.onerror = () => {
      event.target.value = "";
      URL.revokeObjectURL(objectUrl);
      setPreviewVideoUrl(activePreviewVideo?.media_url ?? "");
      setPreviewVideoError("Could not read this video. Try another file.");
    };
    video.src = objectUrl;
  }

  const inputClass =
    "rounded-full border border-neutral-700 bg-black/40 px-5 py-3.5 text-white placeholder:text-neutral-400 transition-colors focus:border-emerald-300 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 md:px-6 md:py-4";

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
          name="preview_video"
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          disabled={pending}
          onChange={handlePreviewVideoChange}
          className="sr-only"
        />
        <input
          name="preview_video_duration"
          type="hidden"
          value={previewVideoDuration}
        />
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
        className="min-h-5 text-sm text-red-300 sm:col-span-2"
        role={state.message ? "alert" : undefined}
      >
        {state.message}
      </p>

      <button
        type="submit"
        disabled={pending || Boolean(avatarError) || Boolean(previewVideoError)}
        className="rounded-full bg-white px-8 py-4 text-base font-medium text-black transition-all duration-300 hover:scale-[1.02] hover:bg-neutral-200 hover:shadow-[0_0_35px_rgba(255,255,255,0.12)] disabled:cursor-not-allowed disabled:scale-100 disabled:bg-neutral-300 sm:col-span-2"
      >
        {pending ? "Saving profile..." : "Save profile"}
      </button>
    </form>
  );
}
