import { useMemo, useState } from "react";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function Brand({ collapsed }) {
  return (
    <div className="flex items-center gap-3">
      <div className="brand-logo-shell">
        <img src="/logo-backoffice.png" alt="Backoffice Logo" className="h-8 w-8 object-contain" />
      </div>
      {!collapsed && (
        <div>
          <p className="text-sm font-semibold tracking-tight text-white">KMU BackOffice</p>
          <p className="text-xs text-slate-300">ERP Workspace</p>
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
  const [workspaceSearch, setWorkspaceSearch] = useState("");

  const nav = useMemo(
    () => [
      { key: "dashboard", label: "Dashboard", icon: "DA", group: "Analyse" },
      { key: "reports", label: "Auswertungen", icon: "RE", group: "Analyse" },
      { key: "customers", label: "Kunden", icon: "KU", group: "Stammdaten" },
      { key: "suppliers", label: "Lieferanten", icon: "LI", group: "Stammdaten" },
      { key: "items", label: "Artikel", icon: "AR", group: "Stammdaten" },
      { key: "settings", label: "Stammdaten", icon: "ST", group: "Stammdaten" },
      { key: "orders", label: "Aufträge", icon: "AU", group: "Prozesse" },
      { key: "purchases", label: "Einkauf", icon: "EK", group: "Prozesse" },
      { key: "documents", label: "Belege", icon: "BE", group: "Prozesse" },
      { key: "tasks", label: "Aufgaben", icon: "TA", group: "Organisation" },
      { key: "schedules", label: "Stundenplan", icon: "SZ", group: "Organisation" },
      { key: "workIncidents", label: "Unfaelle", icon: "UN", group: "Organisation" },
      { key: "audit", label: "Audit", icon: "AD", group: "System" },
      { key: "admin", label: "Admin", icon: "AM", group: "System" },
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

  function handleTopSearchKeyDown(event) {
    if (event.key !== "Enter") return;
    const term = workspaceSearch.trim().toLowerCase();
    if (!term) return;
    const match = nav.find((item) => item.label.toLowerCase().includes(term));
    if (match) {
      handleNavigate(match.key);
      setWorkspaceSearch("");
    }
  }

  return (
    <div className="canva-root">
      <div className="canva-background" />

      <div className="canva-app-frame" style={{ "--sidebar-width": collapsed ? "98px" : "296px" }}>
        {mobileOpen && (
          <button
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-[2px] lg:hidden"
            aria-label="Navigation schliessen"
          />
        )}

        <aside className={cx("canva-sidebar", collapsed && "is-collapsed", mobileOpen && "is-mobile-open")}>
          <div className="canva-sidebar-head">
            <Brand collapsed={collapsed} />
            <button
              className="canva-icon-btn hidden lg:inline-flex"
              onClick={() => setCollapsed((value) => !value)}
              title={collapsed ? "Sidebar oeffnen" : "Sidebar einklappen"}
              aria-label={collapsed ? "Sidebar oeffnen" : "Sidebar einklappen"}
            >
              {collapsed ? "→" : "←"}
            </button>
            <button
              onClick={() => setMobileOpen(false)}
              className="canva-icon-btn lg:hidden"
              aria-label="Navigation schliessen"
            >
              ×
            </button>
          </div>

          <div className={cx("canva-sidebar-tools", collapsed && "is-collapsed")}>
            {!collapsed && <p className="canva-sidebar-label">Schnellzugriff</p>}
            <button className="canva-primary-btn" onClick={() => handleNavigate("orders")}>
              {collapsed ? "+" : "Neuer Auftrag"}
            </button>

            <input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder={collapsed ? "⌕" : "Modul suchen"}
              className={cx("canva-sidebar-search", collapsed && "is-collapsed")}
              aria-label="Modul suchen"
            />
          </div>

          <nav className="canva-nav-scroll" aria-label="Hauptnavigation">
            {navGroups.map((group) => {
              const filteredItems = group.items.filter((item) =>
                item.label.toLowerCase().includes(searchValue.trim().toLowerCase())
              );

              if (!filteredItems.length) return null;

              return (
                <div key={group.name} className="space-y-1.5">
                  {!collapsed && <p className="canva-nav-group-label">{group.name}</p>}
                  {filteredItems.map((item) => {
                    const isActive = active === item.key;
                    return (
                      <button
                        key={item.key}
                        onClick={() => handleNavigate(item.key)}
                        className={cx("canva-nav-item", isActive && "is-active", collapsed && "is-collapsed")}
                        title={collapsed ? item.label : undefined}
                        aria-label={item.label}
                      >
                        <span className="canva-nav-icon">{item.icon}</span>
                        {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>

          <div className="canva-sidebar-foot">
            {!collapsed && (
              <div className="canva-user-chip">
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Angemeldet</p>
                <p className="truncate text-sm font-medium text-white">{userEmail || "-"}</p>
              </div>
            )}
            <button onClick={onLogout} className="canva-ghost-btn">
              Logout
            </button>
          </div>
        </aside>

        <main className="canva-main">
          <header className="canva-topbar">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileOpen(true)}
                className="canva-icon-btn lg:hidden"
                aria-label="Navigation oeffnen"
              >
                ☰
              </button>

              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Aktives Modul</p>
                <p className="text-sm font-semibold text-slate-900">{activeNav?.label || active}</p>
              </div>
            </div>

            <div className="canva-top-search-wrap">
              <input
                value={workspaceSearch}
                onChange={(e) => setWorkspaceSearch(e.target.value)}
                onKeyDown={handleTopSearchKeyDown}
                placeholder="Zu Modul springen (Enter)"
                className="canva-top-search"
                aria-label="Zu Modul springen"
              />
            </div>

            <div className="canva-top-actions">
              <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 md:flex">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span className="text-xs font-medium text-slate-600">System online</span>
              </div>

              <select
                value={glassIntensity}
                onChange={(event) => onGlassIntensityChange?.(event.target.value)}
                className="canva-select"
                aria-label="UI Stil"
              >
                <option value="subtle">Clean</option>
                <option value="medium">Balanced</option>
                <option value="strong">Expressive</option>
                <option value="ultra">Bold</option>
              </select>
            </div>
          </header>

          <section className="canva-content-wrap">
            <div className="app-module-shell">{children}</div>
          </section>
        </main>
      </div>
    </div>
  );
}
