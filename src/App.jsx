import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import AppShell from "./layout/AppShell";

import Customers from "./pages/Customers";
import Items from "./pages/Items";
import Orders from "./pages/Orders";

function prettySupabaseError(error) {
  if (!error) return "";
  const msg = error.message || String(error);
  return msg;
}

export default function App() {
  const [session, setSession] = useState(null);

  // Auth UI
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  // ERP nav
  const [active, setActive] = useState("customers");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession || null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

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
      <div className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-xl font-semibold">KMU BackOffice</div>
          <div className="text-sm text-slate-400 mt-1">Login / Registrierung (Supabase Auth)</div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm ${
                mode === "login"
                  ? "border-white/20 bg-white/10"
                  : "border-white/10 bg-transparent hover:bg-white/5"
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm ${
                mode === "signup"
                  ? "border-white/20 bg-white/10"
                  : "border-white/10 bg-transparent hover:bg-white/5"
              }`}
            >
              Registrieren
            </button>
          </div>

          <form onSubmit={mode === "login" ? handleLogin : handleSignup} className="mt-4 space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm outline-none focus:border-white/20"
                placeholder="du@beispiel.ch"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Passwort</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm outline-none focus:border-white/20"
                placeholder="••••••••"
              />
            </div>

            {authError && (
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                {authError}
              </div>
            )}

            <button
              disabled={authLoading}
              className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/15 disabled:opacity-60"
              type="submit"
            >
              {authLoading ? "Bitte warten…" : mode === "login" ? "Einloggen" : "Account erstellen"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Logged in view (ERP Shell)
  return (
    <AppShell userEmail={session.user?.email} active={active} onNavigate={setActive} onLogout={handleLogout}>
      {active === "customers" && <Customers />}
      {active === "items" && <Items />}
      {active === "orders" && <Orders />}

      {active !== "customers" && active !== "items" && active !== "orders" && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-lg font-semibold">Modul kommt als nächstes</div>
          <div className="text-sm text-slate-400 mt-1">
            Aktuell: <span className="text-slate-200">{active}</span>
          </div>
          <div className="text-sm text-slate-300 mt-4">
            Nächste Module: Aufgaben, Auswertungen, Teilnehmer – und später KI-Assist im ganzen ERP.
          </div>
        </div>
      )}
    </AppShell>
  );
}
