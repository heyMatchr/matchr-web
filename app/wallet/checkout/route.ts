import { redirect } from "next/navigation";
import { startGoldCheckout } from "../actions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  console.error("🚨 MATCHR WALLET CHECKOUT ROUTE ENTERED 🚨", {
    hasRequest: Boolean(request),
  });

  const formData = await request.formData();

  console.info("[WalletCheckoutRoute] form data read", {
    hasPackageId: Boolean(formData.get("package_id")),
    hasProviderKey: Boolean(formData.get("provider_key")),
    packageId: String(formData.get("package_id") ?? ""),
    providerKey: String(formData.get("provider_key") ?? ""),
  });

  await startGoldCheckout(formData);

  redirect("/wallet?payment=processing");
}
