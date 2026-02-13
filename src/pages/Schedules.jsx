import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const WEEKDAYS = [
  { value: 1, label: "Montag" },
  { value: 2, label: "Dienstag" },
  { value: 3, label: "Mittwoch" },
  { value: 4, label: "Donnerstag" },
  { value: 5, label: "Freitag" },
  { value: 6, label: "Samstag" },
  { value: 7, label: "Sonntag" },
];
const PLANNER_STORAGE_KEY = "kmu.weekplanner.events.v1";
const DAY_MINUTES = 24 * 60;
const SLOT_HEIGHT = 22;

function prettySupabaseError(error) {
  if (!error) return "";
  return error.message || String(error);
}

function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

function getMonday(dateLike) {
  const d = new Date(dateLike);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDayDate(dateObj) {
  return dateObj.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function minutesBetween(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  const [sh, sm] = String(startTime).slice(0, 5).split(":").map(Number);
  const [eh, em] = String(endTime).slice(0, 5).split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  return Math.max((eh * 60 + em) - (sh * 60 + sm), 0);
}

function formatHours(minutes) {
  return (Math.round((minutes / 60) * 10) / 10).toFixed(1);
}

function formatClock(timeValue) {
  if (!timeValue) return "--:--";
  return String(timeValue).slice(0, 5);
}

function initialsFromName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function timeToMinutes(timeValue) {
  if (!timeValue) return 0;
  const [h, m] = String(timeValue).slice(0, 5).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function minutesToTime(mins) {
  const clamped = Math.max(0, Math.min(mins, DAY_MINUTES));
  const h = Math.floor(clamped / 60)
    .toString()
    .padStart(2, "0");
  const m = (clamped % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function eventColor(index) {
  const palette = [
    { bg: "rgba(191, 227, 255, 0.88)", border: "rgba(124, 177, 212, 0.9)" },
    { bg: "rgba(205, 239, 220, 0.88)", border: "rgba(130, 186, 155, 0.9)" },
    { bg: "rgba(252, 238, 198, 0.9)", border: "rgba(214, 182, 120, 0.9)" },
    { bg: "rgba(247, 220, 227, 0.9)", border: "rgba(198, 145, 159, 0.88)" },
  ];
  return palette[index % palette.length];
}

function normalizePlannerEvents(events) {
  const seen = new Set();
  const normalized = [];
  (events || []).forEach((e) => {
    if (!e || !e.dateKey || !e.employee_name) return;
    const startMin = Number(e.startMin);
    const endMin = Number(e.endMin);
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) return;
    const dedupeKey = `${e.dateKey}|${e.employee_user_id || e.employee_name}|${startMin}|${endMin}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    normalized.push({
      id: e.id || crypto.randomUUID(),
      dateKey: e.dateKey,
      weekday: Number(e.weekday) || 1,
      startMin,
      endMin,
      employee_name: e.employee_name,
      employee_user_id: e.employee_user_id || null,
      location: e.location || "",
      notes: e.notes || "",
    });
  });
  return normalized;
}

function weekDateKey(weekStartIso, weekday) {
  const d = new Date(weekStartIso);
  d.setDate(d.getDate() + (weekday - 1));
  return toIsoDate(d);
}

function slotToMinutes(slotIndex, slotMinutes) {
  const totalSlots = DAY_MINUTES / slotMinutes;
  const slot = Math.max(0, Math.min(slotIndex, totalSlots));
  return slot * slotMinutes;
}

function hasOverlap(events, candidate, ignoreId = null) {
  return events.some((e) => {
    if (ignoreId && e.id === ignoreId) return false;
    if (e.dateKey !== candidate.dateKey) return false;
    return candidate.startMin < e.endMin && e.startMin < candidate.endMin;
  });
}

function weekEndFromStart(weekStartIso) {
  const d = new Date(weekStartIso);
  d.setDate(d.getDate() + 6);
  return toIsoDate(d);
}

export default function Schedules() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [edits, setEdits] = useState({});
  const [weekStart, setWeekStart] = useState(() => toIsoDate(getMonday(new Date())));

  const [employeeName, setEmployeeName] = useState("");
  const [employeeUserId, setEmployeeUserId] = useState("");
  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedPlannerEmployee, setSelectedPlannerEmployee] = useState(null);
  const [selectedPlannerEventId, setSelectedPlannerEventId] = useState(null);
  const [selectedPlannerEventIds, setSelectedPlannerEventIds] = useState([]);
  const [slotMinutes, setSlotMinutes] = useState(30);
  const [allowOverlap, setAllowOverlap] = useState(true);
  const [plannerPersistMode, setPlannerPersistMode] = useState("local");
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [eventEditor, setEventEditor] = useState(null);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [plannerEvents, setPlannerEvents] = useState(() => {
    try {
      const raw = localStorage.getItem(PLANNER_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return normalizePlannerEvents(Array.isArray(parsed) ? parsed : []);
    } catch {
      return [];
    }
  });
  const [dragCreateState, setDragCreateState] = useState(null);
  const [resizeState, setResizeState] = useState(null);
  const dayColumnRefs = useRef({});
  const weekEnd = useMemo(() => weekEndFromStart(weekStart), [weekStart]);
  const totalSlots = useMemo(() => DAY_MINUTES / slotMinutes, [slotMinutes]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");

    const [{ data: scheduleRows, error: scheduleErr }, { data: userRows, error: userErr }, plannerResp] = await Promise.all([
      supabase
        .from("employee_schedules")
        .select("id, employee_name, employee_user_id, weekday, start_time, end_time, location, notes, is_active, created_at")
        .order("weekday", { ascending: true })
        .order("start_time", { ascending: true }),
      supabase.from("app_users").select("id, email").order("email", { ascending: true }),
      supabase
        .from("employee_planner_events")
        .select("id, event_date, weekday, start_time, end_time, employee_user_id, employee_name, location, notes")
        .gte("event_date", weekStart)
        .lte("event_date", weekEnd)
        .order("event_date", { ascending: true })
        .order("start_time", { ascending: true }),
    ]);

    if (scheduleErr) setErr(prettySupabaseError(scheduleErr));
    if (userErr) setErr(prettySupabaseError(userErr));
    setRows(scheduleRows || []);
    setUsers(userRows || []);
    if (!plannerResp?.error) {
      setPlannerPersistMode("db");
      const dbEvents = (plannerResp.data || []).map((x) => ({
        id: x.id,
        dateKey: x.event_date,
        weekday: x.weekday,
        startMin: timeToMinutes(x.start_time),
        endMin: timeToMinutes(x.end_time),
        employee_name: x.employee_name,
        employee_user_id: x.employee_user_id || null,
        location: x.location || "",
        notes: x.notes || "",
      }));
      setPlannerEvents(normalizePlannerEvents(dbEvents));
      setHistory([]);
      setFuture([]);
    } else if (plannerResp.error?.code === "42P01") {
      setPlannerPersistMode("local");
    } else {
      setErr(prettySupabaseError(plannerResp.error));
    }
    setLoading(false);
  }, [weekStart, weekEnd]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    if (plannerPersistMode !== "local") return;
    localStorage.setItem(`${PLANNER_STORAGE_KEY}:${weekStart}`, JSON.stringify(plannerEvents));
  }, [plannerEvents, plannerPersistMode, weekStart]);

  useEffect(() => {
    if (plannerPersistMode !== "local") return;
    try {
      const raw = localStorage.getItem(`${PLANNER_STORAGE_KEY}:${weekStart}`);
      if (!raw) {
        queueMicrotask(() => {
          setPlannerEvents([]);
        });
        return;
      }
      const parsed = JSON.parse(raw);
      const normalized = normalizePlannerEvents(Array.isArray(parsed) ? parsed : []);
      queueMicrotask(() => {
        setPlannerEvents(normalized);
      });
    } catch {
      queueMicrotask(() => {
        setPlannerEvents([]);
      });
    }
  }, [plannerPersistMode, weekStart]);

  const syncPlannerEventsToDb = useCallback(async (nextEvents) => {
    if (plannerPersistMode !== "db") return true;
    const { error: delErr } = await supabase
      .from("employee_planner_events")
      .delete()
      .gte("event_date", weekStart)
      .lte("event_date", weekEnd);
    if (delErr) {
      setErr(prettySupabaseError(delErr));
      return false;
    }
    if (!nextEvents.length) return true;
    const payload = nextEvents.map((e) => ({
      event_date: e.dateKey,
      weekday: e.weekday,
      start_time: minutesToTime(e.startMin),
      end_time: minutesToTime(e.endMin),
      employee_name: e.employee_name,
      employee_user_id: e.employee_user_id || null,
      location: e.location || null,
      notes: e.notes || null,
    }));
    const { error: insErr } = await supabase.from("employee_planner_events").insert(payload);
    if (insErr) {
      setErr(prettySupabaseError(insErr));
      return false;
    }
    return true;
  }, [plannerPersistMode, weekStart, weekEnd]);

  const updatePlannerEvents = useCallback((nextEvents, options = {}) => {
    const normalized = normalizePlannerEvents(nextEvents);
    setPlannerEvents((old) => {
      if (!options.skipHistory) setHistory((h) => [...h.slice(-39), old]);
      if (!options.skipHistory) setFuture([]);
      return normalized;
    });
    void syncPlannerEventsToDb(normalized);
  }, [syncPlannerEventsToDb]);

  const tryApplyPlannerChange = useCallback((nextEvents, fallbackMessage) => {
    const normalized = normalizePlannerEvents(nextEvents);
    if (!allowOverlap) {
      const hasAnyConflict = normalized.some((e) => hasOverlap(normalized, e, e.id));
      if (hasAnyConflict) {
        setErr("Konflikt erkannt: Überschneidungen sind deaktiviert.");
        return false;
      }
    }
    updatePlannerEvents(normalized);
    if (fallbackMessage) setOk(fallbackMessage);
    return true;
  }, [allowOverlap, updatePlannerEvents]);

  const undoPlannerChange = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setFuture((f) => [plannerEvents, ...f.slice(0, 39)]);
      setPlannerEvents(prev);
      void syncPlannerEventsToDb(prev);
      return h.slice(0, -1);
    });
  }, [plannerEvents, syncPlannerEventsToDb]);

  const redoPlannerChange = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const [next, ...rest] = f;
      setHistory((h) => [...h.slice(-39), plannerEvents]);
      setPlannerEvents(next);
      void syncPlannerEventsToDb(next);
      return rest;
    });
  }, [plannerEvents, syncPlannerEventsToDb]);

  const weekDays = useMemo(() => {
    const start = new Date(weekStart);
    return WEEKDAYS.map((d, idx) => {
      const dateObj = new Date(start);
      dateObj.setDate(start.getDate() + idx);
      return {
        ...d,
        dateObj,
        dateLabel: formatDayDate(dateObj),
      };
    });
  }, [weekStart]);

  const rowsByWeekday = useMemo(() => {
    const map = new Map();
    WEEKDAYS.forEach((d) => map.set(d.value, []));
    (rows || []).forEach((r) => {
      if (!map.has(r.weekday)) map.set(r.weekday, []);
      map.get(r.weekday).push(r);
    });
    return map;
  }, [rows]);

  const weekOverview = useMemo(() => {
    const byEmployee = new Map();

    (rows || []).forEach((r) => {
      const key = r.employee_user_id || `name:${r.employee_name}`;
      if (!byEmployee.has(key)) {
        byEmployee.set(key, {
          key,
          employee_name: r.employee_name || "-",
          employee_user_id: r.employee_user_id || null,
          dayEntries: new Map(WEEKDAYS.map((d) => [d.value, []])),
          totalMinutes: 0,
        });
      }
      const item = byEmployee.get(key);
      item.dayEntries.get(r.weekday)?.push(r);
      item.totalMinutes += minutesBetween(r.start_time, r.end_time);
    });

    const out = Array.from(byEmployee.values()).sort((a, b) => a.employee_name.localeCompare(b.employee_name));
    out.forEach((item) => {
      WEEKDAYS.forEach((d) => {
        const list = item.dayEntries.get(d.value) || [];
        list.sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
      });
    });
    return out;
  }, [rows]);

  const nextUp = useMemo(() => {
    const now = new Date();
    const jsDay = now.getDay();
    const weekdayNow = jsDay === 0 ? 7 : jsDay;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const activeRows = (rows || []).filter((r) => r.is_active);
    let best = null;

    activeRows.forEach((r) => {
      const [sh = 0, sm = 0] = formatClock(r.start_time).split(":").map(Number);
      const startMinutes = sh * 60 + sm;
      let dayOffset = r.weekday - weekdayNow;
      if (dayOffset < 0 || (dayOffset === 0 && startMinutes <= nowMinutes)) dayOffset += 7;
      const score = dayOffset * 24 * 60 + startMinutes;
      if (!best || score < best.score) {
        best = { row: r, score, dayOffset };
      }
    });

    return best;
  }, [rows]);

  const weekProgressPct = useMemo(() => {
    const now = new Date();
    const jsDay = now.getDay();
    const weekdayNow = jsDay === 0 ? 7 : jsDay;
    const dayProgress = (now.getHours() * 60 + now.getMinutes()) / (24 * 60);
    const pct = ((weekdayNow - 1 + dayProgress) / 7) * 100;
    return Math.max(0, Math.min(100, pct));
  }, []);

  function userLabelById(id) {
    if (!id) return "";
    const u = users.find((x) => x.id === id);
    return u?.email || id;
  }

  const employeeCards = useMemo(() => {
    const out = [];
    const seen = new Set();

    (users || []).forEach((u) => {
      const label = u.email || u.id;
      const key = `user:${u.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        employee_name: label,
        employee_user_id: u.id,
        key,
      });
    });

    (rows || []).forEach((r) => {
      const key = r.employee_user_id ? `user:${r.employee_user_id}` : `name:${r.employee_name}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        employee_name: r.employee_name,
        employee_user_id: r.employee_user_id,
        key,
      });
    });

    return out.sort((a, b) => a.employee_name.localeCompare(b.employee_name));
  }, [rows, users]);

  const plannerEventsByDate = useMemo(() => {
    const byDate = new Map();
    plannerEvents.forEach((event) => {
      if (!byDate.has(event.dateKey)) byDate.set(event.dateKey, []);
      byDate.get(event.dateKey).push(event);
    });

    const out = new Map();
    byDate.forEach((events, dateKey) => {
      const sorted = [...events].sort((a, b) => {
        if (a.startMin !== b.startMin) return a.startMin - b.startMin;
        return a.endMin - b.endMin;
      });

      const lanes = [];
      const withLane = sorted.map((event) => {
        let lane = 0;
        while (lane < lanes.length && event.startMin < lanes[lane]) lane += 1;
        lanes[lane] = event.endMin;
        return { ...event, lane };
      });
      const laneCount = Math.max(...withLane.map((e) => e.lane), 0) + 1;
      out.set(dateKey, { laneCount, events: withLane });
    });
    return out;
  }, [plannerEvents]);

  function draftFor(row) {
    return edits[row.id] || {
      start_time: row.start_time?.slice(0, 5) || "08:00",
      end_time: row.end_time?.slice(0, 5) || "17:00",
      location: row.location || "",
      notes: row.notes || "",
      is_active: !!row.is_active,
    };
  }

  function handleDragStartEmployee(e, card) {
    const payload = JSON.stringify(card);
    e.dataTransfer.setData("application/json", payload);
    e.dataTransfer.setData("text/plain", payload);
    e.dataTransfer.effectAllowed = "copyMove";
  }

  function handleDragStartPlannerEvent(e, eventItem) {
    e.dataTransfer.setData(
      "application/x-kmu-planner-event",
      JSON.stringify({
        id: eventItem.id,
      })
    );
    e.dataTransfer.effectAllowed = "move";
  }

  function parseEmployeeDragData(dataTransfer) {
    const types = ["application/json", "text/plain"];
    for (const type of types) {
      try {
        const raw = dataTransfer.getData(type);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed?.employee_name) return parsed;
      } catch {
        // try next type
      }
    }
    return null;
  }

  async function handleDropOnWeekday(e, weekdayValue) {
    e.preventDefault();
    setErr("");
    setOk("");
    const payload = parseEmployeeDragData(e.dataTransfer);
    if (!payload) {
      setErr("Ungültige Drag-Daten.");
      return;
    }

    if (!payload?.employee_name) {
      setErr("Mitarbeitername fehlt.");
      return;
    }

    const { error } = await supabase.from("employee_schedules").insert({
      employee_name: payload.employee_name,
      employee_user_id: payload.employee_user_id || null,
      weekday: weekdayValue,
      start_time: "08:00",
      end_time: "17:00",
      is_active: true,
    });

    if (error) {
      setErr(prettySupabaseError(error));
      return;
    }

    setOk("Mitarbeiter in den Wochenplan eingeplant.");
    await load();
  }

  function handleDropOnPlannerDay(e, weekdayValue) {
    e.preventDefault();
    setErr("");
    setOk("");

    let plannerPayload = null;
    try {
      plannerPayload = JSON.parse(e.dataTransfer.getData("application/x-kmu-planner-event") || "null");
    } catch {
      plannerPayload = null;
    }

    if (plannerPayload?.id) {
      const slot = pointerToSlot(weekdayValue, e.clientY);
      const startMin = slotToMinutes(slot, slotMinutes);
      const current = plannerEvents.find((x) => x.id === plannerPayload.id);
      if (!current) return;
      const duration = Math.max(current.endMin - current.startMin, slotMinutes);
      const nextEnd = Math.min(startMin + duration, DAY_MINUTES);
      const adjustedStart = Math.max(0, nextEnd - duration);
      const next = plannerEvents.map((x) =>
        x.id === plannerPayload.id
          ? {
              ...x,
              weekday: weekdayValue,
              dateKey: weekDateKey(weekStart, weekdayValue),
              startMin: adjustedStart,
              endMin: nextEnd,
            }
          : x
      );
      if (!tryApplyPlannerChange(next, "Schicht verschoben.")) return;
      setSelectedPlannerEventId(plannerPayload.id);
      return;
    }

    const payload = parseEmployeeDragData(e.dataTransfer);
    if (!payload) {
      setErr("Ungültige Drag-Daten.");
      return;
    }

    if (!payload?.employee_name) {
      setErr("Mitarbeitername fehlt.");
      return;
    }

    const slot = pointerToSlot(weekdayValue, e.clientY);
    const startMin = slotToMinutes(slot, slotMinutes);
    const endMin = Math.min(startMin + 2 * slotMinutes, DAY_MINUTES);
    const dateKey = weekDateKey(weekStart, weekdayValue);

    const newEvent = {
      id: crypto.randomUUID(),
      dateKey,
      weekday: weekdayValue,
      startMin,
      endMin,
      employee_name: payload.employee_name,
      employee_user_id: payload.employee_user_id || null,
      location: "",
      notes: "",
    };

    if (!tryApplyPlannerChange([...plannerEvents, newEvent], "Mitarbeiter in den Zeitplan gezogen.")) return;
    setSelectedPlannerEmployee({
      employee_name: payload.employee_name,
      employee_user_id: payload.employee_user_id || null,
      key: payload.employee_user_id ? `user:${payload.employee_user_id}` : `name:${payload.employee_name}`,
    });
  }

  function allowDrop(e) {
    e.preventDefault();
  }

  function pointerToSlot(weekday, clientY) {
    const col = dayColumnRefs.current[weekday];
    if (!col) return 0;
    const rect = col.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    return Math.floor(y / SLOT_HEIGHT);
  }

  function beginDragCreate(weekday, clientY, eventTarget, mouseButton = 0) {
    if (mouseButton !== 0) return;
    if (eventTarget && eventTarget.closest("button")) return;
    if (eventTarget && eventTarget.closest("[data-planner-event='1']")) return;
    if (!selectedPlannerEmployee?.employee_name) {
      setErr("Bitte zuerst oben einen Mitarbeiter wählen.");
      return;
    }
    const startSlot = pointerToSlot(weekday, clientY);
    setErr("");
    setDragCreateState({
      weekday,
      startSlot,
      currentSlot: startSlot,
      dateKey: weekDateKey(weekStart, weekday),
      hasMoved: false,
    });
  }

  useEffect(() => {
    if (!dragCreateState) return undefined;

    function onMove(e) {
      setDragCreateState((prev) => {
        if (!prev) return prev;
        const slot = pointerToSlot(prev.weekday, e.clientY);
        const clamped = Math.max(0, Math.min(slot, totalSlots));
        return {
          ...prev,
          currentSlot: clamped,
          hasMoved: prev.hasMoved || clamped !== prev.startSlot,
        };
      });
    }

    function onUp() {
      setDragCreateState((prev) => {
        if (!prev) return null;
        const startSlot = Math.min(prev.startSlot, prev.currentSlot);
        const endSlot = Math.max(prev.startSlot, prev.currentSlot);
        if (!prev.hasMoved || endSlot <= startSlot) return null;
        const startMin = slotToMinutes(startSlot, slotMinutes);
        const endMin = slotToMinutes(endSlot, slotMinutes);
        const card = selectedPlannerEmployee;
        if (!card?.employee_name) return null;
        const newEvent = {
          id: crypto.randomUUID(),
          dateKey: prev.dateKey,
          weekday: prev.weekday,
          startMin,
          endMin,
          employee_name: card.employee_name,
          employee_user_id: card.employee_user_id || null,
          location: "",
          notes: "",
        };
        tryApplyPlannerChange([...plannerEvents, newEvent], "Schicht im Wochenplan erstellt.");
        return null;
      });
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragCreateState, plannerEvents, selectedPlannerEmployee, slotMinutes, totalSlots, weekStart, tryApplyPlannerChange]);

  useEffect(() => {
    if (!resizeState) return undefined;

    function onMove(e) {
      setResizeState((prev) => {
        if (!prev) return prev;
        const event = plannerEvents.find((x) => x.id === prev.id);
        if (!event) return null;
        const slot = pointerToSlot(prev.weekday, e.clientY);
        const mins = slotToMinutes(slot, slotMinutes);
        if (prev.edge === "start") {
          return {
            ...prev,
            draftStartMin: Math.max(0, Math.min(mins, event.endMin - slotMinutes)),
            draftEndMin: event.endMin,
          };
        }
        return {
          ...prev,
          draftStartMin: event.startMin,
          draftEndMin: Math.min(DAY_MINUTES, Math.max(mins, event.startMin + slotMinutes)),
        };
      });
    }

    function onUp() {
      const rs = resizeState;
      setResizeState(null);
      if (!rs) return;
      const next = plannerEvents.map((x) =>
        x.id === rs.id ? { ...x, startMin: rs.draftStartMin, endMin: rs.draftEndMin } : x
      );
      tryApplyPlannerChange(next, "Block-Zeit aktualisiert.");
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [plannerEvents, resizeState, slotMinutes, tryApplyPlannerChange]);

  function openEditor(eventItem) {
    setEventEditor({
      ...eventItem,
      start: minutesToTime(eventItem.startMin),
      end: minutesToTime(eventItem.endMin),
    });
  }

  function saveEditor() {
    if (!eventEditor) return;
    const startMin = timeToMinutes(eventEditor.start);
    const endMin = timeToMinutes(eventEditor.end);
    if (endMin <= startMin) {
      setErr("Ungültige Zeitspanne.");
      return;
    }
    const next = plannerEvents.map((x) =>
      x.id === eventEditor.id
        ? {
            ...x,
            startMin,
            endMin,
            location: eventEditor.location || "",
            notes: eventEditor.notes || "",
          }
        : x
    );
    if (!tryApplyPlannerChange(next, "Block bearbeitet.")) return;
    setEventEditor(null);
  }

  const removePlannerEvent = useCallback((id) => {
    const next = plannerEvents.filter((e) => e.id !== id);
    updatePlannerEvents(next);
    setSelectedPlannerEventId((prev) => (prev === id ? null : prev));
    setSelectedPlannerEventIds((prev) => prev.filter((x) => x !== id));
  }, [plannerEvents, updatePlannerEvents]);

  function clearPlannerWeek() {
    updatePlannerEvents([]);
    setOk("Wochenraster geleert.");
  }

  const bulkDeletePlannerEvents = useCallback(() => {
    if (!selectedPlannerEventIds.length) return;
    const selected = new Set(selectedPlannerEventIds);
    const next = plannerEvents.filter((e) => !selected.has(e.id));
    updatePlannerEvents(next);
    setSelectedPlannerEventId(null);
    setSelectedPlannerEventIds([]);
    setOk("Ausgewählte Blöcke gelöscht.");
  }, [selectedPlannerEventIds, plannerEvents, updatePlannerEvents]);

  useEffect(() => {
    function onDeleteKey(e) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (!selectedPlannerEventId) return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      e.preventDefault();
      if (selectedPlannerEventIds.length > 1) {
        bulkDeletePlannerEvents();
      } else {
        removePlannerEvent(selectedPlannerEventId);
        setOk("Ausgewählten Block gelöscht.");
      }
    }
    function onHelpToggle(e) {
      if (e.key !== "?") return;
      setShowShortcutHelp((old) => !old);
    }
    function onUndoRedo(e) {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undoPlannerChange();
      }
      if (e.key.toLowerCase() === "z" && e.shiftKey) {
        e.preventDefault();
        redoPlannerChange();
      }
    }
    window.addEventListener("keydown", onDeleteKey);
    window.addEventListener("keydown", onHelpToggle);
    window.addEventListener("keydown", onUndoRedo);
    return () => {
      window.removeEventListener("keydown", onDeleteKey);
      window.removeEventListener("keydown", onHelpToggle);
      window.removeEventListener("keydown", onUndoRedo);
    };
  }, [selectedPlannerEventId, selectedPlannerEventIds, plannerEvents, bulkDeletePlannerEvents, redoPlannerChange, removePlannerEvent, undoPlannerChange]);

  async function createSchedule(e) {
    e.preventDefault();
    setErr("");
    setOk("");

    if (!employeeName.trim()) {
      setErr("Mitarbeitername fehlt.");
      return;
    }
    if (!startTime || !endTime || startTime >= endTime) {
      setErr("Ungültige Zeitspanne.");
      return;
    }

    const { error } = await supabase.from("employee_schedules").insert({
      employee_name: employeeName.trim(),
      employee_user_id: employeeUserId || null,
      weekday,
      start_time: startTime,
      end_time: endTime,
      location: location.trim() || null,
      notes: notes.trim() || null,
      is_active: true,
    });

    if (error) {
      setErr(prettySupabaseError(error));
      return;
    }

    setEmployeeName("");
    setEmployeeUserId("");
    setWeekday(1);
    setStartTime("08:00");
    setEndTime("17:00");
    setLocation("");
    setNotes("");
    setOk("Eintrag erstellt.");
    await load();
  }

  return (
    <div className="scheduler-module space-y-6" style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" }}>
      <div className="rounded-[24px] border border-white/80 bg-white/70 p-6 shadow-[0_24px_80px_rgba(148,163,184,0.25)] backdrop-blur-xl">
        <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-slate-200/70">
          <div className="h-full rounded-full bg-sky-300 transition-all" style={{ width: `${weekProgressPct}%` }} />
        </div>

        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Stundenplan Dashboard</h1>
            <p className="text-sm text-slate-500">
              Woche {weekDays[0]?.dateLabel} - {weekDays[6]?.dateLabel}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const d = new Date(weekStart);
                d.setDate(d.getDate() - 7);
                setWeekStart(toIsoDate(d));
              }}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Vorwoche
            </button>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(toIsoDate(getMonday(e.target.value)))}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
            />
            <button
              type="button"
              onClick={() => {
                const d = new Date(weekStart);
                d.setDate(d.getDate() + 7);
                setWeekStart(toIsoDate(d));
              }}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Folgewoche
            </button>
            <select
              value={slotMinutes}
              onChange={(e) => setSlotMinutes(Number(e.target.value))}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
              title="Raster-Zoom"
            >
              <option value={15}>15m</option>
              <option value={30}>30m</option>
              <option value={60}>60m</option>
            </select>
            <button
              type="button"
              onClick={() => setAllowOverlap((old) => !old)}
              className={`rounded-2xl border px-3 py-2 text-xs ${
                allowOverlap
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
              title="Konfliktregel umschalten"
            >
              {allowOverlap ? "Überlappung erlaubt" : "Keine Überlappung"}
            </button>
            <button
              type="button"
              onClick={undoPlannerChange}
              disabled={!history.length}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 disabled:opacity-40"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={redoPlannerChange}
              disabled={!future.length}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 disabled:opacity-40"
            >
              Redo
            </button>
            <button
              type="button"
              onClick={bulkDeletePlannerEvents}
              disabled={!selectedPlannerEventIds.length}
              className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 disabled:opacity-40"
            >
              Auswahl löschen
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-[24px] border border-sky-200/60 bg-gradient-to-br from-cyan-100/90 to-blue-200/90 p-6 shadow-[0_20px_56px_rgba(56,189,248,0.35)] backdrop-blur-md">
          <div className="text-3xl font-semibold text-slate-900">Up Next</div>
          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/70 bg-white text-lg font-semibold text-slate-700 shadow-sm">
              {initialsFromName(nextUp?.row?.employee_name || "Data Structures")}
            </div>
            <div className="min-w-0">
              <div className="text-2xl font-semibold text-slate-900">
                {nextUp?.row?.notes || nextUp?.row?.employee_name || "Data Structures"}
              </div>
              <div className="text-sm text-slate-600">
                Raum {nextUp?.row?.location || "303"} • {nextUp ? `${WEEKDAYS.find((d) => d.value === nextUp.row.weekday)?.label || ""}, ${formatClock(nextUp.row.start_time)}` : "Heute"}
              </div>
            </div>
          </div>
          <div className="mt-5 h-1.5 w-full rounded-full bg-white/70">
            <div className="h-full w-1/3 rounded-full bg-sky-300" />
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-3">
          {employeeCards.map((card) => (
            <button
              key={card.key}
              type="button"
              draggable
              onDragStart={(e) => handleDragStartEmployee(e, card)}
              onClick={() => setSelectedPlannerEmployee(card)}
              className={`rounded-2xl border px-4 py-2 text-sm shadow-sm ${
                selectedPlannerEmployee?.key === card.key
                  ? "border-sky-300 bg-sky-100 text-slate-900"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              title="Klick: für Drag-Erstellen auswählen. Drag: in Tageskarte."
            >
              {card.employee_name}
            </button>
          ))}
        </div>

        <div className="mb-4 text-2xl font-semibold text-slate-900">Week View</div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm text-slate-600">
            Schritt 1: Mitarbeiter oben auswählen. Schritt 2: In einem Tag im Raster ziehen (Drag), um einen Block zu erstellen.
          </div>
          <button
            type="button"
            onClick={clearPlannerWeek}
            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
          >
            Woche im Raster leeren
          </button>
        </div>
        <div className="mb-4 text-xs text-slate-500">
          Bei sehr vielen Überschneidungen werden maximal 4 Spuren dargestellt, weitere als +N.
        </div>
        <div className="mb-4 text-xs text-slate-500">
          Block anklicken zum Auswählen, dann mit `Delete`/`Backspace` löschen. Vorhandene Blöcke per Drag im Raster verschieben. Doppelklick öffnet den Editor. Persistenz: {plannerPersistMode === "db" ? "DB" : "LocalStorage"}.
        </div>

        <div className="scheduler-grid mb-8 overflow-x-auto rounded-[24px] border border-slate-200 bg-white/90 p-3">
          <div className="grid min-w-[1400px] grid-cols-[90px_repeat(7,1fr)] gap-2">
            <div className="sticky left-0 z-10 rounded-2xl bg-white">
              <div className="h-12 border-b border-slate-200 px-2 py-3 text-xs font-semibold text-slate-500">Zeit</div>
              <div
                className="relative"
                style={{
                  height: `${totalSlots * SLOT_HEIGHT}px`,
                }}
              >
                {Array.from({ length: totalSlots + 1 }).map((_, i) => {
                  if (i % 2 !== 0) return null;
                  const mins = slotToMinutes(i, slotMinutes);
                  return (
                    <div
                      key={`t-${i}`}
                      className="absolute left-0 right-0 border-t border-slate-100 text-[11px] text-slate-400"
                      style={{ top: `${i * SLOT_HEIGHT}px` }}
                    >
                      <span className="absolute -top-2 left-1">{minutesToTime(mins)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {weekDays.map((d) => {
              const dateKey = weekDateKey(weekStart, d.value);
              const layout = plannerEventsByDate.get(dateKey) || { laneCount: 1, events: [] };
              return (
                <div key={`cal-${d.value}`} className="rounded-2xl border border-slate-200 bg-white">
                  <div className="h-12 border-b border-slate-200 px-3 py-2">
                    <div className="text-sm font-semibold text-slate-900">{d.label}</div>
                    <div className="text-xs text-slate-500">{d.dateLabel}</div>
                  </div>
                  <div
                    ref={(el) => {
                      dayColumnRefs.current[d.value] = el;
                    }}
                    className="relative cursor-crosshair"
                    style={{ height: `${totalSlots * SLOT_HEIGHT}px` }}
                    onMouseDown={(e) => beginDragCreate(d.value, e.clientY, e.target, e.button)}
                    onDrop={(e) => handleDropOnPlannerDay(e, d.value)}
                    onDragOver={allowDrop}
                  >
                    {Array.from({ length: totalSlots + 1 }).map((_, i) => (
                      <div
                        key={`line-${d.value}-${i}`}
                        className={`pointer-events-none absolute left-0 right-0 border-t ${
                          i % 2 === 0 ? "border-slate-200/70" : "border-slate-100"
                        }`}
                        style={{ top: `${i * SLOT_HEIGHT}px` }}
                      />
                    ))}

                    {layout.events.map((event, idx) => {
                      const color = eventColor(idx);
                      const visibleLanes = Math.min(layout.laneCount, 4);
                      if (event.lane >= visibleLanes) return null;
                      const laneWidth = 100 / visibleLanes;
                      const left = event.lane * laneWidth;
                      const width = laneWidth;
                      const top = (event.startMin / slotMinutes) * SLOT_HEIGHT;
                      const height = Math.max(
                        ((event.endMin - event.startMin) / slotMinutes) * SLOT_HEIGHT,
                        SLOT_HEIGHT
                      );
                      const isSelected = selectedPlannerEventId === event.id || selectedPlannerEventIds.includes(event.id);
                      const isResizing = resizeState?.id === event.id;
                      const renderTop = isResizing ? (resizeState.draftStartMin / slotMinutes) * SLOT_HEIGHT : top;
                      const renderHeight = isResizing
                        ? Math.max(((resizeState.draftEndMin - resizeState.draftStartMin) / slotMinutes) * SLOT_HEIGHT, SLOT_HEIGHT)
                        : height;
                      return (
                        <div
                          key={event.id}
                          data-planner-event="1"
                          draggable
                          onDragStart={(ev) => handleDragStartPlannerEvent(ev, event)}
                          onDoubleClick={(ev) => {
                            ev.stopPropagation();
                            openEditor(event);
                          }}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setSelectedPlannerEventId(event.id);
                            setSelectedPlannerEventIds((old) => {
                              if (ev.metaKey || ev.ctrlKey) {
                                const set = new Set(old);
                                if (set.has(event.id)) set.delete(event.id);
                                else set.add(event.id);
                                return Array.from(set);
                              }
                              return [event.id];
                            });
                          }}
                          className="absolute overflow-hidden rounded-xl border px-2 py-1 shadow-[0_6px_20px_rgba(0,0,0,0.08)]"
                          style={{
                            top: `${renderTop}px`,
                            left: `calc(${left}% + 2px)`,
                            width: `calc(${width}% - 4px)`,
                            height: `${renderHeight}px`,
                            background: color.bg,
                            borderColor:
                              isSelected ? "rgba(15, 23, 42, 0.8)" : color.border,
                            boxShadow:
                              isSelected
                                ? "0 0 0 2px rgba(15, 23, 42, 0.14), 0 10px 24px rgba(2,6,23,0.18)"
                                : "0 6px 20px rgba(0,0,0,0.08)",
                            cursor: "grab",
                          }}
                        >
                          <button
                            type="button"
                            aria-label="Startzeit ziehen"
                            className="absolute inset-x-1 top-0 h-1.5 cursor-ns-resize rounded-t bg-slate-700/20"
                            onMouseDown={(ev) => {
                              ev.stopPropagation();
                              ev.preventDefault();
                              setResizeState({
                                id: event.id,
                                edge: "start",
                                weekday: event.weekday,
                                draftStartMin: event.startMin,
                                draftEndMin: event.endMin,
                              });
                            }}
                          />
                          <button
                            type="button"
                            aria-label="Endzeit ziehen"
                            className="absolute inset-x-1 bottom-0 h-1.5 cursor-ns-resize rounded-b bg-slate-700/20"
                            onMouseDown={(ev) => {
                              ev.stopPropagation();
                              ev.preventDefault();
                              setResizeState({
                                id: event.id,
                                edge: "end",
                                weekday: event.weekday,
                                draftStartMin: event.startMin,
                                draftEndMin: event.endMin,
                              });
                            }}
                          />
                          <div className="truncate text-xs font-semibold text-slate-800">{event.employee_name}</div>
                          <div className="text-[11px] text-slate-700">
                            {minutesToTime(event.startMin)} - {minutesToTime(event.endMin)}
                          </div>
                          <button
                            type="button"
                            className="mt-1 rounded border border-slate-300 bg-white/80 px-1 text-[10px] text-slate-700"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              removePlannerEvent(event.id);
                            }}
                          >
                            X
                          </button>
                        </div>
                      );
                    })}

                    {layout.laneCount > 4 ? (
                      <div className="absolute right-1 top-1 rounded-md border border-slate-300 bg-white/90 px-1.5 py-0.5 text-[10px] text-slate-600 shadow-sm">
                        +{layout.laneCount - 4}
                      </div>
                    ) : null}

                    {dragCreateState && dragCreateState.weekday === d.value ? (
                      (() => {
                        const startSlot = Math.min(dragCreateState.startSlot, dragCreateState.currentSlot);
                        const endSlot = Math.max(dragCreateState.startSlot, dragCreateState.currentSlot);
                        const top = startSlot * SLOT_HEIGHT;
                        const height = Math.max((endSlot - startSlot) * SLOT_HEIGHT, SLOT_HEIGHT);
                        return (
                          <div
                            className="pointer-events-none absolute left-1 right-1 rounded-xl border border-sky-400 bg-sky-200/60"
                            style={{ top: `${top}px`, height: `${height}px` }}
                          />
                        );
                      })()
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-[1300px] gap-4">
            {weekDays.map((d, idx) => {
              const entries = rowsByWeekday.get(d.value) || [];
              return (
                <div
                  key={`day-${d.value}`}
                  onDrop={(e) => handleDropOnWeekday(e, d.value)}
                  onDragOver={allowDrop}
                  className="w-[280px] flex-shrink-0 rounded-[24px] border border-slate-200 bg-white/95 p-4 shadow-[0_12px_32px_rgba(148,163,184,0.2)]"
                >
                  <div className="mb-3">
                    <div className="text-lg font-semibold text-slate-900">{d.label}</div>
                    <div className="text-xs text-slate-500">{d.dateLabel}</div>
                  </div>
                  <div className="space-y-2">
                    {entries.map((e, eventIdx) => {
                      const pastel = [
                        "bg-sky-100 border-sky-200",
                        "bg-emerald-100 border-emerald-200",
                        "bg-amber-100 border-amber-200",
                      ][(idx + eventIdx) % 3];
                      return (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() =>
                            setEdits((prev) => ({
                              ...prev,
                              [e.id]: prev[e.id] || draftFor(e),
                            }))
                          }
                          className={`w-full rounded-2xl border px-3 py-3 text-left ${pastel}`}
                        >
                          <div className="text-sm font-semibold text-slate-900">{e.employee_name}</div>
                          <div className="text-xs text-slate-600">
                            {formatClock(e.start_time)} - {formatClock(e.end_time)}
                          </div>
                          <div className="text-xs text-slate-600">{e.location || "ohne Ort"}</div>
                        </button>
                      );
                    })}
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <span className="text-lg">☕</span>
                        <span>Break Time</span>
                      </div>
                    </div>
                    {entries.length === 0 ? <div className="text-xs text-slate-400">Keine Einträge</div> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {err && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
      {ok && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{ok}</div>}

      <div className="rounded-[24px] border border-slate-200 bg-white/90 p-5 shadow-[0_18px_50px_rgba(148,163,184,0.18)]">
        <div className="mb-3 text-base font-semibold text-slate-900">Gesamtansicht Woche</div>
        {loading ? (
          <div className="text-sm text-slate-500">Lade…</div>
        ) : weekOverview.length === 0 ? (
          <div className="text-sm text-slate-500">Keine Einträge in dieser Woche.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1300px] w-full text-sm">
              <thead>
                <tr>
                  <th className="border border-slate-200 bg-slate-50 p-2 text-left">Mitarbeiter</th>
                  {weekDays.map((d) => (
                    <th key={`ov-${d.value}`} className="border border-slate-200 bg-slate-50 p-2 text-left">
                      <div>{d.label}</div>
                      <div className="text-xs text-slate-500">{d.dateLabel}</div>
                    </th>
                  ))}
                  <th className="border border-slate-200 bg-slate-50 p-2 text-left">Wochenstunden</th>
                </tr>
              </thead>
              <tbody>
                {weekOverview.map((item) => (
                  <tr key={item.key}>
                    <td className="border border-slate-200 p-2 align-top">
                      <div className="font-medium text-slate-900">{item.employee_name}</div>
                      {item.employee_user_id ? (
                        <div className="text-xs text-slate-500">{userLabelById(item.employee_user_id)}</div>
                      ) : null}
                    </td>
                    {WEEKDAYS.map((d) => {
                      const entries = item.dayEntries.get(d.value) || [];
                      return (
                        <td key={`${item.key}-${d.value}`} className="border border-slate-200 p-2 align-top">
                          {entries.length === 0 ? (
                            <span className="text-xs text-slate-400">-</span>
                          ) : (
                            <div className="space-y-1">
                              {entries.map((e) => (
                                <div key={e.id} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs">
                                  <div className="font-medium text-slate-800">
                                    {formatClock(e.start_time)} - {formatClock(e.end_time)}
                                  </div>
                                  <div className="text-slate-500">{e.location || "ohne Ort"}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="border border-slate-200 p-2 align-top">
                      <div className="font-semibold text-slate-900">{formatHours(item.totalMinutes)} h</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white/90 p-5 shadow-[0_18px_50px_rgba(148,163,184,0.18)]">
        <div className="mb-2 text-sm font-medium text-slate-800">Schneller Eintrag</div>
        <form
          onSubmit={createSchedule}
          className="grid grid-cols-1 gap-2 md:grid-cols-[1.2fr_1.2fr_180px_160px_160px_1fr_1.2fr_auto]"
        >
          <input
            value={employeeName}
            onChange={(e) => setEmployeeName(e.target.value)}
            placeholder="Mitarbeitername"
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
          />
          <select
            value={employeeUserId}
            onChange={(e) => setEmployeeUserId(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
          >
            <option value="">Benutzer (optional)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email || u.id}
              </option>
            ))}
          </select>
          <select
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
          >
            {WEEKDAYS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
          />
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
          />
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Ort (optional)"
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notiz (optional)"
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
          />
          <button
            type="submit"
            className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm hover:bg-slate-200"
          >
            Speichern
          </button>
        </form>
      </div>

      {showShortcutHelp ? (
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm text-slate-700">
          Shortcuts: `?` Hilfe, `Delete/Backspace` Block löschen, `Cmd/Ctrl+Z` Undo, `Shift+Cmd/Ctrl+Z` Redo, `Cmd/Ctrl+Click` Mehrfachauswahl.
        </div>
      ) : null}

      {eventEditor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-3 text-lg font-semibold text-slate-900">Block bearbeiten</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={eventEditor.employee_name}
                readOnly
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
              />
              <div className="text-xs text-slate-500">Mitarbeiter</div>
              <input
                type="time"
                value={eventEditor.start}
                onChange={(e) => setEventEditor((old) => ({ ...old, start: e.target.value }))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <input
                type="time"
                value={eventEditor.end}
                onChange={(e) => setEventEditor((old) => ({ ...old, end: e.target.value }))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <input
                value={eventEditor.location || ""}
                onChange={(e) => setEventEditor((old) => ({ ...old, location: e.target.value }))}
                placeholder="Ort"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm md:col-span-2"
              />
              <textarea
                value={eventEditor.notes || ""}
                onChange={(e) => setEventEditor((old) => ({ ...old, notes: e.target.value }))}
                placeholder="Notiz"
                rows={3}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm md:col-span-2"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEventEditor(null)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={saveEditor}
                className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm"
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
