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
      <div className={`glass-theme glass-${glassIntensity}`}>
        <div className="min-h-screen bg-slate-50 text-slate-900 grid place-items-center p-4">
          <div className="w-full max-w-4xl overflow-hidden rounded-[28px] border border-slate-200 bg-white/70 shadow-[0_28px_80px_rgba(54,94,140,0.24)]">
            <div className="grid lg:grid-cols-[1.1fr_1fr]">
              <section className="relative hidden border-r border-slate-200 p-8 lg:block">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(181,211,255,0.35),transparent_48%),radial-gradient(circle_at_82%_82%,rgba(170,231,201,0.32),transparent_44%)]" />
                <div className="relative space-y-6">
                  <img src="/logo-backoffice.png" alt="KMU BackOffice" className="h-16 w-auto object-contain" />
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">ERP Platform</p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Steuere Aufträge, Einkauf und Belege an einem Ort.</h1>
                  </div>
                  <ul className="space-y-2 text-sm text-slate-600">
                    <li>Live-Überblick über offene Aufgaben und Prozesse</li>
                    <li>Saubere Rollen- und Audit-Struktur für Teams</li>
                    <li>Sichere Dokumentation mit revisionsfähigen Belegen</li>
                  </ul>
                </div>
              </section>

              <section className="p-6 sm:p-8">
                <div className="text-xl font-semibold tracking-tight">Anmeldung</div>
                <div className="mt-1 text-sm text-slate-500">KMU BackOffice Zugang</div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => setMode("login")}
                    className={`flex-1 rounded-xl border px-3 py-2 text-sm ${
                      mode === "login"
                        ? "border-slate-300 bg-slate-100"
                        : "border-slate-200 bg-transparent hover:bg-slate-100"
                    }`}
                  >
                    Login
                  </button>
                  <button
                    onClick={() => setMode("signup")}
                    className={`flex-1 rounded-xl border px-3 py-2 text-sm ${
                      mode === "signup"
                        ? "border-slate-300 bg-slate-100"
                        : "border-slate-200 bg-transparent hover:bg-slate-100"
                    }`}
                  >
                    Registrieren
                  </button>
                </div>

                <form onSubmit={mode === "login" ? handleLogin : handleSignup} className="mt-4 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Email</label>
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-slate-300"
                      placeholder="du@beispiel.ch"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Passwort</label>
                    <input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      type="password"
                      className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-slate-300"
                      placeholder="••••••••"
                    />
                  </div>

                  {authError && (
                    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800">
                      {authError}
                    </div>
                  )}

                  <button
                    disabled={authLoading}
                    className="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-medium hover:bg-slate-200 disabled:opacity-60"
                    type="submit"
                  >
                    {authLoading ? "Bitte warten…" : mode === "login" ? "Einloggen" : "Account erstellen"}
                  </button>
                </form>
              </section>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Logged in view (ERP Shell)
  return (
    <div className={`glass-theme glass-${glassIntensity}`}>
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
