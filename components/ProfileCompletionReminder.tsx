"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getProfileExperienceCopy } from "@/lib/user/profile-copy";
import {
  countProfilePreferences,
  PROFILE_COMPLETION_TARGET,
  PROFILE_PREFERENCE_TOTAL,
  shouldShowProfileReminder
} from "@/lib/user/profile-reminder";

interface HomeResponse {
  available?: boolean;
  preferences?: Record<string, unknown> | null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabaseBrowserClient();
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

export default function ProfileCompletionReminder({
  enabled,
  locale,
  profileKey,
  onOpen
}: {
  enabled: boolean;
  locale: string;
  profileKey: string;
  onOpen: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [completed, setCompleted] = useState(0);
  const experienceCopy = getProfileExperienceCopy(locale);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();

    async function checkProfile() {
      try {
        const response = await fetch("/api/account/home", {
          headers: await authHeaders(),
          signal: controller.signal
        });
        if (!response.ok) return;
        const data = (await response.json()) as HomeResponse;
        if (data.available === false) return;
        const count = countProfilePreferences(data.preferences);
        const storageKey = `footyrush.profile-reminder.v1.${profileKey}`;
        const stored = window.localStorage.getItem(storageKey);
        const lastShownAt = stored === null ? null : Number(stored);
        if (!shouldShowProfileReminder({ preferences: data.preferences, lastShownAt })) return;
        window.localStorage.setItem(storageKey, String(Date.now()));
        setCompleted(count);
        setVisible(true);
      } catch {
        // Account reminders never block play when account data is unavailable.
      }
    }

    void checkProfile();
    return () => controller.abort();
  }, [enabled, profileKey]);

  if (!visible) return null;

  return (
    <div className="profile-reminder-backdrop" role="presentation">
      <section
        className="profile-reminder-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-reminder-title"
      >
        <div className="profile-reminder-icon" aria-hidden="true">
          <Sparkles size={26} />
        </div>
        <div>
          <p className="eyebrow">{experienceCopy.reminderEyebrow}</p>
          <h2 id="profile-reminder-title">{experienceCopy.reminderTitle}</h2>
          <p className="profile-reminder-intro">{experienceCopy.reminderBody}</p>
        </div>
        <div className="profile-reminder-progress" aria-label={experienceCopy.progress(completed, PROFILE_PREFERENCE_TOTAL)}>
          <span style={{ width: `${Math.min(100, (completed / PROFILE_COMPLETION_TARGET) * 100)}%` }} />
        </div>
        <small>{experienceCopy.progress(completed, PROFILE_PREFERENCE_TOTAL)}</small>
        <ul>
          {experienceCopy.reminderBenefits.map((benefit) => (
            <li key={benefit}><CheckCircle2 size={17} /> {benefit}</li>
          ))}
        </ul>
        <p className="profile-reminder-privacy"><ShieldCheck size={17} /> {experienceCopy.reminderPrivacy}</p>
        <div className="profile-reminder-actions">
          <button
            className="primary-button"
            type="button"
            autoFocus
            onClick={() => {
              setVisible(false);
              onOpen();
              window.setTimeout(() => {
                document.getElementById("profile-preferences")?.scrollIntoView({
                  behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
                  block: "start"
                });
              }, 0);
            }}
          >
            {experienceCopy.reminderPrimary}
          </button>
          <button className="secondary-button" type="button" onClick={() => setVisible(false)}>
            {experienceCopy.reminderLater}
          </button>
        </div>
      </section>
    </div>
  );
}
