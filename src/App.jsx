import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import AppShell from "./layout/AppShell";

import Customers from "./pages/Customers";
import Items from "./pages/Items";
import Orders from "./pages/Orders";
import Audit from "./pages/Audit";
import Settings from "./pages/Settings";
import Suppliers from "./pages/Suppliers";
import Purchases from "./pages/Purchases";
import Schedules from "./pages/Schedules";
import Tasks from "./pages/Tasks";
import Reports from "./pages/Reports";
import Admin from "./pages/Admin";
import Dashboard from "./pages/Dashboard";
import Documents from "./pages/Documents";

function prettySupabaseError(error) {
  if (!error) return "";
  const msg = error.message || String(error);
  return msg;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [glassIntensity, setGlassIntensity] = useState(() => {
    const saved = localStorage.getItem("uiGlassIntensity");
    if (saved === "subtle" || saved === "medium" || saved === "strong" || saved === "ultra") return saved;
    return "ultra";
  });

  // Auth UI
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  // ERP nav
  const [active, setActive] = useState("dashboard");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession || null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function handler(e) {
      const detail = e.detail || {};
      if (detail.module) {
        setActive(detail.module);
      }
      if (detail.id) {
        localStorage.setItem("deepLink", JSON.stringify(detail));
      }
    }
    window.addEventListener("app:navigate", handler);
    return () => window.removeEventListener("app:navigate", handler);
  }, []);

  useEffect(() => {
    localStorage.setItem("uiGlassIntensity", glassIntensity);
  }, [glassIntensity]);

  async function handleLogin(e) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setAuthLoading(false);
    if (error) setAuthError(prettySupabaseError(error));
  }

  async function handleSignup(e) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    setAuthLoading(false);
    if (error) setAuthError(prettySupabaseError(error));
    else setAuthError("Registriert. Falls Email-Bestätigung aktiv ist: Mail checken.");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  // Logged out view
  if (!session) {
    return (
      <div className={`canva-theme canva-${glassIntensity}`}>
        <div className="auth-layout">
          <div className="auth-panel">
            <section className="auth-highlight hidden lg:block">
              <img src="/logo-backoffice.png" alt="KMU BackOffice" className="h-16 w-auto object-contain" />
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-300">ERP Platform</p>
                <h1 className="text-3xl font-semibold tracking-tight text-white">
                  Steuere Auftraege, Einkauf und Belege in einem kreativen Workspace.
                </h1>
              </div>
              <ul className="space-y-2 text-sm text-slate-200">
                <li>Live-Ueberblick ueber offene Aufgaben und Prozesse</li>
                <li>Saubere Rollen- und Audit-Struktur fuer Teams</li>
                <li>Sichere Dokumentation mit revisionsfaehigen Belegen</li>
              </ul>
            </section>

            <section className="auth-form-wrap">
              <div className="space-y-1">
                <p className="text-sm uppercase tracking-[0.16em] text-slate-500">Willkommen</p>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900">KMU BackOffice</h2>
                <p className="text-sm text-slate-500">Melde dich an und arbeite direkt weiter.</p>
              </div>

              <div className="auth-mode-switch">
                <button
                  onClick={() => setMode("login")}
                  className={mode === "login" ? "auth-mode-btn is-active" : "auth-mode-btn"}
                >
                  Login
                </button>
                <button
                  onClick={() => setMode("signup")}
                  className={mode === "signup" ? "auth-mode-btn is-active" : "auth-mode-btn"}
                >
                  Registrieren
                </button>
              </div>

              <form onSubmit={mode === "login" ? handleLogin : handleSignup} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Email</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="auth-input"
                    placeholder="du@beispiel.ch"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Passwort</label>
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    className="auth-input"
                    placeholder="••••••••"
                  />
                </div>

                {authError && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {authError}
                  </div>
                )}

                <button disabled={authLoading} className="auth-submit-btn" type="submit">
                  {authLoading ? "Bitte warten…" : mode === "login" ? "Einloggen" : "Account erstellen"}
                </button>
              </form>
            </section>
          </div>
        </div>
      </div>
    );
  }

  // Logged in view (ERP Shell)
  return (
    <div className={`canva-theme canva-${glassIntensity}`}>
      <AppShell
        userEmail={session.user?.email}
        active={active}
        onNavigate={setActive}
        onLogout={handleLogout}
        glassIntensity={glassIntensity}
        onGlassIntensityChange={setGlassIntensity}
      >
        {active === "customers" && <Customers />}
        {active === "dashboard" && <Dashboard />}
        {active === "suppliers" && <Suppliers />}
        {active === "items" && <Items />}
        {active === "orders" && <Orders />}
        {active === "purchases" && <Purchases />}
        {active === "schedules" && <Schedules />}
        {active === "tasks" && <Tasks />}
        {active === "audit" && <Audit />}
        {active === "settings" && <Settings />}
        {active === "reports" && <Reports />}
        {active === "admin" && <Admin />}
        {active === "documents" && <Documents />}

        {active !== "customers" &&
          active !== "dashboard" &&
          active !== "suppliers" &&
          active !== "items" &&
          active !== "orders" &&
          active !== "purchases" &&
          active !== "schedules" &&
          active !== "tasks" &&
          active !== "audit" &&
          active !== "settings" &&
          active !== "reports" &&
          active !== "admin" &&
          active !== "documents" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="text-lg font-semibold">Modul kommt als nächstes</div>
            <div className="text-sm text-slate-500 mt-1">
              Aktuell: <span className="text-slate-800">{active}</span>
            </div>
            <div className="text-sm text-slate-700 mt-4">
              Nächste Module: Aufgaben, Auswertungen, Teilnehmer – und später KI-Assist im ganzen ERP.
            </div>
          </div>
        )}
      </AppShell>
    </div>
  );
}
