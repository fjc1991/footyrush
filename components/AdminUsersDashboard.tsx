"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, BarChart3, Download, Search, ShieldCheck, Users } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface AnalyticsPayload {
  ok?: boolean;
  minimumAudienceSegment?: number;
  metrics?: Record<string, number>;
  modeStats?: { mode: string; starts: number; completions: number; completionRate: number }[];
  audience?: Record<string, { label: string; count: number }[]>;
}

interface UserPayload {
  ok?: boolean;
  total?: number;
  users?: {
    id: string;
    public_name: string | null;
    email: string | null;
    locale: string;
    created_at: string;
    last_seen_at: string | null;
    completedRuns: number;
    activeSeconds: number;
    marketing?: { footyrush_email_opt_in?: boolean } | null;
  }[];
}

async function authHeader(): Promise<Record<string, string>> {
  const supabase = getSupabaseBrowserClient();
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

function metricLabel(value: string) {
  return value.replace(/([A-Z0-9])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

export default function AdminUsersDashboard({ locale }: { locale: string }) {
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [users, setUsers] = useState<UserPayload | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("Loading verified administrator data…");

  async function loadUsers(query = "") {
    const response = await fetch(`/api/admin/users?pageSize=50&search=${encodeURIComponent(query)}`, {
      headers: await authHeader()
    });
    if (!response.ok) {
      setMessage(response.status === 403 ? "Administrator access is required." : "The user database is temporarily unavailable.");
      return;
    }
    setUsers(await response.json());
    setMessage("");
  }

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/admin/analytics", { headers: await authHeader() });
      if (response.ok) setAnalytics(await response.json());
      await loadUsers();
    })();
  }, []);

  async function submitSearch(event: FormEvent) {
    event.preventDefault();
    await loadUsers(search);
  }

  async function exportAudience() {
    setMessage("Preparing consented email audience…");
    const response = await fetch("/api/admin/users/export", { headers: await authHeader() });
    if (!response.ok) {
      setMessage("The export could not be created.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "footyrush-audience.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Export downloaded and recorded in the audit log.");
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <a href={`/${locale}#personal`}><ArrowLeft size={17} /> Back to My home</a>
        <div><p className="eyebrow">Verified administrator</p><h1>User database</h1></div>
        <ShieldCheck size={28} />
      </header>
      {message && <p className="registration-message" role="status">{message}</p>}

      {analytics?.metrics && (
        <section className="admin-metrics" aria-label="Account metrics">
          {Object.entries(analytics.metrics).map(([key, value]) => (
            <div key={key}><span>{metricLabel(key)}</span><strong>{key.toLowerCase().includes("seconds") ? `${Math.round(value / 60)}m` : value}</strong></div>
          ))}
        </section>
      )}

      <section className="panel admin-panel">
        <div className="admin-section-heading">
          <div><p className="eyebrow">Product health</p><h2>Mode participation</h2></div><BarChart3 size={22} />
        </div>
        <div className="admin-mode-grid">
          {(analytics?.modeStats ?? []).map((mode) => (
            <div key={mode.mode}><strong>{metricLabel(mode.mode)}</strong><span>{mode.starts} starts</span><span>{mode.completions} complete</span><span>{Math.round(mode.completionRate * 100)}%</span></div>
          ))}
        </div>
      </section>

      <section className="panel admin-panel">
        <div className="admin-section-heading">
          <div>
            <p className="eyebrow">Advertiser insight</p>
            <h2>Consented aggregates</h2>
            <p>Only opted-in preferences are counted. Segments below {analytics?.minimumAudienceSegment ?? 10} people are suppressed.</p>
          </div>
          <Users size={22} />
        </div>
        <div className="audience-grid">
          {Object.entries(analytics?.audience ?? {}).map(([key, segments]) => (
            <div key={key}><strong>{metricLabel(key)}</strong>{segments.length ? segments.map((segment) => <span key={segment.label}>{segment.label} <b>{segment.count}</b></span>) : <small>No publishable segment</small>}</div>
          ))}
        </div>
      </section>

      <section className="panel admin-panel">
        <div className="admin-section-heading">
          <div><p className="eyebrow">Internal support</p><h2>Accounts ({users?.total ?? 0})</h2></div>
          <button className="secondary-button" type="button" onClick={exportAudience}><Download size={16} /> Export FootyRush opt-ins</button>
        </div>
        <form className="admin-search" onSubmit={submitSearch}>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Manager ID or email" />
          <button className="primary-button" type="submit"><Search size={16} /> Search</button>
        </form>
        <div className="admin-user-table" role="table">
          <div className="admin-user-row head" role="row"><span>Manager</span><span>Account</span><span>Activity</span><span>Consent</span></div>
          {(users?.users ?? []).map((user) => (
            <div className="admin-user-row" role="row" key={user.id}>
              <span><strong>{user.public_name ?? "ID pending"}</strong><small>{user.locale.toUpperCase()} · joined {new Date(user.created_at).toLocaleDateString()}</small></span>
              <span>{user.email ?? "No email"}<small>{user.id}</small></span>
              <span>{user.completedRuns} runs<small>{Math.round(user.activeSeconds / 60)} active min</small></span>
              <span>{user.marketing?.footyrush_email_opt_in ? "FootyRush email: yes" : "Email: no"}<small>{user.last_seen_at ? `Seen ${new Date(user.last_seen_at).toLocaleDateString()}` : "Not seen"}</small></span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
