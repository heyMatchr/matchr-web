export type ConversationTone = "Playful" | "Smooth" | "Bold" | "Sweet" | "Funny";

export type ConversationSuggestionContext = {
  isFirstMessage: boolean;
  isRevive: boolean;
  receiverName?: string;
};

const toneTemplates: Record<ConversationTone, string[]> = {
  Playful: [
    "Okay, important question: coffee date or spontaneous adventure?",
    "Your profile made me pause. What should I know first?",
    "I was going to say hi normally, but that felt too easy.",
    "You seem fun. Should I be nervous or impressed?",
  ],
  Smooth: [
    "I like your vibe. What is something you are excited about this week?",
    "You seem easy to talk to, so I figured I should start.",
    "Your profile has good energy. What are you usually like on a first date?",
    "I wanted to say hello before someone else said it better.",
  ],
  Bold: [
    "I have a feeling we would have a very good conversation.",
    "You caught my attention. Want to see if the chemistry is real?",
    "I am skipping the small talk: what would make this chat memorable?",
    "I think we might get along a little too well.",
  ],
  Sweet: [
    "Hi, you seem genuinely lovely. How is your day going?",
    "Your smile has a really warm energy. What made you laugh today?",
    "I wanted to send something simple: I am glad we matched.",
    "You seem like someone with a good heart. What is your favorite small joy?",
  ],
  Funny: [
    "Give me your most honest review of this opener, one to ten.",
    "I promise I am more charming after the first message.",
    "I had three openers prepared and somehow this is the least awkward one.",
    "Quick, pretend I said something effortlessly witty.",
  ],
};

const reviveTemplates: Record<ConversationTone, string[]> = {
  Playful: [
    "You disappeared on me. Should I be impressed by the mystery?",
    "I was waiting for your comeback.",
    "Still thinking of what to say?",
  ],
  Smooth: [
    "I was enjoying this. Want to pick it back up?",
    "No pressure, but I would not mind hearing from you again.",
    "I feel like this conversation still has a little spark left.",
  ],
  Bold: [
    "I am calling it: this chat deserves a second round.",
    "Your turn. I am curious what you come back with.",
    "I am still interested. Want to keep going?",
  ],
  Sweet: [
    "Hope your day has been kind to you. Want to catch up?",
    "I thought of you and figured I would say hi again.",
    "No rush, just wanted to reopen the door.",
  ],
  Funny: [
    "This is me dramatically reviving the chat.",
    "Should I send a search party or just a better question?",
    "I blinked and our conversation took a tiny vacation.",
  ],
};

const unsafePatterns = [
  /\bunderage\b/i,
  /\bminor\b/i,
  /\bcoerce\b/i,
  /\bforce\b/i,
  /\bexplicit\b/i,
  /\bnude\b/i,
  /\bsex\b/i,
];

function passesSafety(text: string) {
  return !unsafePatterns.some((pattern) => pattern.test(text));
}

export function getConversationSuggestions(
  context: ConversationSuggestionContext,
  tone: ConversationTone,
) {
  const templates = context.isRevive ? reviveTemplates[tone] : toneTemplates[tone];
  const receiverName = context.receiverName?.trim().split(" ")[0] ?? "";

  return templates
    .map((template) =>
      receiverName && context.isFirstMessage && tone !== "Funny"
        ? template.replace("Your profile", `${receiverName}, your profile`)
        : template,
    )
    .filter(passesSafety)
    .slice(0, 3);
}
