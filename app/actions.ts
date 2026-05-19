"use server";

import { insertWaitlistEmail } from "@/lib/supabase";

export async function joinWaitlist(formData: FormData) {
  const email = formData.get("email");

  if (typeof email !== "string") {
    return;
  }

  await insertWaitlistEmail(email);
}
