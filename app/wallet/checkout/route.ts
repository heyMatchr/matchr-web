import { redirect } from "next/navigation";
import { startGoldCheckout } from "../actions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();

  await startGoldCheckout(formData);

  redirect("/wallet?payment=processing");
}
