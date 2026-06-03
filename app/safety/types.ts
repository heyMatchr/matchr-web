import { SAFETY_REPORT_REASONS } from "@/lib/safety-moderation";

export const REPORT_REASONS = SAFETY_REPORT_REASONS;

export type ReportFormState = {
  message: string;
  success: boolean;
};

export type ReportTarget = {
  targetMessageId?: string;
  targetMomentId?: string;
  targetStoryId?: string;
  targetUserId?: string;
};
