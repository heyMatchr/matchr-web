export const MESSAGE_TEMPLATE_TONES = [
  "playful",
  "bold",
  "sweet",
  "funny",
  "intimate",
  "custom",
] as const;

export const MESSAGE_TEMPLATE_VISIBILITIES = [
  "private",
  "public",
  "creator_pack",
] as const;

export type MessageTemplateTone = (typeof MESSAGE_TEMPLATE_TONES)[number];
export type MessageTemplateVisibility =
  (typeof MESSAGE_TEMPLATE_VISIBILITIES)[number];

const unsafeTemplatePatterns = [
  /\bminor\b/i,
  /\bunderage\b/i,
  /\bteen\b/i,
  /\bcoerce\b/i,
  /\bforce\b/i,
  /\bthreaten\b/i,
  /\bblackmail\b/i,
  /\bexplicit\b/i,
  /\bnudes?\b/i,
  /\bnaked\b/i,
];

export function normalizeMessageTemplateTone(
  tone: string,
): MessageTemplateTone {
  return MESSAGE_TEMPLATE_TONES.includes(tone as MessageTemplateTone)
    ? (tone as MessageTemplateTone)
    : "custom";
}

export function normalizeMessageTemplateVisibility(
  visibility: string,
): MessageTemplateVisibility {
  return MESSAGE_TEMPLATE_VISIBILITIES.includes(
    visibility as MessageTemplateVisibility,
  )
    ? (visibility as MessageTemplateVisibility)
    : "private";
}

export function validateMessageTemplateContent({
  messageText,
  title,
}: {
  messageText: string;
  title: string;
}) {
  const trimmedTitle = title.trim();
  const trimmedMessage = messageText.trim();

  if (!trimmedTitle) {
    return "Add a title for this template.";
  }

  if (trimmedTitle.length > 80) {
    return "Template titles must stay under 80 characters.";
  }

  if (!trimmedMessage) {
    return "Write a message for this template.";
  }

  if (trimmedMessage.length > 500) {
    return "Templates must stay under 500 characters.";
  }

  const combined = `${trimmedTitle} ${trimmedMessage}`;
  if (unsafeTemplatePatterns.some((pattern) => pattern.test(combined))) {
    return "Keep templates flirty and safe. Explicit, coercive, or unsafe content is not allowed.";
  }

  return null;
}
