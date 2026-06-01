"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { AVATAR_MAX_SIZE_BYTES } from "@/lib/supabase/storage";
import { saveOnboarding, type OnboardingFormState } from "./actions";

const initialState: OnboardingFormState = {
  message: "",
};

const introSlides = [
  {
    body: "Connect, chat, flirt, or explore without being forced into one kind of experience.",
    title: "Private conversations, on your terms.",
  },
  {
    body: "matchr supports attention, conversation, creator interaction, friendship, entertainment, and private discovery.",
    title: "More than a dating app.",
  },
  {
    body: "Send gifts, receive attention, support creators, and build meaningful interactions inside a private space.",
    title: "Attention can be rewarding.",
  },
  {
    body: "Control how you appear, who you connect with, and how much you choose to share.",
    title: "Your privacy stays central.",
  },
  {
    body: "Set up only what is needed now. You can update the rest later.",
    title: "Start simple.",
  },
];

const identityOptions = [
  {
    label: "Man",
  },
  {
    label: "Woman",
  },
  {
    helper:
      "Includes gay, lesbian, bisexual, transgender, queer, non-binary, and other identity communities.",
    label: "LGBTQ+ Community",
  },
  {
    label: "Prefer not to say",
  },
];

const intentOptions = [
  "Conversation",
  "Friendship",
  "Flirting",
  "Creator Interaction",
  "Entertainment",
  "Networking",
  "Exploration",
];

const onboardingAvatarAllowedTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const invalidAvatarMessage =
  "Please upload a JPG, PNG, or WebP image under the allowed size.";

