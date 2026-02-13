import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function prettySupabaseError(error) {
  if (!error) return "";
  return error.message || String(error);
}

function copyToClipboard(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).catch(() => {});
}

function navigateTo(module, id) {
  window.dispatchEvent(new CustomEvent("app:navigate", { detail: { module, id } }));
}

function Badge({ children, tone = "default" }) {
  const toneCls =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : tone === "bad"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-slate-200 bg-white text-slate-800";

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${toneCls}`}>
      {children}
    </span>
  );
}

const STATUSES = [
  { key: "open", label: "Offen", tone: "warn" },
  { key: "in_progress", label: "In Arbeit", tone: "default" },
  { key: "done", label: "Erledigt", tone: "ok" },
];

export default function Tasks() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [purchases, setPurchases] = useState([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [orderId, setOrderId] = useState("");
  const [itemId, setItemId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all"); // all | mine | overdue
  const [reportMsg, setReportMsg] = useState("");

  async function load() {
    setLoading(true);
    setErr("");

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      setErr(prettySupabaseError(userErr));
      setLoading(false);
      return;
    }
    setCurrentUserId(userData.user.id);

    // ensure app_users row
    await supabase.from("app_users").upsert({ id: userData.user.id, email: userData.user.email || null });

    const [
      { data: usersRows, error: usersErr },
      { data: taskRows, error: taskErr },
      { data: orderRows, error: orderErr },
      { data: itemRows, error: itemErr },
      { data: supplierRows, error: supplierErr },
      { data: customerRows, error: customerErr },
      { data: purchaseRows, error: purchaseErr },
    ] = await Promise.all([
      supabase.from("app_users").select("id, email").order("email", { ascending: true }),
      supabase
        .from("tasks")
        .select(
          "id, title, description, status, due_date, assigned_to, created_at, order_id, item_id, supplier_id, customer_id, purchase_order_id"
        )
        .order("created_at", { ascending: false }),
      supabase.from("orders").select("id, order_no").order("created_at", { ascending: false }).limit(200),
      supabase.from("items").select("id, name").order("name", { ascending: true }).limit(500),
      supabase.from("suppliers").select("id, company_name").order("company_name", { ascending: true }).limit(500),
      supabase.from("customers").select("id, company_name").order("company_name", { ascending: true }).limit(500),
      supabase.from("purchase_orders").select("id, supplier_id, order_date").order("created_at", { ascending: false }).limit(200),
    ]);

    if (usersErr) setErr(prettySupabaseError(usersErr));
    if (taskErr) setErr(prettySupabaseError(taskErr));
    if (orderErr) setErr(prettySupabaseError(orderErr));
    if (itemErr) setErr(prettySupabaseError(itemErr));
    if (supplierErr) setErr(prettySupabaseError(supplierErr));
    if (customerErr) setErr(prettySupabaseError(customerErr));
    if (purchaseErr) setErr(prettySupabaseError(purchaseErr));

    setUsers(usersRows || []);
    setTasks(taskRows || []);
    setOrders(orderRows || []);
    setItems(itemRows || []);
    setSuppliers(supplierRows || []);
    setCustomers(customerRows || []);
    setPurchases(purchaseRows || []);
    setLoading(false);
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, []);

  const filteredTasks = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (tasks || []).filter((t) => {
      const text = `${t.title || ""} ${t.description || ""}`.toLowerCase();
      if (q.trim() && !text.includes(q.trim().toLowerCase())) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (scopeFilter === "mine" && t.assigned_to !== currentUserId) return false;
      if (scopeFilter === "overdue") {
        if (!t.due_date) return false;
        return t.due_date < today && t.status !== "done";
      }
      return true;
    });
  }, [tasks, q, statusFilter, scopeFilter, currentUserId]);

  const tasksByStatus = useMemo(() => {
    const map = new Map();
    STATUSES.forEach((s) => map.set(s.key, []));
    filteredTasks.forEach((t) => {
      if (!map.has(t.status)) map.set(t.status, []);
      map.get(t.status).push(t);
    });
    return map;
  }, [filteredTasks]);

  async function createTask(e) {
    e.preventDefault();
    setErr("");
    if (!title.trim()) return setErr("Titel fehlt.");

    const { error } = await supabase.from("tasks").insert({
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueDate || null,
      assigned_to: assignedTo || null,
      order_id: orderId || null,
      item_id: itemId || null,
      supplier_id: supplierId || null,
      customer_id: customerId || null,
      purchase_order_id: purchaseOrderId || null,
      status: "open",
    });

    if (error) return setErr(prettySupabaseError(error));

    setTitle("");
    setDescription("");
    setDueDate("");
    setAssignedTo("");
    setOrderId("");
    setItemId("");
    setSupplierId("");
    setCustomerId("");
    setPurchaseOrderId("");
    await load();
  }

  async function updateTask(id, patch) {
    setErr("");
    const { error } = await supabase.from("tasks").update(patch).eq("id", id);
    if (error) return setErr(prettySupabaseError(error));
    await load();
  }

  async function autoGenerateTasks() {
    setErr("");
    const today = new Date().toISOString().slice(0, 10);

    const { data: poRows, error: poErr } = await supabase
      .from("purchase_orders")
      .select("id, supplier_id, delivery_date, status")
      .in("status", ["open", "ordered"])
      .lte("delivery_date", today);

    if (poErr) return setErr(prettySupabaseError(poErr));

    const { data: itemRows, error: itemErr } = await supabase
      .from("items")
      .select("id, name, current_stock, status")
      .eq("status", "active")
      .lte("current_stock", 0);

    if (itemErr) return setErr(prettySupabaseError(itemErr));

    const existing = (tasks || []).filter((t) => t.status !== "done");

    const newTasks = [];

    (poRows || []).forEach((po) => {
      const exists = existing.some(
        (t) => t.purchase_order_id === po.id && t.title?.startsWith("Liefertermin")
      );
      if (!exists) {
        newTasks.push({
          title: `Liefertermin überfällig`,
          description: `Einkauf ${po.id.slice(0, 8)} ist fällig.`,
          status: "open",
          purchase_order_id: po.id,
          supplier_id: po.supplier_id,
        });
      }
    });

    (itemRows || []).forEach((it) => {
      const exists = existing.some(
        (t) => t.item_id === it.id && t.title?.startsWith("Bestand kritisch")
      );
      if (!exists) {
        newTasks.push({
          title: `Bestand kritisch`,
          description: `${it.name} ist unter 0 (aktueller Bestand).`,
          status: "open",
          item_id: it.id,
        });
      }
    });

    if (newTasks.length > 0) {
      const { error: insErr } = await supabase.from("tasks").insert(newTasks);
      if (insErr) return setErr(prettySupabaseError(insErr));
    }

    await load();
  }

  function onDragStart(e, task) {
    e.dataTransfer.setData("text/plain", task.id);
  }

  async function onDropStatus(e, status) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    if (!taskId) return;
    await updateTask(taskId, { status });
  }

  function allowDrop(e) {
    e.preventDefault();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Aufgaben</h1>
          <p className="text-sm text-slate-500">Kacheln ziehen, Nutzer zuweisen, Status verfolgen.</p>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      )}
      {reportMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {reportMsg}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-medium text-slate-800 mb-2">Neue Aufgabe</div>
        <form onSubmit={createTask} className="grid grid-cols-1 gap-3 md:grid-cols-[1.4fr_1.4fr_180px_200px_auto]">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
            placeholder="Titel"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
            placeholder="Beschreibung"
          />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
          />
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
          >
            <option value="">— Unassigned —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email || u.id}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm hover:bg-slate-200"
          >
            Anlegen
          </button>
        </form>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-5">
          <select
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
          >
            <option value="">— Auftrag —</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.order_no || o.id.slice(0, 8)}
              </option>
            ))}
          </select>
          <select
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
          >
            <option value="">— Artikel —</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
          >
            <option value="">— Lieferant —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.company_name}
              </option>
            ))}
          </select>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
          >
            <option value="">— Kunde —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>
          <select
            value={purchaseOrderId}
            onChange={(e) => setPurchaseOrderId(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
          >
            <option value="">— Einkauf —</option>
            {purchases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={autoGenerateTasks}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-100"
        >
          Auto-Aufgaben erzeugen
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Suche in Titel/Beschreibung…"
          className="w-full md:w-[320px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="all">Alle Status</option>
          <option value="open">Offen</option>
          <option value="in_progress">In Arbeit</option>
          <option value="done">Erledigt</option>
        </select>
        <select
          value={scopeFilter}
          onChange={(e) => setScopeFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="all">Alle Aufgaben</option>
          <option value="mine">Meine Aufgaben</option>
          <option value="overdue">Überfällig</option>
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {STATUSES.map((col) => (
          <div
            key={col.key}
            onDrop={(e) => onDropStatus(e, col.key)}
            onDragOver={allowDrop}
            className="rounded-2xl border border-slate-200 bg-white p-3 min-h-[200px]"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-sm">{col.label}</div>
              <Badge>{(tasksByStatus.get(col.key) || []).length}</Badge>
            </div>

            <div className="space-y-2">
              {(tasksByStatus.get(col.key) || []).map((t) => {
                const st = STATUSES.find((s) => s.key === t.status) || STATUSES[0];
                const isOverdue =
                  t.due_date && t.due_date < new Date().toISOString().slice(0, 10) && t.status !== "done";
                const assigned = users.find((u) => u.id === t.assigned_to);
                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, t)}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3 cursor-move"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm">{t.title}</div>
                      <div className="flex items-center gap-2">
                        {isOverdue && <Badge tone="bad">Überfällig</Badge>}
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </div>
                    </div>
                    {t.description ? (
                      <div className="text-xs text-slate-600 mt-1">{t.description}</div>
                    ) : null}
                    {t.due_date ? (
                      <div className="text-[11px] text-slate-500 mt-1">
                        Fällig: {new Date(t.due_date).toLocaleDateString("de-CH")}
                      </div>
                    ) : null}
                    {assigned ? (
                      <div className="text-[11px] text-slate-500 mt-1">Zuständig: {assigned.email}</div>
                    ) : (
                      <div className="text-[11px] text-slate-500 mt-1">Zuständig: —</div>
                    )}

                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      {t.order_id && (
                        <button
                          onClick={() => navigateTo("orders", t.order_id)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 hover:bg-slate-100"
                        >
                          Auftrag: {orders.find((o) => o.id === t.order_id)?.order_no || t.order_id.slice(0, 6)}
                        </button>
                      )}
                      {t.item_id && (
                        <button
                          onClick={() => navigateTo("items", t.item_id)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 hover:bg-slate-100"
                        >
                          Artikel: {items.find((i) => i.id === t.item_id)?.name || t.item_id.slice(0, 6)}
                        </button>
                      )}
                      {t.supplier_id && (
                        <button
                          onClick={() => navigateTo("suppliers", t.supplier_id)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 hover:bg-slate-100"
                        >
                          Lieferant:{" "}
                          {suppliers.find((s) => s.id === t.supplier_id)?.company_name ||
                            t.supplier_id.slice(0, 6)}
                        </button>
                      )}
                      {t.customer_id && (
                        <button
                          onClick={() => navigateTo("customers", t.customer_id)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 hover:bg-slate-100"
                        >
                          Kunde:{" "}
                          {customers.find((c) => c.id === t.customer_id)?.company_name ||
                            t.customer_id.slice(0, 6)}
                        </button>
                      )}
                      {t.purchase_order_id && (
                        <button
                          onClick={() => navigateTo("purchases", t.purchase_order_id)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 hover:bg-slate-100"
                        >
                          Einkauf: {t.purchase_order_id.slice(0, 6)}
                        </button>
                      )}
                    {(t.order_id || t.item_id || t.supplier_id || t.customer_id || t.purchase_order_id) && (
                      <button
                        onClick={() => {
                          const parts = [
                            t.order_id ? `order:${t.order_id}` : "",
                            t.item_id ? `item:${t.item_id}` : "",
                            t.supplier_id ? `supplier:${t.supplier_id}` : "",
                            t.customer_id ? `customer:${t.customer_id}` : "",
                            t.purchase_order_id ? `purchase:${t.purchase_order_id}` : "",
                          ].filter(Boolean);
                          copyToClipboard(parts.join(" | "));
                          setReportMsg("Links kopiert.");
                          setTimeout(() => setReportMsg(""), 1200);
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1"
                      >
                        Links kopieren
                      </button>
                    )}
                  </div>

                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <button
                        onClick={() => updateTask(t.id, { status: "open" })}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 hover:bg-slate-100"
                      >
                        Offen
                      </button>
                      <button
                        onClick={() => updateTask(t.id, { status: "in_progress" })}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 hover:bg-slate-100"
                      >
                        In Arbeit
                      </button>
                      <button
                        onClick={() => updateTask(t.id, { status: "done" })}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 hover:bg-slate-100"
                      >
                        Erledigt
                      </button>
                      <select
                        value={t.assigned_to || ""}
                        onChange={(e) => updateTask(t.id, { assigned_to: e.target.value || null })}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1"
                      >
                        <option value="">Unassigned</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.email || u.id}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {loading && <div className="text-sm text-slate-500">Lade…</div>}
    </div>
  );
}
