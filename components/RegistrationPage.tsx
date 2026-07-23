"use client";

import { FormEvent, useEffect, useState } from "react";
import { Activity, ArrowLeft, CheckCircle2, LogIn, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { managerIdValidationMessage, normalizeManagerId } from "@/lib/user/manager-id";

const profileKey = "footyrush.profile";
const registeredManagerIdsKey = "footyrush.registeredManagerIds";

interface LocalProfile {
  id: string;
  managerId?: string;
  displayName: string;
  email: string;
  demo: boolean;
}

interface CanonicalProfileResponse {
  ok?: boolean;
  profile?: {
    id: string;
    managerId: string | null;
    displayName: string;
    email: string | null;
    demo: false;
    requiresManagerIdConfirmation?: boolean;
    renameAvailable?: boolean;
  };
}

type SessionState = "loading" | "anonymous" | "needs-manager-id" | "complete" | "error";

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
  const [sessionState, setSessionState] = useState<SessionState>(hasSupabaseConfig() ? "loading" : "anonymous");
  const [signedInProfile, setSignedInProfile] = useState<LocalProfile | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setSessionState("anonymous");
      return;
    }

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      const session = data.session;
      const user = session?.user;
      if (!session || !user) {
        // A stale local profile must never turn an anonymous browser into an
        // authenticated onboarding request.
        window.localStorage.removeItem(profileKey);
        setSessionState("anonymous");
        return;
      }

      let response: Response;
      try {
        response = await fetch("/api/profile", {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
      } catch {
        if (!active) return;
        setMessage("We could not load your account. Refresh and try again.");
        setSessionState("error");
        return;
      }
      const result = (await response.json().catch(() => null)) as CanonicalProfileResponse | null;
      if (!active) return;
      if (!response.ok || !result?.ok || !result.profile) {
        setMessage("We could not load your account. Refresh and try again.");
        setSessionState("error");
        return;
      }

      const storedProfile: LocalProfile = {
        id: result.profile.id,
        managerId: result.profile.managerId ?? undefined,
        displayName: result.profile.displayName || user.email?.split("@")[0] || "Manager",
        email: result.profile.email || user.email || "",
        demo: false
      };
      setEmail(storedProfile.email);
      setSignedInProfile(storedProfile);

      if (storedProfile.managerId && !result.profile.requiresManagerIdConfirmation) {
        reserveLocalManagerId(storedProfile.managerId, storedProfile.id);
        window.localStorage.setItem(profileKey, JSON.stringify(storedProfile));
        setManagerId(storedProfile.managerId);
        setAvailable(true);
        setSessionState("complete");
        return;
      }

      setManagerId(
        storedProfile.managerId ??
          (typeof user.user_metadata?.manager_id === "string" ? normalizeManagerId(user.user_metadata.manager_id) : "")
      );
      setSessionState("needs-manager-id");
    });

    return () => {
      active = false;
    };
  }, []);

  async function checkManagerId(nextManagerId = managerId) {
    const normalized = normalizeManagerId(nextManagerId);
    setManagerId(normalized);
    setAvailable(null);
    const validation = managerIdValidationMessage(normalized);
    if (validation) {
      setMessage(validation);
      return false;
    }
    const locallyRegisteredTo = readRegisteredManagerIds()[normalized];
    if (locallyRegisteredTo && locallyRegisteredTo !== signedInProfile?.id) {
      setAvailable(false);
      setMessage("That manager ID is already taken on this device.");
      return false;
    }

    setChecking(true);
    setMessage("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const response = await fetch(`/api/registration?managerId=${encodeURIComponent(normalized)}`, {
        headers: data.session?.access_token
          ? { Authorization: `Bearer ${data.session.access_token}` }
          : undefined
      });
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

  async function completeSignedInRegistration(event: FormEvent<HTMLFormElement>) {
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

    const supabase = getSupabaseBrowserClient();
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    const accessToken = data.session?.access_token;
    if (!accessToken) {
      setSubmitting(false);
      setMessage("Your session has expired. Sign in again to choose a manager ID.");
      return;
    }

    try {
      const response = await fetch("/api/registration", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ managerId: normalized })
      });
      const result = (await response.json()) as {
        ok?: boolean;
        reason?: string;
        profile?: LocalProfile;
      };
      if (!response.ok || !result.ok || !result.profile?.managerId) {
        setAvailable(response.status === 409 ? false : null);
        setMessage(result.reason ?? "That manager ID could not be saved.");
        return;
      }

      reserveLocalManagerId(result.profile.managerId, result.profile.id);
      window.localStorage.setItem(profileKey, JSON.stringify(result.profile));
      setSignedInProfile(result.profile);
      setManagerId(result.profile.managerId);
      setAvailable(true);
      setSessionState("complete");
      router.push(`/${locale}#personal`);
    } catch {
      setMessage("Something went wrong. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const completingSignedInAccount = sessionState === "needs-manager-id";

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
            <p className="eyebrow">
              {sessionState === "complete" ? "Account ready" : completingSignedInAccount ? "Finish account" : "Create account"}
            </p>
            <h1>{sessionState === "complete" ? "Your manager ID is ready" : "Choose your manager ID"}</h1>
            <p>
              {completingSignedInAccount
                ? "You’re signed in. Pick the unique manager ID that will identify you in rankings and saved results."
                : "Register to save results, join leaderboards, and build personal best-of-all-time stats."}
            </p>
          </div>
        </div>

        {sessionState === "loading" ? (
          <div className="registration-message" role="status">
            <span>Loading your account…</span>
          </div>
        ) : sessionState === "error" ? (
          <div className="registration-form">
            <div className="registration-message unavailable" role="alert">
              <span>{message}</span>
            </div>
            <button className="secondary-button wide" type="button" onClick={() => window.location.reload()}>
              Refresh account
            </button>
          </div>
        ) : sessionState === "complete" ? (
          <div className="registration-form">
            <div className="registration-message available" role="status">
              <CheckCircle2 size={17} />
              <span>
                Signed in as <strong>@{signedInProfile?.managerId}</strong>.
              </span>
            </div>
            <a className="primary-button wide" href={`/${locale}#personal`}>
              Continue to FootyRush
            </a>
          </div>
        ) : (
          <form
            className="registration-form"
            onSubmit={completingSignedInAccount ? completeSignedInRegistration : submitRegistration}
          >
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
            {!completingSignedInAccount && (
              <>
                <label>
                  <span>Email address</span>
                  <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" inputMode="email" autoComplete="email" />
                </label>
                <label>
                  <span>Password</span>
                  <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" type="password" autoComplete="new-password" />
                </label>
              </>
            )}
            <button className="primary-button wide" type="submit" disabled={submitting}>
              <LogIn size={18} />
              {submitting ? (completingSignedInAccount ? "Saving..." : "Creating...") : completingSignedInAccount ? "Save manager ID" : "Create manager ID"}
            </button>
          </form>
        )}

        {sessionState !== "loading" && sessionState !== "complete" && sessionState !== "error" && (
          <div className={`registration-message${available ? " available" : available === false ? " unavailable" : ""}`} aria-live="polite">
            {available && <CheckCircle2 size={17} />}
            <span>
              {message || (completingSignedInAccount
                  ? `Signed in${signedInProfile?.email ? ` as ${signedInProfile.email}` : ""}. Confirm this ID or use your one-time change.`
                : hasSupabaseConfig()
                  ? "Manager IDs are checked against registered profiles."
                  : "Local prototype mode: IDs are reserved on this device.")}
            </span>
          </div>
        )}

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
