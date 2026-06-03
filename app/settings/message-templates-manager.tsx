"use client";

import { useActionState, useState } from "react";
import {
  MESSAGE_TEMPLATE_TONES,
  MESSAGE_TEMPLATE_VISIBILITIES,
} from "@/lib/message-templates";
import type { MessageTemplateRow } from "@/lib/supabase/types";
import { deleteMessageTemplate, saveMessageTemplate } from "./actions";
import type { MessageTemplateFormState } from "./message-template-types";

const initialState: MessageTemplateFormState = {
  message: "",
  status: "idle",
};

const emptyDraft = {
  id: "",
  message_text: "",
  price_gold: "",
  title: "",
  tone: "playful",
  visibility: "private",
};

type Draft = typeof emptyDraft;

export function MessageTemplatesManager({
  templates,
}: {
  templates: MessageTemplateRow[];
}) {
  const [state, formAction, pending] = useActionState(
    saveMessageTemplate,
    initialState,
  );
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  function updateDraft<Key extends keyof Draft>(key: Key, value: Draft[Key]) {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function editTemplate(template: MessageTemplateRow) {
    setDraft({
      id: template.id,
      message_text: template.message_text,
      price_gold: template.price_gold?.toString() ?? "",
      title: template.title,
      tone: template.tone,
      visibility: template.visibility,
    });
  }

  return (
    <section
      id="message-templates"
      className="rounded-3xl border border-neutral-800 bg-black/50 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">My Message Templates</h2>
          <p className="mt-2 text-[15px] leading-6 text-neutral-300">
            Saved chat lines.
          </p>
        </div>
        {draft.id ? (
          <button
            type="button"
            onClick={() => setDraft(emptyDraft)}
            className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-200"
          >
            New template
          </button>
        ) : null}
      </div>

      <form action={formAction} className="mt-5 grid gap-4">
        <input name="template_id" type="hidden" value={draft.id} />
        <label className="text-[15px] leading-6 text-neutral-300">
          Title
          <input
            name="title"
            value={draft.title}
            onChange={(event) => updateDraft("title", event.target.value)}
            placeholder="Late-night opener"
            maxLength={80}
            className="mt-2.5 w-full rounded-2xl border border-neutral-800 bg-black px-4 py-3 text-white placeholder:text-neutral-400"
          />
        </label>
        <label className="text-[15px] leading-6 text-neutral-300">
          Message
          <textarea
            name="message_text"
            value={draft.message_text}
            onChange={(event) =>
              updateDraft("message_text", event.target.value)
            }
            placeholder="You seem like trouble in the best way."
            maxLength={500}
            rows={4}
            className="mt-2.5 w-full resize-none rounded-2xl border border-neutral-800 bg-black px-4 py-3 text-white placeholder:text-neutral-400"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-[15px] leading-6 text-neutral-300">
            Tone
            <select
              name="tone"
              value={draft.tone}
              onChange={(event) => updateDraft("tone", event.target.value)}
              className="mt-2.5 w-full rounded-2xl border border-neutral-800 bg-black px-4 py-3 text-white"
            >
              {MESSAGE_TEMPLATE_TONES.map((tone) => (
                <option key={tone} value={tone}>
                  {tone}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[15px] leading-6 text-neutral-300">
            Visibility
            <select
              name="visibility"
              value={draft.visibility}
              onChange={(event) =>
                updateDraft("visibility", event.target.value)
              }
              className="mt-2.5 w-full rounded-2xl border border-neutral-800 bg-black px-4 py-3 text-white"
            >
              {MESSAGE_TEMPLATE_VISIBILITIES.map((visibility) => (
                <option key={visibility} value={visibility}>
                  {visibility.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[15px] leading-6 text-neutral-300">
            Pack price
            <input
              name="price_gold"
              type="number"
              min={0}
              value={draft.price_gold}
              onChange={(event) =>
                updateDraft("price_gold", event.target.value)
              }
              placeholder="Optional"
              className="mt-2.5 w-full rounded-2xl border border-neutral-800 bg-black px-4 py-3 text-white placeholder:text-neutral-400"
            />
          </label>
        </div>
        {state.message ? (
          <p
            className={`rounded-2xl border px-4 py-3 text-sm ${
              state.status === "success"
                ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
                : "border-red-300/20 bg-red-500/10 text-red-100"
            }`}
          >
            {state.message}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-white px-6 py-3 font-medium text-black transition-colors hover:bg-neutral-200 disabled:opacity-60"
        >
          {pending
            ? "Saving..."
            : draft.id
              ? "Save template"
              : "Create template"}
        </button>
      </form>

      <div className="mt-6 grid gap-3">
        {templates.length ? (
          templates.map((template) => (
            <article
              key={template.id}
              className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-black text-white">{template.title}</p>
                    <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[13px] text-emerald-100">
                      {template.tone}
                    </span>
                    <span className="rounded-full border border-neutral-700 px-2.5 py-1 text-[13px] text-neutral-300">
                      {template.visibility.replace("_", " ")}
                    </span>
                  </div>
                  <p className="mt-3 text-[15px] leading-6 text-neutral-200">
                    {template.message_text}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => editTemplate(template)}
                    className="rounded-full border border-emerald-300/25 px-3 py-2 text-sm text-emerald-100"
                  >
                    Edit
                  </button>
                  <form action={deleteMessageTemplate.bind(null, template.id)}>
                    <button
                      type="submit"
                      className="rounded-full border border-red-300/25 px-3 py-2 text-sm text-red-100"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 sm:p-5">
            <p className="font-black text-white">No saved templates yet</p>
            <p className="mt-2 text-[15px] leading-6 text-neutral-300">
              Start with one opener.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
