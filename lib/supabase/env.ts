export function requiredSupabaseEnv(name: "SUPABASE_URL" | "SUPABASE_ANON_KEY") {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required. Add it to .env.local.`);
  }

  return value;
}
