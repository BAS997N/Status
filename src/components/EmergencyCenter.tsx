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

interface EmergencyCenterProps {
  currentUser: UserProfile;
  allUsers: UserProfile[];
  canManage: boolean;
  settings: SystemSettingsConfig;
  onSettingsChanged: (settings: SystemSettingsConfig) => void;
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
}: EmergencyCenterProps) {
  const event = settings.emergencyEvent;
  const [responses, setResponses] = useState<EmergencyResponse[]>([]);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
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
    setResponses(await dataService.getEmergencyResponses(event.eventId));
  };

  useEffect(() => {
    refresh().catch(console.error);
    if (!event.active) return;
    const id = window.setInterval(() => refresh().catch(console.error), 5000);
    return () => window.clearInterval(id);
  }, [event.eventId, event.active]);

  const myResponse = responses.find((item) => item.userId === currentUser.userId);

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    STATUS_OPTIONS.forEach((item) => {
      result[item.value] = responses.filter((response) => response.status === item.value).length;
    });
    return result;
  }, [responses]);

  const noResponseUsers = useMemo(() => {
    const responseIds = new Set(responses.map((item) => item.userId));
    return allUsers
      .filter((user) => !user.isDischarged && !responseIds.has(user.userId))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "he"));
  }, [allUsers, responses]);

  const saveResponse = async (status: EmergencyResponseStatus) => {
    setSaving(true);
    setMessage("");
    try {
      await dataService.saveEmergencyResponse(event.eventId, {
        userId: currentUser.userId,
        userName: currentUser.fullName,
        personalId: currentUser.personalId,
        status,
        note: note.trim(),
      });
      await refresh();
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
        },
      };
      const savedSettings = await dataService.saveSystemSettings(
        updatedSettings,
        currentUser.userId
      );
      onSettingsChanged(savedSettings);
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
        systemMode: "normal",
        emergencyEvent: {
          ...event,
          active: false,
        },
      };
      const savedSettings = await dataService.saveSystemSettings(
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
            <input
              type="time"
              value={eventDraft.assemblyTime}
              onChange={(changeEvent) =>
                setEventDraft((current) => ({ ...current, assemblyTime: changeEvent.target.value }))
              }
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-red-400"
            />
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
                        <div className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-700">
                          {option?.label || response.status}
                        </div>
                      </div>
                      {response.note && <div className="mt-2 text-[10px] text-slate-500">{response.note}</div>}
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
                  <div key={user.userId} className="rounded-xl border border-amber-200 bg-white px-3 py-2">
                    <div className="text-xs font-black text-slate-900">{user.fullName}</div>
                    <div className="mt-1 text-[10px] text-slate-500">
                      {user.medicalRole || "ללא תפקיד"} · {user.unit || "ללא שיוך"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
