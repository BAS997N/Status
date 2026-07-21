import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  MapPin,
  MessageCircle,
  Navigation,
  ShieldAlert,
  Users,
} from "lucide-react";
import {
  EmergencyResponse,
  EmergencyResponseStatus,
  SystemSettingsConfig,
  UserProfile,
} from "../types";
import { dataService } from "../services/dataService";
import { sendAutomaticPush } from "../services/pushService";

interface EmergencyCenterProps {
  currentUser: UserProfile;
  allUsers: UserProfile[];
  canManage: boolean;
  settings: SystemSettingsConfig;
  onSettingsChanged: (settings: SystemSettingsConfig) => void;
  onArrivalConfirmed?: () => void;
}

const STATUS_OPTIONS: Array<{
  value: EmergencyResponseStatus;
  label: string;
  description: string;
}> = [
  { value: "acknowledged", label: "קיבלתי", description: "קיבלתי את ההודעה" },
  { value: "on_the_way", label: "בדרך", description: "יצאתי לכיוון נקודת ההתייצבות" },
  { value: "arrived", label: "הגעתי", description: "הגעתי לנקודת ההתייצבות" },
  { value: "unavailable", label: "לא זמין", description: "לא אוכל להגיע כרגע" },
  { value: "needs_help", label: "זקוק לסיוע", description: "נדרש קשר או סיוע מהמפקד" },
];

