"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Database, LogOut, Mail, Save, ShieldCheck, UserRound, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getProfileExperienceCopy } from "@/lib/user/profile-copy";
import {
  countProfilePreferences,
  PROFILE_PREFERENCE_TOTAL
} from "@/lib/user/profile-reminder";

interface Summary {
  ok?: boolean;
  available?: boolean;
  profile?: {
    managerId: string | null;
    publicName: string | null;
    email: string | null;
    emailVerified: boolean;
    locale: string;
    joinedAt: string;
  };
  activity?: {
    visits: number;
    activeSeconds: number;
    minileague: ModeStats;
    invincible: ModeStats;
    exhibitions: ModeStats;
  };
  preferences?: Record<string, unknown> | null;
  marketing?: Record<string, unknown> | null;
}

interface ModeStats {
  starts: number;
  completions: number;
  abandoned: number;
  matches: number;
}

interface SaveToast {
  kind: "success" | "error";
  title: string;
  body: string;
}

async function headers(): Promise<Record<string, string>> {
  const supabase = getSupabaseBrowserClient();
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

function duration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default function MyHomeAccount({
  locale,
  isAdmin,
  publicName,
  email
}: {
  locale: string;
  isAdmin: boolean;
  publicName: string;
  email?: string;
}) {
  const experienceCopy = getProfileExperienceCopy(locale);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<SaveToast | null>(null);
  const [preferences, setPreferences] = useState({
    countryCode: "",
    ageBand: "",
    gender: "",
    favouriteClub: "",
    favouriteCurrentPlayer: "",
    favouriteLegend: "",
    followedLeagues: "",
    preferredGameMode: "",
    discoverySource: "",
    preferredKitStyle: ""
  });

  async function load() {
    try {
      const response = await fetch("/api/account/home", { headers: await headers() });
      const data = (await response.json()) as Summary;
      setSummary(data);
      const value = data.preferences ?? {};
      setPreferences({
        countryCode: String(value.country_code ?? ""),
        ageBand: String(value.age_band ?? ""),
        gender: String(value.gender ?? ""),
        favouriteClub: String(value.favourite_club_code ?? ""),
        favouriteCurrentPlayer: String(value.favourite_current_player ?? ""),
        favouriteLegend: String(value.favourite_legend ?? ""),
        followedLeagues: Array.isArray(value.followed_leagues) ? value.followed_leagues.join(", ") : "",
        preferredGameMode: String(value.preferred_game_mode ?? ""),
        discoverySource: String(value.discovery_source ?? ""),
        preferredKitStyle: String(value.preferred_kit_style ?? "")
      });
    } catch {
      setSummary({ available: false });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function savePreferences(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/account/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await headers()) },
        body: JSON.stringify({
          ...preferences,
          followedLeagues: preferences.followedLeagues.split(",").map((value) => value.trim()).filter(Boolean)
        })
      });
      const result = (await response.json().catch(() => null)) as {
        reason?: string;
        preferences?: Record<string, unknown>;
      } | null;
      if (!response.ok) {
        setToast({
          kind: "error",
          title: experienceCopy.saveErrorTitle,
          body: result?.reason ?? experienceCopy.saveErrorBody
        });
        return;
      }
      if (result?.preferences) {
        setSummary((current) => current ? { ...current, preferences: result.preferences ?? null } : current);
      }
      setToast({
        kind: "success",
        title: experienceCopy.savedTitle,
        body: experienceCopy.savedBody
      });
      await load();
    } catch {
      setToast({
        kind: "error",
        title: experienceCopy.saveErrorTitle,
        body: experienceCopy.saveErrorBody
      });
    } finally {
      setSaving(false);
    }
  }

  async function updateCommunication(
    key: "emailOptIn" | "audienceInsightsOptIn",
    checked: boolean
  ) {
    try {
      const response = await fetch("/api/account/communications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await headers()) },
        body: JSON.stringify({ [key]: checked })
      });
      const result = (await response.json().catch(() => null)) as { reason?: string } | null;
      if (!response.ok) {
        setToast({
          kind: "error",
          title: experienceCopy.saveErrorTitle,
          body: result?.reason ?? experienceCopy.saveErrorBody
        });
        return;
      }
      setToast({
        kind: "success",
        title: experienceCopy.choiceSavedTitle,
        body: experienceCopy.choiceSavedBody
      });
      await load();
    } catch {
      setToast({
        kind: "error",
        title: experienceCopy.saveErrorTitle,
        body: experienceCopy.saveErrorBody
      });
    }
  }

  async function signOut() {
    await getSupabaseBrowserClient()?.auth.signOut();
    window.location.assign(`/${locale}`);
  }

  const activity = summary?.activity;
  const emailOptIn = summary?.marketing?.footyrush_email_opt_in === true;
  const audienceOptIn = summary?.preferences?.audience_insights_opt_in === true;
  const emailVerified = summary?.profile?.emailVerified ?? false;
  const preferenceCount = countProfilePreferences(summary?.preferences);
  const savedAt = typeof summary?.preferences?.updated_at === "string"
    ? new Date(summary.preferences.updated_at)
    : null;

  return (
    <>
      <div className="my-home-account-grid">
        <section className="personal-card account-identity-card">
          <p className="eyebrow">Your account</p>
          <div className="account-identity">
            <span className="registration-icon"><UserRound size={22} /></span>
            <div>
              <strong>{summary?.profile?.publicName ?? publicName}</strong>
              <span>{summary?.profile?.email ?? email ?? "No verified contact email"}</span>
              {summary?.profile?.joinedAt && (
                <small>Joined {new Date(summary.profile.joinedAt).toLocaleDateString()}</small>
              )}
            </div>
          </div>
          <div className="account-actions">
            {isAdmin && (
              <a className="secondary-button" href={`/${locale}/admin/users`}>
                <Database size={16} /> User database
              </a>
            )}
            <button className="secondary-button" type="button" onClick={signOut}>
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </section>

        <section className="personal-card">
          <p className="eyebrow">Time on the touchline</p>
          {summary === null ? (
            <p className="muted">Loading account statistics…</p>
          ) : !summary.available || !activity ? (
            <p className="muted">Account statistics are temporarily unavailable while the database upgrade completes.</p>
          ) : (
            <div className="account-stat-grid">
              <div><span>Active play time</span><strong>{duration(activity.activeSeconds)}</strong></div>
              <div><span>Visits</span><strong>{activity.visits}</strong></div>
              <div><span>Mini League</span><strong>{activity.minileague.completions}/{activity.minileague.starts}</strong><small>completed / started</small></div>
              <div><span>Invincible</span><strong>{activity.invincible.completions}/{activity.invincible.starts}</strong><small>completed / started</small></div>
              <div><span>Matches</span><strong>{activity.minileague.matches + activity.invincible.matches}</strong></div>
              <div><span>Exhibitions</span><strong>{activity.exhibitions.completions}</strong></div>
            </div>
          )}
        </section>
      </div>

      <form id="profile-preferences" className="personal-card preference-form" onSubmit={savePreferences}>
        <div className="preference-heading">
          <div>
            <p className="eyebrow">Make FootyRush yours</p>
            <h3>Optional football preferences</h3>
            <p>Share only what you want. Every field can be cleared later.</p>
            <div className="preference-completion">
              <span>{experienceCopy.progress(preferenceCount, PROFILE_PREFERENCE_TOTAL)}</span>
              <span className="preference-completion-track" aria-hidden="true">
                <span style={{ width: `${(preferenceCount / PROFILE_PREFERENCE_TOTAL) * 100}%` }} />
              </span>
            </div>
          </div>
          <ShieldCheck size={22} />
        </div>
        <div className="preference-grid">
          <label>Country
            <input maxLength={2} placeholder="GB" value={preferences.countryCode} onChange={(event) => setPreferences({ ...preferences, countryCode: event.target.value.toUpperCase() })} />
          </label>
          <label>Age band
            <select value={preferences.ageBand} onChange={(event) => setPreferences({ ...preferences, ageBand: event.target.value })}>
              <option value="">Not set</option><option value="under_18">Under 18</option><option value="18_24">18–24</option><option value="25_34">25–34</option><option value="35_44">35–44</option><option value="45_54">45–54</option><option value="55_plus">55+</option><option value="prefer_not">Prefer not to say</option>
            </select>
          </label>
          <label>Gender
            <select value={preferences.gender} onChange={(event) => setPreferences({ ...preferences, gender: event.target.value })}>
              <option value="">Not set</option><option value="woman">Woman</option><option value="man">Man</option><option value="non_binary">Non-binary</option><option value="self_describe">Self describe</option><option value="prefer_not">Prefer not to say</option>
            </select>
          </label>
          <label>Favourite club
            <input value={preferences.favouriteClub} onChange={(event) => setPreferences({ ...preferences, favouriteClub: event.target.value })} />
          </label>
          <label>Favourite current player
            <input value={preferences.favouriteCurrentPlayer} onChange={(event) => setPreferences({ ...preferences, favouriteCurrentPlayer: event.target.value })} />
          </label>
          <label>Favourite legend
            <input value={preferences.favouriteLegend} onChange={(event) => setPreferences({ ...preferences, favouriteLegend: event.target.value })} />
          </label>
          <label>Followed leagues
            <input placeholder="Premier League, La Liga" value={preferences.followedLeagues} onChange={(event) => setPreferences({ ...preferences, followedLeagues: event.target.value })} />
          </label>
          <label>Preferred mode
            <select value={preferences.preferredGameMode} onChange={(event) => setPreferences({ ...preferences, preferredGameMode: event.target.value })}>
              <option value="">Not set</option><option value="minileague">Mini League</option><option value="invincible">Invincible</option>
            </select>
          </label>
          <label>How did you find us?
            <input value={preferences.discoverySource} onChange={(event) => setPreferences({ ...preferences, discoverySource: event.target.value })} />
          </label>
          <label>Preferred kit style
            <select value={preferences.preferredKitStyle} onChange={(event) => setPreferences({ ...preferences, preferredKitStyle: event.target.value })}>
              <option value="">Not set</option><option value="classic">Classic</option><option value="retro">Retro</option><option value="modern">Modern</option><option value="bold">Bold</option>
            </select>
          </label>
        </div>
        <div className="preference-save-row">
          <button className="primary-button" type="submit" disabled={saving}>
            <Save size={16} /> {saving ? "Saving…" : "Save preferences"}
          </button>
          {savedAt && !Number.isNaN(savedAt.getTime()) && (
            <span className="preference-saved-at">
              <CheckCircle2 size={16} />
              {experienceCopy.lastSaved} {savedAt.toLocaleString(locale)}
            </span>
          )}
        </div>
      </form>

      <section className="personal-card communication-card">
        <p className="eyebrow">Communication & data choices</p>
        <label className={`choice-row${emailVerified ? "" : " disabled"}`}>
          <span><Mail size={18} /><span><strong>FootyRush email updates</strong><small>News, new features and occasional promotions from FootyRush only.</small></span></span>
          <input type="checkbox" checked={emailOptIn} disabled={!emailVerified} onChange={(event) => void updateCommunication("emailOptIn", event.target.checked)} />
        </label>
        {!emailVerified && <p className="fine-print">X did not provide a verified email. A verified contact-email flow will be added later.</p>}
        <label className="choice-row">
          <span><ShieldCheck size={18} /><span><strong>Anonymous audience insights</strong><small>Allow optional preferences in grouped reports. Advertisers never receive your identity or contact details.</small></span></span>
          <input type="checkbox" checked={audienceOptIn} onChange={(event) => void updateCommunication("audienceInsightsOptIn", event.target.checked)} />
        </label>
      </section>

      {toast && (
        <div className={`save-toast ${toast.kind}`} role="status" aria-live="polite">
          <span className="save-toast-icon" aria-hidden="true">
            {toast.kind === "success" ? <CheckCircle2 size={21} /> : <ShieldCheck size={21} />}
          </span>
          <span>
            <strong>{toast.title}</strong>
            <small>{toast.body}</small>
          </span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification">
            <X size={17} />
          </button>
        </div>
      )}
    </>
  );
}
