import { useMemo, useState } from "react";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function Icon({ children }) {
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 border border-white/10">
      <span className="text-sm">{children}</span>
    </span>
  );
}

export default function AppShell({ userEmail, active, onNavigate, onLogout, children }) {
  const [collapsed, setCollapsed] = useState(false);

  const nav = useMemo(
    () => [
      { key: "dashboard", label: "Dashboard", icon: "⌂" },
      { key: "customers", label: "Kunden", icon: "👤" },
      { key: "items", label: "Artikel", icon: "▦" },
      { key: "orders", label: "Aufträge", icon: "⎘" },
      { key: "tasks", label: "Aufgaben", icon: "✓" },
      { key: "reports", label: "Auswertungen", icon: "∑" },
      { key: "settings", label: "Einstellungen", icon: "⚙" },
    ],
    []
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Shell grid */}
      <div className="grid grid-cols-[auto_1fr]">
        {/* Sidebar */}
        <aside
          className={cx(
            "sticky top-0 h-screen border-r border-white/10 bg-slate-950/60 backdrop-blur",
            collapsed ? "w-[72px]" : "w-[280px]"
          )}
        >
          <div className="flex h-full flex-col">
            {/* Brand */}
            <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
              <Icon>ERP</Icon>
              {!collapsed && (
                <div className="leading-tight">
                  <div className="font-semibold">KMU BackOffice</div>
                  <div className="text-xs text-slate-400">KI-ERP • Training</div>
                </div>
              )}
              <button
                className="ml-auto rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                onClick={() => setCollapsed((v) => !v)}
                title={collapsed ? "Sidebar öffnen" : "Sidebar einklappen"}
              >
                {collapsed ? "→" : "←"}
              </button>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-2 py-3 space-y-1">
              {nav.map((n) => {
                const isActive = active === n.key;
                return (
                  <button
                    key={n.key}
                    onClick={() => onNavigate(n.key)}
                    className={cx(
                      "w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left transition border",
                      isActive
                        ? "bg-white/10 border-white/15"
                        : "bg-transparent border-transparent hover:bg-white/5 hover:border-white/10"
                    )}
                  >
                    <span className="inline-flex w-9 justify-center">{n.icon}</span>
                    {!collapsed && <span className="text-sm">{n.label}</span>}
                  </button>
                );
              })}
            </nav>

            {/* Footer */}
            <div className="border-t border-white/10 p-3">
              {!collapsed && (
                <div className="mb-2 text-xs text-slate-400 truncate">
                  Eingeloggt: <span className="text-slate-200">{userEmail || "—"}</span>
                </div>
              )}
              <button
                onClick={onLogout}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              >
                Logout
              </button>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="min-h-screen">
          {/* Topbar */}
          <header className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/60 backdrop-blur">
            <div className="flex items-center gap-3 px-5 py-3">
              <div className="text-sm text-slate-300">
                Modul: <span className="text-slate-100 font-medium">{active}</span>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <div className="hidden md:flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <span className="text-xs text-slate-400">KI-Assistent:</span>
                  <span className="text-xs text-emerald-300">bereit</span>
                </div>
              </div>
            </div>
          </header>

          {/* Content */}
          <div className="px-5 py-5">{children}</div>
        </main>
      </div>
    </div>
  );
}
