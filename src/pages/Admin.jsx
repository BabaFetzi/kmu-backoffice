import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function prettySupabaseError(error) {
  if (!error) return "";
  return error.message || String(error);
}

export default function Admin() {
  const [rolesLoading, setRolesLoading] = useState(true);
  const [healthLoading, setHealthLoading] = useState(true);
  const [err, setErr] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [appUsers, setAppUsers] = useState([]);
  const [userRoles, setUserRoles] = useState({});
  const [issues, setIssues] = useState([]);
  const [health, setHealth] = useState({
    openDocuments: null,
    openAmount: null,
    overdueAmount: null,
    dunningSent: null,
    paymentRows: null,
  });

  const roleOptions = ["admin", "einkauf", "lager", "buchhaltung", "read_only"];

  async function loadRoles() {
    setRolesLoading(true);
    setHealthLoading(true);
    setErr("");
    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const userId = authData?.user?.id;
      if (!userId) throw new Error("Kein Benutzer gefunden.");

      const { data: myRoles, error: myRolesErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (myRolesErr) throw myRolesErr;

      const admin = (myRoles || []).some((r) => r.role === "admin");
      setIsAdmin(admin);

      if (!admin) {
        setAppUsers([]);
        setUserRoles({});
        setIssues([]);
        setHealth({
          openDocuments: null,
          openAmount: null,
          overdueAmount: null,
          dunningSent: null,
          paymentRows: null,
        });
        return;
      }

      const [
        { data: users, error: usersErr },
        { data: roles, error: rolesErr },
        { data: qualityRows, error: qualityErr },
        { data: opRows, error: opErr },
        { data: dunningRows, error: dunningErr },
        { data: paymentRows, error: paymentErr },
      ] = await Promise.all([
        supabase.from("app_users").select("id, email, updated_at").order("email", { ascending: true }),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("data_quality_issues_view").select("issue_type, entity, message, entity_id"),
        supabase
          .from("open_items_aging_view")
          .select("order_id, gross_total, payment_status")
          .limit(500),
        supabase.from("dunning_log").select("id").gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
        supabase.from("payments").select("id").gte("paid_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      ]);
      if (usersErr) throw usersErr;
      if (rolesErr) throw rolesErr;
      if (qualityErr) throw qualityErr;
      if (opErr) throw opErr;
      if (dunningErr) throw dunningErr;
      if (paymentErr) throw paymentErr;

      const map = (roles || []).reduce((acc, r) => {
        if (!acc[r.user_id]) acc[r.user_id] = new Set();
        acc[r.user_id].add(r.role);
        return acc;
      }, {});

      const opOpenAmount = (opRows || [])
        .filter((r) => r.payment_status === "open" || r.payment_status === "partial")
        .reduce((sum, r) => sum + Number(r.gross_total || 0), 0);
      const opOverdueAmount = (opRows || [])
        .filter((r) => r.payment_status === "overdue")
        .reduce((sum, r) => sum + Number(r.gross_total || 0), 0);

      setAppUsers(users || []);
      setUserRoles(Object.fromEntries(Object.entries(map).map(([k, v]) => [k, Array.from(v)])));
      setIssues(qualityRows || []);
      setHealth({
        openDocuments: (opRows || []).length,
        openAmount: opOpenAmount,
        overdueAmount: opOverdueAmount,
        dunningSent: (dunningRows || []).length,
        paymentRows: (paymentRows || []).length,
      });
    } catch (e) {
      setErr(prettySupabaseError(e));
    } finally {
      setRolesLoading(false);
      setHealthLoading(false);
    }
  }

  useEffect(() => {
    loadRoles();
  }, []);

  async function toggleRole(userId, role) {
    if (!isAdmin) return;
    setErr("");
    try {
      const current = userRoles[userId] || [];
      if (current.includes(role)) {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
        if (error) throw error;
      }
      await loadRoles();
    } catch (e) {
      setErr(prettySupabaseError(e));
    }
  }

  function formatCHF(value) {
    return Number(value || 0).toLocaleString("de-CH", { style: "currency", currency: "CHF" });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Admin</h1>
          <p className="text-sm text-slate-500">Benutzerverwaltung & Rollen.</p>
        </div>
        <button
          onClick={loadRoles}
          disabled={rolesLoading}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs hover:bg-slate-100 disabled:opacity-60"
        >
          {rolesLoading ? "Lade…" : "Refresh"}
        </button>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      ) : null}

      {!isAdmin && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Du bist kein Admin. Rollen können nur von Admins geändert werden.
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="font-semibold">Go-Live Status (letzte 30 Tage)</div>
        <div className="mt-3 grid gap-3 md:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-500">Offene Belege</div>
            <div className="mt-1 text-lg font-semibold">
              {healthLoading ? "..." : (health.openDocuments ?? "-")}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-500">OP offen</div>
            <div className="mt-1 text-lg font-semibold">
              {healthLoading ? "..." : formatCHF(health.openAmount)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-500">OP überfällig</div>
            <div className="mt-1 text-lg font-semibold">
              {healthLoading ? "..." : formatCHF(health.overdueAmount)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-500">Mahnungen</div>
            <div className="mt-1 text-lg font-semibold">
              {healthLoading ? "..." : (health.dunningSent ?? "-")}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-500">Zahlungen</div>
            <div className="mt-1 text-lg font-semibold">
              {healthLoading ? "..." : (health.paymentRows ?? "-")}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700">
            Datenqualitäts-Warnungen
          </div>
          <div className="max-h-56 overflow-auto">
            {healthLoading ? (
              <div className="px-3 py-3 text-sm text-slate-500">Lade Qualitätsprüfungen...</div>
            ) : issues.length === 0 ? (
              <div className="px-3 py-3 text-sm text-emerald-700">Keine offenen Datenqualitäts-Probleme.</div>
            ) : (
              issues.map((issue, idx) => (
                <div key={`${issue.issue_type}-${issue.entity_id || "na"}-${idx}`} className="border-t border-slate-100 px-3 py-2 text-sm">
                  <div className="font-medium text-slate-800">{issue.issue_type}</div>
                  <div className="text-slate-600">{issue.message}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="font-semibold">Benutzer & Rollen</div>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
          <div className="grid grid-cols-[220px_1fr] bg-slate-100 px-3 py-2 text-xs text-slate-700">
            <div>User</div>
            <div>Rollen</div>
          </div>
          <div className="divide-y divide-slate-200">
            {rolesLoading ? (
              <div className="px-3 py-3 text-sm text-slate-500">Lade Rollen…</div>
            ) : appUsers.length === 0 ? (
              <div className="px-3 py-3 text-sm text-slate-500">Keine Benutzer gefunden.</div>
            ) : (
              appUsers.map((u) => {
                const roles = userRoles[u.id] || [];
                return (
                  <div key={u.id} className="grid grid-cols-[220px_1fr] px-3 py-2 text-sm">
                    <div className="truncate">{u.email || u.id}</div>
                    <div className="flex flex-wrap gap-2">
                      {roleOptions.map((r) => (
                        <button
                          key={r}
                          onClick={() => toggleRole(u.id, r)}
                          disabled={!isAdmin}
                          className={`rounded-full border px-2 py-0.5 text-xs ${
                            roles.includes(r)
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-white text-slate-600"
                          } ${!isAdmin ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-100"}`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
