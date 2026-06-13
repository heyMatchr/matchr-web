export type MomentFormState = {
  message: string;
};

export type GiftActionState = {
  giftTransactionId?: string | null;
  message: string;
  status: "error" | "success";
  streakDays?: number | null;
};
