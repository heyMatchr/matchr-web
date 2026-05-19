"use client";

import { useActionState, useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import {
  AVATAR_ALLOWED_TYPES,
  AVATAR_MAX_SIZE_BYTES,
} from "@/lib/supabase/storage";
import { saveOnboarding, type OnboardingFormState } from "./actions";

const initialState: OnboardingFormState = {
  message: "",
};

export function OnboardingForm() {
  const [avatarError, setAvatarError] = useState("");
  const [avatarPreview, setAvatarPreview] = useState("");
  const [state, formAction, pending] = useActionState(
    saveOnboarding,
    initialState,
  );

  useEffect(() => {
    return () => {
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
    }

    setAvatarError("");

    if (!file) {
      setAvatarPreview("");
      return;
    }

    if (!AVATAR_ALLOWED_TYPES.includes(file.type as (typeof AVATAR_ALLOWED_TYPES)[number])) {
      event.target.value = "";
      setAvatarError("Upload a JPG, PNG, WebP, or GIF avatar.");
      setAvatarPreview("");
      return;
    }

    if (file.size > AVATAR_MAX_SIZE_BYTES) {
      event.target.value = "";
      setAvatarError("Keep your avatar under 5 MB.");
      setAvatarPreview("");
      return;
    }

    setAvatarPreview(URL.createObjectURL(file));
  }

  const inputClass =
    "rounded-full border border-neutral-700 bg-black/40 px-6 py-4 text-white placeholder:text-neutral-500 transition-colors focus:border-emerald-300 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <form
      action={formAction}
      className="mt-8 grid gap-4 sm:grid-cols-2"
      encType="multipart/form-data"
    >
      <div className="sm:col-span-2">
        <label
          htmlFor="avatar"
          className="flex min-h-48 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-neutral-700 bg-black/40 px-6 py-8 text-center transition-colors hover:border-neutral-500"
        >
          {avatarPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarPreview}
              alt="Avatar preview"
              className="h-36 w-36 rounded-full object-cover shadow-[0_0_35px_rgba(74,222,128,0.16)]"
            />
          ) : (
            <>
              <p className="text-sm font-medium text-white">Upload avatar</p>
              <p className="mt-2 text-sm text-neutral-500">
                JPG, PNG, WebP, or GIF under 5 MB
              </p>
            </>
          )}
        </label>
        <input
          id="avatar"
          name="avatar"
          type="file"
          accept="image/*"
          required
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

      <label className="sr-only" htmlFor="display_name">
        Display name
      </label>
      <input
        id="display_name"
        name="display_name"
        required
        disabled={pending}
        placeholder="Display name"
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
        defaultValue=""
      >
        <option value="" disabled>
          Gender
        </option>
        <option>Woman</option>
        <option>Man</option>
        <option>Non-binary</option>
        <option>Prefer to self-describe</option>
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
        defaultValue=""
      >
        <option value="" disabled>
          Interested in
        </option>
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
        defaultValue=""
      >
        <option value="" disabled>
          Relationship intent
        </option>
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
        className={`${inputClass} sm:col-span-2`}
      />

      <label className="sr-only" htmlFor="interests">
        Interests
      </label>
      <input
        id="interests"
        name="interests"
        required
        disabled={pending}
        placeholder="Interests, separated by commas"
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
        className="min-h-32 rounded-3xl border border-neutral-700 bg-black/40 px-6 py-4 text-white placeholder:text-neutral-500 transition-colors focus:border-emerald-300 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2"
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
        disabled={pending || Boolean(avatarError)}
        className="rounded-full bg-white px-8 py-4 text-lg font-medium text-black transition-all duration-300 hover:scale-105 hover:bg-neutral-200 hover:shadow-[0_0_35px_rgba(255,255,255,0.12)] disabled:cursor-not-allowed disabled:scale-100 disabled:bg-neutral-300 sm:col-span-2"
      >
        {pending ? "Uploading avatar..." : "Continue"}
      </button>
    </form>
  );
}
