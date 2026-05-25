import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/app/_components/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { saveSettings } from "./actions";
import { BrowserNotificationSettings } from "./browser-notification-settings";

const defaults = {
  allow_gifts: true,
  allow_profile_views: true,
  allow_story_replies: true,
  distance_preference: 50,
  dm_permissions: "matches_only",
  gender_preference: "any",
  gift_notifications: true,
  hide_followers_count: false,
  hide_following_count: false,
  hide_moments_likes: false,
  hide_online_status: false,
  hide_read_receipts: false,
  match_notifications: true,
  max_age_preference: 99,
  message_notifications: true,
  min_age_preference: 18,
  private_profile: false,
  push_notifications: false,
  relationship_intent_preference: "",
  show_in_discover: true,
  story_notifications: true,
};

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/settings");
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const [
    settingsResult,
    blocksResult,
    reportsResult,
    mutedResult,
    hiddenResult,
    walletResult,
    premiumResult,
  ] = await Promise.all([
    supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("blocks").select("blocked_user_id, created_at").eq("blocker_id", user.id),
    supabase.from("user_reports").select("reported_user_id, category, status, created_at").eq("reporter_id", user.id).order("created_at", { ascending: false }),
    supabase.from("muted_users").select("muted_user_id, created_at").eq("muter_id", user.id),
    supabase.from("hidden_users").select("hidden_user_id, created_at").eq("hider_id", user.id),
    supabase.from("user_wallets").select("gold_balance").eq("user_id", user.id).maybeSingle(),
    supabase.from("premium_subscriptions").select("plan_name, status, price_usd, interval, expires_at").eq("user_id", user.id).maybeSingle(),
  ]);
  const settings = { ...defaults, ...(settingsResult.data ?? {}) };
  const relatedIds = [
    ...(blocksResult.data?.map((row) => row.blocked_user_id) ?? []),
    ...(mutedResult.data?.map((row) => row.muted_user_id) ?? []),
    ...(hiddenResult.data?.map((row) => row.hidden_user_id) ?? []),
    ...(reportsResult.data?.map((row) => row.reported_user_id) ?? []),
  ];
  const { data: relatedProfiles } = relatedIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", [...new Set(relatedIds)])
    : { data: [] };
  const profilesById = new Map(relatedProfiles?.map((profile) => [profile.id, profile]));

  return (
    <AppShell currentUserId={user.id} profileId={currentProfile.id} title="Settings">
      <form action={saveSettings} className="mt-6 grid gap-5 md:mt-8">
        <SettingsSection title="Privacy">
          <Toggle defaultChecked={settings.private_profile} name="private_profile" title="Private profile" />
          <Toggle defaultChecked={settings.hide_online_status} name="hide_online_status" title="Hide online status" />
          <Toggle defaultChecked={settings.hide_read_receipts} name="hide_read_receipts" title="Hide read receipts" />
          <Toggle defaultChecked={settings.hide_followers_count} name="hide_followers_count" title="Hide followers count" />
          <Toggle defaultChecked={settings.hide_following_count} name="hide_following_count" title="Hide following count" />
          <Toggle defaultChecked={settings.hide_moments_likes} name="hide_moments_likes" title="Hide moments likes" />
          <Toggle defaultChecked={settings.allow_story_replies} name="allow_story_replies" title="Allow story replies" />
          <Toggle defaultChecked={settings.allow_gifts} name="allow_gifts" title="Allow gifts" />
          <Toggle defaultChecked={settings.allow_profile_views} name="allow_profile_views" title="Allow profile views" />
          <Select defaultValue={settings.dm_permissions} label="Accept DMs from" name="dm_permissions" options={["everyone", "followers_only", "matches_only"]} />
        </SettingsSection>

        <SettingsSection title="Discovery">
          <Toggle defaultChecked={settings.show_in_discover} name="show_in_discover" title="Show me in Discover" />
          <NumberInput defaultValue={settings.distance_preference} label="Distance preference" name="distance_preference" />
          <NumberInput defaultValue={settings.min_age_preference} label="Minimum age" name="min_age_preference" />
          <NumberInput defaultValue={settings.max_age_preference} label="Maximum age" name="max_age_preference" />
          <Select defaultValue={settings.gender_preference} label="Gender preference" name="gender_preference" options={["any", "women", "men", "nonbinary"]} />
          <input
            name="relationship_intent_preference"
            defaultValue={settings.relationship_intent_preference ?? ""}
            placeholder="Relationship intent preference"
            className="rounded-2xl border border-neutral-800 bg-black px-4 py-3 text-white placeholder:text-neutral-500"
          />
        </SettingsSection>

        <SettingsSection title="Notifications">
          <BrowserNotificationSettings />
          <Toggle defaultChecked={settings.push_notifications} name="push_notifications" title="Push notifications placeholder" />
          <Toggle defaultChecked={settings.story_notifications} name="story_notifications" title="Story notifications" />
          <Toggle defaultChecked={settings.message_notifications} name="message_notifications" title="Message notifications" />
          <Toggle defaultChecked={settings.gift_notifications} name="gift_notifications" title="Gift notifications" />
          <Toggle defaultChecked={settings.match_notifications} name="match_notifications" title="Match notifications" />
        </SettingsSection>

        <button className="rounded-full bg-white px-6 py-3 font-medium text-black transition-colors hover:bg-neutral-200">
          Save settings
        </button>
      </form>

      <div className="mt-6 grid gap-5">
        <SettingsSection title="Safety">
          <SafetyList title="Blocked users" rows={blocksResult.data ?? []} idKey="blocked_user_id" profilesById={profilesById} />
          <SafetyList title="Muted chats" rows={mutedResult.data ?? []} idKey="muted_user_id" profilesById={profilesById} />
          <SafetyList title="Hidden users" rows={hiddenResult.data ?? []} idKey="hidden_user_id" profilesById={profilesById} />
          <div className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4">
            <p className="font-black">Report history</p>
            <div className="mt-3 grid gap-2">
              {reportsResult.data?.length ? reportsResult.data.map((report) => {
                const profile = profilesById.get(report.reported_user_id);
                return (
                  <div key={`${report.reported_user_id}-${report.created_at}`} className="rounded-xl bg-black/40 p-3 text-sm text-neutral-300">
                    {profile?.display_name ?? "Reported user"} · {report.category} · {report.status}
                  </div>
                );
              }) : <p className="text-sm text-neutral-500">No reports submitted.</p>}
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title="Premium">
          <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/10 p-4">
            <p className="text-sm text-neutral-400">Current plan</p>
            <p className="mt-1 text-2xl font-black">{premiumResult.data?.plan_name ?? "Free"}</p>
            <p className="mt-1 text-sm text-neutral-400">{walletResult.data?.gold_balance ?? 0} gold</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/wallet" className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black">Wallet</Link>
              <button className="rounded-full border border-emerald-200/30 px-4 py-2 text-sm text-emerald-100">Upgrade placeholder</button>
              <button className="rounded-full border border-emerald-200/30 px-4 py-2 text-sm text-emerald-100">Buy gold placeholder</button>
            </div>
          </div>
          {["Cheaper messages", "Profile boost", "Advanced filters", "Unlimited story viewers", "Read insights", "Profile analytics", "Priority discover ranking"].map((perk) => (
            <div key={perk} className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-300">{perk}</div>
          ))}
        </SettingsSection>
      </div>
    </AppShell>
  );
}

function SettingsSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="rounded-3xl border border-neutral-800 bg-black/50 p-5">
      <h2 className="text-lg font-black">{title}</h2>
      <div className="mt-4 grid gap-3">{children}</div>
    </section>
  );
}

function Toggle({ defaultChecked, name, title }: { defaultChecked: boolean; name: string; title: string }) {
  return (
    <label className="flex items-center justify-between rounded-2xl border border-neutral-800 bg-white/[0.03] px-4 py-3 text-sm text-neutral-200">
      {title}
      <input name={name} type="checkbox" defaultChecked={defaultChecked} className="h-5 w-5 accent-emerald-300" />
    </label>
  );
}

function Select({ defaultValue, label, name, options }: { defaultValue: string; label: string; name: string; options: string[] }) {
  return (
    <label className="text-sm text-neutral-400">
      {label}
      <select name={name} defaultValue={defaultValue} className="mt-2 w-full rounded-2xl border border-neutral-800 bg-black px-4 py-3 text-white">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function NumberInput({ defaultValue, label, name }: { defaultValue: number; label: string; name: string }) {
  return (
    <label className="text-sm text-neutral-400">
      {label}
      <input name={name} type="number" defaultValue={defaultValue} className="mt-2 w-full rounded-2xl border border-neutral-800 bg-black px-4 py-3 text-white" />
    </label>
  );
}

function SafetyList({
  idKey,
  profilesById,
  rows,
  title,
}: {
  idKey: string;
  profilesById: Map<string, { avatar_url: string | null; display_name: string; id: string }>;
  rows: Record<string, string>[];
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4">
      <p className="font-black">{title}</p>
      <div className="mt-3 grid gap-2">
        {rows.length ? rows.map((row) => {
          const profile = profilesById.get(row[idKey]);
          return (
            <div key={`${row[idKey]}-${row.created_at}`} className="rounded-xl bg-black/40 p-3 text-sm text-neutral-300">
              {profile?.display_name ?? "User"} · {new Date(row.created_at).toLocaleDateString()}
            </div>
          );
        }) : <p className="text-sm text-neutral-500">Nothing here yet.</p>}
      </div>
    </div>
  );
}