export default function EmergencyCenter({
  currentUser,
  allUsers,
  canManage,
  settings,
  onSettingsChanged,
  onArrivalConfirmed,
}: EmergencyCenterProps) {
  const event = settings.emergencyEvent;
  const [responses, setResponses] = useState<EmergencyResponse[]>([]);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [eventHistory, setEventHistory] = useState<Array<{
    eventId: string;
    title: string;
    responseCount: number;
    lastActivity: string;
  }>>([]);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [markingUserId, setMarkingUserId] = useState<string | null>(null);
  const [eventDraft, setEventDraft] = useState({
    title: event.title || "מצב חירום",
    message: event.message || "",
    assemblyLocation: event.assemblyLocation || "",
    assemblyTime: event.assemblyTime || "",
  });

  const refresh = async () => {
    if (!event.eventId) {
      setResponses([]);
      return;
    }
    const loadedResponses = canManage
      ? await dataService.getEmergencyResponses(event.eventId)
      : [await dataService.getEmergencyResponse(event.eventId, currentUser.userId)].filter(
          (item): item is EmergencyResponse => item !== null
        );
    setResponses(loadedResponses);
  };

  useEffect(() => {
    refresh().catch(console.error);
    if (!event.active) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refresh().catch(console.error);
      }
    }, 15000);
    return () => window.clearInterval(id);
  }, [event.eventId, event.active]);

  const refreshEventHistory = async () => {
    if (!canManage) return;
    setHistoryLoading(true);
    try {
      const allResponses = await dataService.getAllEmergencyResponses();
      const grouped = new Map<string, {
        eventId: string;
        title: string;
        responseCount: number;
        lastActivity: string;
      }>();

      allResponses.forEach((response) => {
        const responseEventId =
          response.eventId ||
          response.responseId.slice(0, response.responseId.lastIndexOf("_"));
        if (!responseEventId) return;
        const current = grouped.get(responseEventId);
        grouped.set(responseEventId, {
          eventId: responseEventId,
          title: response.eventTitle || current?.title || responseEventId,
          responseCount: (current?.responseCount || 0) + 1,
          lastActivity:
            !current || response.updatedAt > current.lastActivity
              ? response.updatedAt
              : current.lastActivity,
        });
      });

      setEventHistory(
        [...grouped.values()].sort((a, b) =>
          b.lastActivity.localeCompare(a.lastActivity)
        )
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    refreshEventHistory().catch(console.error);
  }, [canManage, event.eventId, event.active]);

  const myResponse = responses.find((item) => item.userId === currentUser.userId);

  const normalizeUnitName = (value = "") =>
    value
      .replace(/[״׳'\"`]/g, "")
      .replace(/\s+/g, "")
      .toLowerCase();

  const isAttachedToTagad = (user: UserProfile) => {
    const normalizedUnit = normalizeUnitName(user.unit || "");
    return normalizedUnit.includes("מסופח") && normalizedUnit.includes("תאגד");
  };

  const eligibleUsers = useMemo(
    () => allUsers.filter((user) => !user.isDischarged && !isAttachedToTagad(user)),
    [allUsers]
  );
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    STATUS_OPTIONS.forEach((item) => {
      result[item.value] = responses.filter((response) => response.status === item.value).length;
    });
    return result;
  }, [responses]);

  const noResponseUsers = useMemo(() => {
    const responseIds = new Set(responses.map((item) => item.userId));
    return eligibleUsers
      .filter((user) => !responseIds.has(user.userId))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "he"));
  }, [eligibleUsers, responses]);

  const formatMarkedAt = (value?: string) => {
    if (!value) return "שעה לא זמינה";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "שעה לא זמינה";
    return date.toLocaleString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const saveResponse = async (status: EmergencyResponseStatus) => {
    setSaving(true);
    setMessage("");
    try {
      await dataService.saveEmergencyResponse(event.eventId, {
        eventTitle: event.title,
        userId: currentUser.userId,
        userName: currentUser.fullName,
        personalId: currentUser.personalId,
        status,
        note: note.trim(),
      });
      await refresh();
      if (status === "arrived") onArrivalConfirmed?.();
      setMessage("התגובה נשמרה.");
    } catch (error) {
      console.error(error);
      setMessage("שמירת התגובה נכשלה.");
    } finally {
      setSaving(false);
    }
  };

  const shareStatus = () => {
    const lines = [
      `*${event.title || "מצב חירום"}*`,
      event.message,
      event.assemblyLocation ? `מיקום: ${event.assemblyLocation}` : "",
      event.assemblyTime ? `שעת התייצבות: ${event.assemblyTime}` : "",
      "",
      ...STATUS_OPTIONS.map((item) => `${item.label}: ${counts[item.value] || 0}`),
      `ללא תגובה: ${noResponseUsers.length}`,
    ].filter(Boolean);

    window.open(
      `https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const activateEmergency = async () => {
    if (!canManage || !eventDraft.title.trim()) return;

    setSaving(true);
    setMessage("");
    try {
      const updatedSettings: SystemSettingsConfig = {
        ...settings,
        systemMode: "emergency",
        emergencyEvent: {
          ...event,
          active: true,
          eventId: `emergency_${Date.now()}`,
          title: eventDraft.title.trim(),
          message: eventDraft.message.trim(),
          assemblyLocation: eventDraft.assemblyLocation.trim(),
          assemblyTime: eventDraft.assemblyTime,
          activatedAt: new Date().toISOString(),
          activatedBy: currentUser.userId,
          activatedByName: currentUser.fullName,
          previousSystemMode:
            settings.systemMode === "operational" ? "operational" : "routine",
        },
      };
      const savedSettings = await dataService.saveEmergencySettings(
        updatedSettings,
        currentUser.userId
      );
      onSettingsChanged(savedSettings);

      try {
        const details = [
          eventDraft.message.trim(),
          eventDraft.assemblyLocation.trim()
            ? `מיקום: ${eventDraft.assemblyLocation.trim()}`
            : "",
          eventDraft.assemblyTime
            ? `שעת התייצבות: ${eventDraft.assemblyTime}`
            : "",
        ].filter(Boolean);
        const delivery = await sendAutomaticPush({
          kind: "emergency",
          target: {
            type: "users",
            userIds: eligibleUsers.map((user) => user.userId),
          },
          title: `🚨 מצב חירום: ${eventDraft.title.trim()}`,
          body:
            details.join(" | ") ||
            "נפתח אירוע חירום חדש. יש להיכנס למערכת ולעדכן מצב.",
          url: "https://bas997n.github.io/Status/",
        });
        setMessage(
          `מצב החירום הופעל. Push נשלח ל־${delivery.sent} מתוך ${delivery.recipients} מכשירים.`
        );
      } catch (pushError) {
        console.error("Emergency push failed:", pushError);
        setMessage("מצב החירום הופעל, אך שליחת ה־Push נכשלה.");
      }
    } catch (error) {
      console.error(error);
      setMessage("הפעלת מצב החירום נכשלה.");
    } finally {
      setSaving(false);
    }
  };

  const closeEmergency = async () => {
    if (!canManage || !window.confirm("לסגור את אירוע החירום הפעיל?")) return;

    setSaving(true);
    setMessage("");
    try {
      const updatedSettings: SystemSettingsConfig = {
        ...settings,
        systemMode:
          event.previousSystemMode === "operational"
            ? "operational"
            : "routine",
        emergencyEvent: {
          ...event,
          active: false,
          closedAt: new Date().toISOString(),
          closedBy: currentUser.userId,
        },
      };
      const savedSettings = await dataService.saveEmergencySettings(
        updatedSettings,
        currentUser.userId
      );
      onSettingsChanged(savedSettings);
    } catch (error) {
      console.error(error);
      setMessage("סגירת מצב החירום נכשלה.");
    } finally {
      setSaving(false);
    }
  };

  const deleteSelectedEvents = async () => {
    const deletableIds = selectedEventIds.filter(
      (eventId) => !(event.active && eventId === event.eventId)
    );
    if (
      deletableIds.length === 0 ||
      !window.confirm(`למחוק ${deletableIds.length} אירועים ואת כל התגובות שלהם?`)
    ) {
      return;
    }

    setHistoryLoading(true);
    try {
      await dataService.deleteEmergencyEvents(deletableIds);
      setSelectedEventIds([]);
      await refreshEventHistory();
    } catch (error) {
      console.error(error);
      setMessage("מחיקת האירועים נכשלה.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const markUserAsArrived = async (user: UserProfile) => {
    if (!canManage || markingUserId) return;
    setMarkingUserId(user.userId);
    setMessage("");
    try {
      await dataService.saveEmergencyResponseForUser(
        event.eventId,
        event.title,
        user,
        currentUser
      );
      await refresh();
    } catch (error) {
      console.error(error);
      setMessage(`סימון ההגעה של ${user.fullName} נכשל.`);
    } finally {
      setMarkingUserId(null);
    }
  };

  const renderEventHistory = () => (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-black text-slate-900">היסטוריית אירועי חירום</h3>
          <p className="mt-1 text-[11px] text-slate-500">
            מחיקת אירוע מוחקת גם את כל התגובות והיסטוריית הסימונים שלו.
          </p>
        </div>
        <button
          type="button"
          disabled={historyLoading || selectedEventIds.length === 0}
          onClick={deleteSelectedEvents}
          className="rounded-xl bg-red-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
        >
          מחק אירועים נבחרים ({selectedEventIds.length})
        </button>
      </div>
      <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
        {historyLoading && eventHistory.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-500">טוען אירועים...</div>
        ) : eventHistory.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-500">אין אירועים שמורים.</div>
        ) : (
          eventHistory.map((historyEvent) => {
            const isActiveEvent = event.active && historyEvent.eventId === event.eventId;
            return (
              <label
                key={historyEvent.eventId}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <input
                    type="checkbox"
                    disabled={isActiveEvent || historyLoading}
                    checked={selectedEventIds.includes(historyEvent.eventId)}
                    onChange={(changeEvent) =>
                      setSelectedEventIds((current) =>
                        changeEvent.target.checked
                          ? [...current, historyEvent.eventId]
                          : current.filter((id) => id !== historyEvent.eventId)
                      )
                    }
                    className="h-4 w-4 accent-red-600"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-black text-slate-900">
                      {historyEvent.title}
                      {isActiveEvent ? " — פעיל" : ""}
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500">
                      {formatMarkedAt(historyEvent.lastActivity)} · {historyEvent.responseCount} תגובות
                    </div>
                  </div>
                </div>
              </label>
            );
          })
        )}
      </div>
    </div>
  );

  if (!event.active) {
    if (canManage) {
      return (
        <section dir="rtl" className="rounded-3xl border border-red-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-lg font-black text-slate-900">
            <ShieldAlert className="h-6 w-6 text-red-600" />
            הפעלה וניהול של מצב חירום
          </div>
          <p className="mt-2 text-sm text-slate-500">
            מלא את פרטי האירוע והפעל את מרכז החירום.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              value={eventDraft.title}
              onChange={(changeEvent) =>
                setEventDraft((current) => ({ ...current, title: changeEvent.target.value }))
              }
              placeholder="כותרת האירוע"
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-red-400"
            />
            <input
              value={eventDraft.assemblyLocation}
              onChange={(changeEvent) =>
                setEventDraft((current) => ({ ...current, assemblyLocation: changeEvent.target.value }))
              }
              placeholder="מקום התייצבות"
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-red-400"
            />
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={eventDraft.assemblyTime}
                onChange={(changeEvent) =>
                  setEventDraft((current) => ({
                    ...current,
                    assemblyTime: changeEvent.target.value,
                  }))
                }
                placeholder="שעה, לדוגמה 18:30"
                className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-red-400"
              />
              <button
                type="button"
                onClick={() =>
                  setEventDraft((current) => ({
                    ...current,
                    assemblyTime:
                      current.assemblyTime === "מיידי" ? "" : "מיידי",
                  }))
                }
                className={`rounded-xl border px-4 py-2.5 text-xs font-black transition ${
                  eventDraft.assemblyTime === "מיידי"
                    ? "border-red-600 bg-red-600 text-white"
                    : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                }`}
              >
                מיידי
              </button>
            </div>
            <textarea
              rows={3}
              value={eventDraft.message}
              onChange={(changeEvent) =>
                setEventDraft((current) => ({ ...current, message: changeEvent.target.value }))
              }
              placeholder="הודעה והנחיות"
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-red-400 sm:col-span-2"
            />
          </div>
          <button
            type="button"
            disabled={saving || !eventDraft.title.trim()}
            onClick={activateEmergency}
            className="mt-4 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "מפעיל..." : "הפעל מצב חירום"}
          </button>
          {message && <div className="mt-3 text-xs font-bold text-red-600">{message}</div>}
          {renderEventHistory()}
        </section>
      );
    }

    return (
      <section dir="rtl" className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <ShieldAlert className="mx-auto h-12 w-12 text-slate-300" />
        <h2 className="mt-4 text-xl font-black text-slate-900">אין אירוע חירום פעיל</h2>
        <p className="mt-2 text-sm text-slate-500">
          מרכז החירום ייפתח אוטומטית כאשר מנהל המערכת יפעיל מצב חירום.
        </p>
      </section>
    );
  }

  return (
    <section dir="rtl" className="space-y-4">
      <div className="rounded-3xl border border-red-300 bg-gradient-to-l from-red-700 to-rose-700 p-5 text-white shadow-lg">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-black">
              <AlertTriangle className="h-5 w-5" />
              מצב חירום פעיל
            </div>
            <h1 className="mt-3 text-2xl font-black">{event.title}</h1>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-red-50">
              {event.message}
            </p>
          </div>
          {canManage && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={shareStatus}
                className="flex items-center justify-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-xs font-black hover:bg-white/25"
              >
                <MessageCircle className="h-4 w-4" />
                שתף מצב ב־WhatsApp
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={closeEmergency}
                className="rounded-xl bg-white px-4 py-2.5 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                סגור אירוע
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {event.assemblyLocation && (
            <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold">
              <MapPin className="h-4 w-4" />
              {event.assemblyLocation}
            </div>
          )}
          {event.assemblyTime && (
            <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold">
              <Clock3 className="h-4 w-4" />
              {event.assemblyTime}
            </div>
          )}
        </div>
      </div>

      {canManage && message && (
        <div className="rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-black text-red-700 shadow-sm">
          {message}
        </div>
      )}

      {!canManage && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-black text-slate-900">עדכון סטטוס אישי</h2>
          <p className="mt-1 text-xs text-slate-500">
            ניתן לעדכן את התגובה בכל שלב. התגובה האחרונה היא זו שתוצג למפקד.
          </p>
          <textarea
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="הערה למפקד — לא חובה"
            className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-xs outline-none focus:border-red-400"
          />
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {STATUS_OPTIONS.map((item) => (
              <button
                key={item.value}
                type="button"
                disabled={saving}
                onClick={() => saveResponse(item.value)}
                className={`rounded-xl border p-3 text-right transition ${
                  myResponse?.status === item.value
                    ? "border-red-400 bg-red-50"
                    : "border-slate-200 bg-white hover:border-red-200"
                }`}
              >
                <div className="text-xs font-black text-slate-900">{item.label}</div>
                <div className="mt-1 text-[10px] leading-4 text-slate-500">
                  {item.description}
                </div>
              </button>
            ))}
          </div>
          {message && (
            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
              {message}
            </div>
          )}
          {myResponse && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-black text-slate-700">
                היסטוריית הסימונים שלי
              </div>
              <div className="mt-2 space-y-1">
                {(myResponse.history || [{
                  status: myResponse.status,
                  note: myResponse.note,
                  markedAt: myResponse.updatedAt,
                }]).map((historyItem, index) => {
                  const historyStatus = STATUS_OPTIONS.find(
                    (item) => item.value === historyItem.status
                  );
                  return (
                    <div key={`${historyItem.markedAt}-${index}`} className="text-[10px] text-slate-500">
                      {new Date(historyItem.markedAt).toLocaleString("he-IL")} — {historyStatus?.label || historyItem.status}
                      {historyItem.note ? ` — ${historyItem.note}` : ""}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {canManage && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {STATUS_OPTIONS.map((item) => (
              <div key={item.value} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-2xl font-black text-slate-900">{counts[item.value] || 0}</div>
                <div className="mt-1 text-xs font-bold text-slate-500">{item.label}</div>
              </div>
            ))}
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <div className="text-2xl font-black text-amber-900">{noResponseUsers.length}</div>
              <div className="mt-1 text-xs font-bold text-amber-700">ללא תגובה</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-black text-slate-900">
                <Users className="h-4 w-4" />
                תגובות שהתקבלו
              </h3>
              <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
                {responses.map((response) => {
                  const option = STATUS_OPTIONS.find((item) => item.value === response.status);
                  return (
                    <div key={response.responseId} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-black text-slate-900">{response.userName}</div>
                        <div className="flex flex-col items-end gap-1">
                          <div className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-700">
                            {option?.label || response.status}
                          </div>
                          <div className="text-[10px] font-bold text-slate-500">
                            {formatMarkedAt(response.updatedAt)}
                          </div>
                        </div>
                      </div>
                      {response.note && <div className="mt-2 text-[10px] text-slate-500">{response.note}</div>}
                      <div className="mt-2 text-[10px] font-bold text-slate-400">
                        סימון אחרון: {formatMarkedAt(response.updatedAt)}
                      </div>
                      <details className="mt-2 border-t border-slate-100 pt-2">
                        <summary className="cursor-pointer text-[10px] font-black text-slate-500">
                          הצג היסטוריית סימונים
                        </summary>
                      {(
                        response.history && response.history.length > 0
                          ? response.history
                          : [{
                              status: response.status,
                              note: response.note,
                              markedAt: response.updatedAt,
                            }]
                      ).length > 0 && (
                        <div className="mt-2 space-y-1">
                          {(
                            response.history && response.history.length > 0
                              ? response.history
                              : [{
                                  status: response.status,
                                  note: response.note,
                                  markedAt: response.updatedAt,
                                }]
                          ).map((historyItem, index) => {
                            const historyStatus = STATUS_OPTIONS.find(
                              (item) => item.value === historyItem.status
                            );
                            return (
                              <div key={`${historyItem.markedAt}-${index}`} className="text-[10px] text-slate-500">
                                {formatMarkedAt(historyItem.markedAt)} — {historyStatus?.label || historyItem.status}
                                {historyItem.note ? ` — ${historyItem.note}` : ""}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      </details>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-black text-amber-900">
                <Navigation className="h-4 w-4" />
                טרם הגיבו
              </h3>
              <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
                {noResponseUsers.map((user) => (
                  <div key={user.userId} className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-3 py-2">
                    <div className="min-w-0">
                    <div className="text-xs font-black text-slate-900">{user.fullName}</div>
                    <div className="mt-1 text-[10px] text-slate-500">
                      {user.medicalRole || "ללא תפקיד"} · {user.unit || "ללא שיוך"}
                    </div>
                    </div>
                    <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[10px] font-black text-emerald-700">
                      <input
                        type="checkbox"
                        disabled={markingUserId !== null}
                        checked={false}
                        onChange={() => markUserAsArrived(user)}
                        className="h-4 w-4 accent-emerald-600"
                      />
                      {markingUserId === user.userId ? "שומר..." : "סמן הגיע"}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {renderEventHistory()}
        </>
      )}
    </section>
  );
}
