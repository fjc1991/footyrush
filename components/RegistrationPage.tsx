"use client";

import { FormEvent, useState } from "react";
import { Activity, ArrowLeft, CheckCircle2, LogIn, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { managerIdValidationMessage, normalizeManagerId } from "@/lib/user/manager-id";

const profileKey = "footyrush.profile";
const registeredManagerIdsKey = "footyrush.registeredManagerIds";

function readRegisteredManagerIds(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(registeredManagerIdsKey) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function reserveLocalManagerId(managerId: string, profileId: string) {
  const registered = readRegisteredManagerIds();
  registered[managerId] = profileId;
  window.localStorage.setItem(registeredManagerIdsKey, JSON.stringify(registered));
}

export default function RegistrationPage({ locale }: { locale: string }) {
  const router = useRouter();
  const [managerId, setManagerId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  async function checkManagerId(nextManagerId = managerId) {
    const normalized = normalizeManagerId(nextManagerId);
    setManagerId(normalized);
    setAvailable(null);
    const validation = managerIdValidationMessage(normalized);
    if (validation) {
      setMessage(validation);
      return false;
    }
    if (readRegisteredManagerIds()[normalized]) {
      setAvailable(false);
      setMessage("That manager ID is already taken on this device.");
      return false;
    }

    setChecking(true);
    setMessage("");
    try {
      const response = await fetch(`/api/registration?managerId=${encodeURIComponent(normalized)}`);
      const result = (await response.json()) as { available?: boolean; reason?: string };
      setAvailable(Boolean(result.available));
      setMessage(result.available ? "Manager ID is available." : result.reason ?? "That manager ID is already taken.");
      return Boolean(result.available);
    } catch {
      setMessage("Could not check that manager ID. Try again.");
      return false;
    } finally {
      setChecking(false);
    }
  }

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    const normalized = normalizeManagerId(managerId);
    const validation = managerIdValidationMessage(normalized);
    if (validation) {
      setSubmitting(false);
      setMessage(validation);
      return;
    }
    if (!email.trim() || password.length < 6) {
      setSubmitting(false);
      setMessage("Enter an email and a password of at least 6 characters.");
      return;
    }

    try {
      const response = await fetch("/api/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, managerId: normalized })
      });
      const result = (await response.json()) as { ok?: boolean; email?: string; managerId?: string; reason?: string };
      if (!response.ok || !result.ok || !result.email || !result.managerId) {
        setSubmitting(false);
        setAvailable(false);
        setMessage(result.reason ?? "Registration could not be validated.");
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        const { data, error } = await supabase.auth.signUp({
          email: result.email,
          password,
          options: {
            // Send the confirmation link back to the app so the session is picked up on return.
            emailRedirectTo: `${window.location.origin}/${locale}`,
            data: {
              manager_id: result.managerId,
              display_name: result.managerId
            }
          }
        });
        if (error) {
          setSubmitting(false);
          setMessage(error.message);
          return;
        }
        if (data.session?.user) {
          const profile = {
            id: data.session.user.id,
            managerId: result.managerId,
            displayName: result.managerId,
            email: result.email,
            demo: false
          };
          reserveLocalManagerId(result.managerId, profile.id);
          window.localStorage.setItem(profileKey, JSON.stringify(profile));
          router.push(`/${locale}#personal`);
          return;
        }
        reserveLocalManagerId(result.managerId, `pending-${result.managerId}`);
        setSubmitting(false);
        setMessage("Account created. Check your email to confirm, then sign in.");
        return;
      }

      const profile = {
        id: `local-${result.managerId}`,
        managerId: result.managerId,
        displayName: result.managerId,
        email: result.email,
        demo: true
      };
      reserveLocalManagerId(result.managerId, profile.id);
      window.localStorage.setItem(profileKey, JSON.stringify(profile));
      router.push(`/${locale}#personal`);
    } catch {
      setSubmitting(false);
      setMessage("Something went wrong. Please check your connection and try again.");
    }
  }

  return (
    <main className="registration-shell">
      <section className="registration-card">
        <a className="registration-back" href={`/${locale}`}>
          <ArrowLeft size={17} />
          Back to FootyRush
        </a>
        <div className="registration-hero">
          <span className="registration-icon">
            <Shield size={28} />
          </span>
          <div>
            <p className="eyebrow">Create account</p>
            <h1>Create your manager ID</h1>
            <p>Register to save results, join leaderboards, and build personal best-of-all-time stats.</p>
          </div>
        </div>

        <form className="registration-form" onSubmit={submitRegistration}>
          <label>
            <span>Unique manager ID</span>
            <div className="registration-id-row">
              <input
                value={managerId}
                onBlur={() => void checkManagerId()}
                onChange={(event) => {
                  setManagerId(normalizeManagerId(event.target.value));
                  setAvailable(null);
                }}
                placeholder="unique_manager_id"
                autoComplete="username"
              />
              <button className="secondary-button" type="button" onClick={() => void checkManagerId()} disabled={checking}>
                {checking ? "Checking..." : "Check"}
              </button>
            </div>
          </label>
          <label>
            <span>Email address</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" inputMode="email" autoComplete="email" />
          </label>
          <label>
            <span>Password</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" type="password" autoComplete="new-password" />
          </label>
          <button className="primary-button wide" type="submit" disabled={submitting}>
            <LogIn size={18} />
            {submitting ? "Creating..." : "Create manager ID"}
          </button>
        </form>

        <div className={`registration-message${available ? " available" : available === false ? " unavailable" : ""}`} aria-live="polite">
          {available && <CheckCircle2 size={17} />}
          <span>{message || (hasSupabaseConfig() ? "Manager IDs are checked against registered profiles." : "Local prototype mode: IDs are reserved on this device.")}</span>
        </div>

        <div className="registration-benefits">
          <div>
            <Activity size={18} />
            <strong>Save progress</strong>
            <span>Guest runs stay temporary. Registered runs build your history.</span>
          </div>
          <div>
            <CheckCircle2 size={18} />
            <strong>Join rankings</strong>
            <span>Your saved results become eligible for leaderboard tables.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
