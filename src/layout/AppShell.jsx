import { useMemo, useState } from "react";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function Brand({ collapsed }) {
  return (
    <div className="flex items-center gap-3">
      <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/70 bg-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
        <img src="/logo-backoffice.png" alt="Backoffice Logo" className="h-8 w-8 object-contain" />
      </div>
      {!collapsed && (
        <div>
          <p className="text-sm font-semibold tracking-tight text-slate-900">KMU BackOffice</p>
          <p className="text-xs text-slate-500">ERP Workspace</p>
        </div>
      )}
    </div>
  );
}

export default function AppShell({
  userEmail,
  active,
  onNavigate,
  onLogout,
  children,
  glassIntensity = "strong",
  onGlassIntensityChange,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const nav = useMemo(
    () => [
      { key: "dashboard", label: "Dashboard", icon: "⌂", group: "Analyse" },
      { key: "reports", label: "Auswertungen", icon: "∑", group: "Analyse" },
      { key: "customers", label: "Kunden", icon: "👤", group: "Stammdaten" },
      { key: "suppliers", label: "Lieferanten", icon: "🏭", group: "Stammdaten" },
      { key: "items", label: "Artikel", icon: "▦", group: "Stammdaten" },
      { key: "settings", label: "Stammdaten", icon: "🏢", group: "Stammdaten" },
      { key: "orders", label: "Aufträge", icon: "⎘", group: "Prozesse" },
      { key: "purchases", label: "Einkauf", icon: "⇣", group: "Prozesse" },
      { key: "documents", label: "Belege", icon: "🧾", group: "Prozesse" },
      { key: "tasks", label: "Aufgaben", icon: "✓", group: "Organisation" },
      { key: "schedules", label: "Stundenplan", icon: "🕒", group: "Organisation" },
      { key: "audit", label: "Audit", icon: "≡", group: "System" },
      { key: "admin", label: "Admin", icon: "⚙︎", group: "System" },
    ],
    []
  );

  const activeNav = nav.find((n) => n.key === active);
  const navGroups = useMemo(() => {
    const groups = [];
    for (const entry of nav) {
      const existing = groups.find((g) => g.name === entry.group);
      if (existing) existing.items.push(entry);
      else groups.push({ name: entry.group, items: [entry] });
    }
    return groups;
  }, [nav]);

  function handleNavigate(target) {
    onNavigate(target);
    setMobileOpen(false);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_8%,rgba(255,255,255,0.7),transparent_36%),radial-gradient(circle_at_92%_6%,rgba(158,194,255,0.34),transparent_40%),radial-gradient(circle_at_48%_100%,rgba(157,216,188,0.22),transparent_42%)]" />

      <div className="relative grid min-h-screen lg:grid-cols-[300px_1fr]">
        {mobileOpen && (
          <button
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-30 bg-slate-900/20 backdrop-blur-[2px] lg:hidden"
            aria-label="Navigation schließen"
          />
        )}

        <aside
          className={cx(
            "glass-surface fixed inset-y-0 left-0 z-40 flex h-screen flex-col border-r border-slate-200 transition-transform duration-300 lg:sticky lg:top-0",
            collapsed ? "w-[92px]" : "w-[292px]",
            mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          )}
        >
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4">
            <Brand collapsed={collapsed} />
            <button
              className="ml-auto hidden rounded-lg border border-slate-200 bg-white/70 px-2 py-1 text-xs text-slate-600 hover:bg-white lg:block"
              onClick={() => setCollapsed((v) => !v)}
              title={collapsed ? "Sidebar öffnen" : "Sidebar einklappen"}
            >
              {collapsed ? "→" : "←"}
            </button>
            <button
              onClick={() => setMobileOpen(false)}
              className="rounded-lg border border-slate-200 bg-white/70 px-2 py-1 text-xs text-slate-600 lg:hidden"
              aria-label="Schließen"
            >
              ✕
            </button>
          </div>

          <div className="px-3 py-3">
            <label className={cx("text-[11px] uppercase tracking-[0.18em] text-slate-400", collapsed && "hidden")}>Schnellfilter</label>
            <input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder={collapsed ? "⌕" : "Modul suchen"}
              className={cx(
                "mt-2 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-slate-300",
                collapsed && "px-0 text-center"
              )}
            />
          </div>

          <nav className="flex-1 space-y-3 overflow-y-auto px-2 pb-3">
            {navGroups.map((group) => {
              const filteredItems = group.items.filter((item) =>
                item.label.toLowerCase().includes(searchValue.trim().toLowerCase())
              );
              if (!filteredItems.length) return null;

              return (
                <div key={group.name} className="space-y-1">
                  {!collapsed && (
                    <p className="px-2 pt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                      {group.name}
                    </p>
                  )}

                  {filteredItems.map((item) => {
                    const isActive = active === item.key;
                    return (
                      <button
                        key={item.key}
                        onClick={() => handleNavigate(item.key)}
                        className={cx(
                          "w-full items-center rounded-xl px-3 py-2.5 text-left transition",
                          collapsed ? "flex justify-center" : "flex gap-3",
                          isActive ? "glass-nav-active" : "glass-nav"
                        )}
                        title={collapsed ? item.label : undefined}
                      >
                        <span className="inline-flex w-8 justify-center text-sm">{item.icon}</span>
                        {!collapsed && <span className="text-sm font-medium tracking-tight text-slate-700">{item.label}</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>

          <div className="border-t border-slate-200 p-3">
            {!collapsed && (
              <div className="mb-2 rounded-xl border border-slate-200 bg-white/60 px-3 py-2 text-xs text-slate-500">
                Eingeloggt als
                <div className="truncate pt-0.5 text-sm font-medium text-slate-700">{userEmail || "-"}</div>
              </div>
            )}
            <button onClick={onLogout} className="glass-surface w-full rounded-xl px-3 py-2 text-sm font-medium text-slate-700">
              Logout
            </button>
          </div>
        </aside>

        <main className="min-h-screen">
          <header className="glass-elevated sticky top-0 z-20 border-b border-slate-200">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5 lg:px-6">
              <button
                onClick={() => setMobileOpen(true)}
                className="rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-700 lg:hidden"
              >
                Menü
              </button>

              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Aktives Modul</p>
                <p className="text-sm font-semibold text-slate-900">{activeNav?.label || active}</p>
              </div>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/65 px-2 py-1.5">
                  <label className="text-xs text-slate-500">UI</label>
                  <select
                    value={glassIntensity}
                    onChange={(e) => onGlassIntensityChange?.(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none"
                  >
                    <option value="subtle">subtil</option>
                    <option value="medium">mittel</option>
                    <option value="strong">stark</option>
                    <option value="ultra">ultra</option>
                  </select>
                </div>

                <div className="hidden items-center rounded-xl border border-slate-200 bg-white/65 px-3 py-2 text-xs text-slate-600 md:flex">
                  Systemstatus: <span className="ml-1.5 font-medium text-emerald-700">online</span>
                </div>
              </div>
            </div>
          </header>

          <div className="px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
            <div className="app-module-shell">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