export function OnboardingForm() {
  const [avatarError, setAvatarError] = useState("");
  const [avatarPreview, setAvatarPreview] = useState("");
  const [onboardingValues, setOnboardingValues] = useState({
    displayName: "",
    identity: "",
    selectedIntents: [] as string[],
  });
  const [step, setStep] = useState(0);
  const identityInputRef = useRef<HTMLInputElement>(null);
  const displayNameInputRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(
    saveOnboarding,
    initialState,
  );
  const { displayName, identity, selectedIntents } = onboardingValues;
  const totalSteps = introSlides.length + 4;
  const isIntro = step < introSlides.length;
  const currentIntro = introSlides[step];
  const stepLabel = useMemo(() => {
    if (isIntro) return `${step + 1} / ${introSlides.length}`;
    return `${step - introSlides.length + 1} / 4`;
  }, [isIntro, step]);

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

    if (
      !onboardingAvatarAllowedTypes.includes(
        file.type as (typeof onboardingAvatarAllowedTypes)[number],
      )
    ) {
      event.target.value = "";
      setAvatarError(invalidAvatarMessage);
      setAvatarPreview("");
      return;
    }

    if (file.size > AVATAR_MAX_SIZE_BYTES) {
      event.target.value = "";
      setAvatarError(invalidAvatarMessage);
      setAvatarPreview("");
      return;
    }

    setAvatarPreview(URL.createObjectURL(file));
  }

  function toggleIntent(intent: string) {
    setOnboardingValues((current) => ({
      ...current,
      selectedIntents: current.selectedIntents.includes(intent)
        ? current.selectedIntents.filter((item) => item !== intent)
        : [...current.selectedIntents, intent],
    }));
  }

  function handleSubmitCapture(event: FormEvent<HTMLFormElement>) {
    const trimmedDisplayName = onboardingValues.displayName.trim();

    if (identityInputRef.current) {
      identityInputRef.current.value = onboardingValues.identity;
    }

    if (displayNameInputRef.current) {
      displayNameInputRef.current.value = trimmedDisplayName;
    }

    if (!onboardingValues.identity || !trimmedDisplayName) {
      event.preventDefault();
      return;
    }
  }

  const canContinue =
    isIntro ||
    (step === introSlides.length && Boolean(identity)) ||
    (step === introSlides.length + 1 && displayName.trim().length > 0) ||
    step >= introSlides.length + 2;

  const panelClass =
    "rounded-[2rem] border border-white/10 bg-[#0B1F17]/80 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-7";

  return (
    <form
      action={formAction}
      className="mt-8"
      encType="multipart/form-data"
      onSubmitCapture={handleSubmitCapture}
    >
      <input ref={identityInputRef} name="gender" readOnly type="hidden" value={identity} />
      <input name="identity" readOnly type="hidden" value={identity} />
      <input
        ref={displayNameInputRef}
        name="display_name"
        readOnly
        type="hidden"
        value={displayName.trim()}
      />
      <input name="displayName" readOnly type="hidden" value={displayName.trim()} />
      {selectedIntents.map((intent) => (
        <input
          key={intent}
          name="relationship_intent"
          readOnly
          type="hidden"
          value={intent}
        />
      ))}
      <div className={panelClass}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#D4AF37]">
            Private. On your terms.
          </p>
          <p className="rounded-full border border-emerald-300/20 px-3 py-1 text-xs text-emerald-100">
            {stepLabel}
          </p>
        </div>

        <div className="mt-6">
          {isIntro ? (
            <section className="min-h-[21rem]">
              <div className="grid h-40 place-items-center rounded-[1.5rem] border border-emerald-300/15 bg-black/35">
                <div className="relative h-24 w-24 rounded-full border border-[#D4AF37]/40 bg-emerald-300/10 shadow-[0_0_70px_rgba(74,222,128,0.14)]">
                  <div className="absolute left-5 top-5 h-10 w-10 rounded-full bg-[#4ADE80]/70 blur-sm" />
                  <div className="absolute bottom-5 right-4 h-8 w-8 rounded-full bg-[#D4AF37]/80 blur-sm" />
                </div>
              </div>
              <h2 className="mt-6 text-3xl font-black tracking-tight text-white sm:text-4xl">
                {currentIntro.title}
              </h2>
              <p className="mt-4 text-base leading-7 text-neutral-300">
                {currentIntro.body}
              </p>
            </section>
          ) : null}

          {step === introSlides.length ? (
            <section>
              <h2 className="text-3xl font-black tracking-tight text-white">
                Choose how you want to enter.
              </h2>
              <p className="mt-3 text-base leading-7 text-neutral-300">
                This helps matchr shape your first experience. You control what
                appears publicly later.
              </p>
              <div className="mt-6 grid gap-3">
                {identityOptions.map((option) => (
                  <label
                    key={option.label}
                    className={`cursor-pointer rounded-3xl border px-5 py-4 transition-colors ${
                      identity === option.label
                        ? "border-emerald-300/50 bg-emerald-300/15"
                        : "border-white/10 bg-black/30 hover:border-emerald-300/25"
                    }`}
                  >
                    <input
                      checked={identity === option.label}
                      className="sr-only"
                      disabled={pending}
                      onChange={() =>
                        setOnboardingValues((current) => ({
                          ...current,
                          identity: option.label,
                        }))
                      }
                      type="radio"
                      value={option.label}
                    />
                    <span className="block font-black text-white">{option.label}</span>
                    {option.helper ? (
                      <span className="mt-2 block text-sm leading-6 text-neutral-300">
                        {option.helper}
                      </span>
                    ) : null}
                  </label>
                ))}
              </div>
            </section>
          ) : null}

          {step === introSlides.length + 1 ? (
            <section>
              <h2 className="text-3xl font-black tracking-tight text-white">
                What should people call you?
              </h2>
              <p className="mt-3 text-base leading-7 text-neutral-300">
                Use a display name. Not a full legal name, not a surname.
              </p>
              <label className="mt-6 block">
                <span className="sr-only">Display name</span>
                <input
                  autoComplete="nickname"
                  className="w-full rounded-full border border-neutral-700 bg-black/45 px-6 py-4 text-lg text-white placeholder:text-neutral-500 focus:border-emerald-300 focus:outline-none"
                  disabled={pending}
                  onChange={(event) =>
                    setOnboardingValues((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                  placeholder="Display name"
                  value={displayName}
                />
              </label>
            </section>
          ) : null}

          {step === introSlides.length + 2 ? (
            <section>
              <h2 className="text-3xl font-black tracking-tight text-white">
                What are you open to?
              </h2>
              <p className="mt-3 text-base leading-7 text-neutral-300">
                Optional. Pick anything that fits, or keep it broad for now.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {intentOptions.map((intent) => (
                  <label
                    key={intent}
                    className="flex items-center gap-3 rounded-3xl border border-white/10 bg-black/30 px-5 py-4 text-sm font-medium text-neutral-100"
                  >
                    <input
                      checked={selectedIntents.includes(intent)}
                      className="h-4 w-4 accent-emerald-300"
                      disabled={pending}
                      onChange={() => toggleIntent(intent)}
                      type="checkbox"
                      value={intent}
                    />
                    {intent}
                  </label>
                ))}
              </div>
            </section>
          ) : null}

          {step === introSlides.length + 3 ? (
            <section>
              <h2 className="text-3xl font-black tracking-tight text-white">
                Add a photo, or skip for now.
              </h2>
              <p className="mt-3 text-base leading-7 text-neutral-300">
                A photo helps, but it is not required to enter matchr.
              </p>
              <label
                htmlFor="avatar"
                className="mt-6 flex min-h-48 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[1.5rem] border border-dashed border-neutral-700 bg-black/40 px-6 py-8 text-center transition-colors hover:border-neutral-500"
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
                    <p className="text-base font-medium text-white">
                      Optional profile photo
                    </p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                      JPG, PNG, or WebP under 5 MB.
                    </p>
                  </>
                )}
              </label>
              <input
                accept="image/*"
                className="sr-only"
                disabled={pending}
                id="avatar"
                name="avatar"
                onChange={handleAvatarChange}
                type="file"
              />
              <p
                aria-live="polite"
                className="mt-3 min-h-5 text-sm text-red-300"
                role={avatarError ? "alert" : undefined}
              >
                {avatarError}
              </p>
            </section>
          ) : null}
        </div>

        <p
          aria-live="polite"
          className="mt-5 min-h-5 text-sm text-red-300"
          role={state.message ? "alert" : undefined}
        >
          {state.message}
        </p>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            className="rounded-full border border-white/10 px-5 py-3 text-sm font-medium text-neutral-300 transition-colors hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={pending || step === 0}
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            type="button"
          >
            Back
          </button>

          {step < totalSteps - 1 ? (
            <button
              className="rounded-full bg-white px-7 py-3 text-sm font-black text-black transition-all hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={pending || !canContinue}
              onClick={() =>
                setStep((current) => Math.min(totalSteps - 1, current + 1))
              }
              type="button"
            >
              Continue
            </button>
          ) : (
            <button
              className="rounded-full bg-white px-7 py-3 text-sm font-black text-black transition-all hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={pending || Boolean(avatarError) || !identity || !displayName.trim()}
              type="submit"
            >
              {pending ? "Opening matchr..." : "Enter matchr"}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
