import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, MessageSquarePlus, Trash2 } from "lucide-react";
import { CommanderMessage, CommanderMessageTarget, UserProfile } from "../types";
import { dataService } from "../services/dataService";

interface CommanderMessagesProps {
  currentUser: UserProfile;
  allUsers: UserProfile[];
}

export default function CommanderMessages({
  currentUser,
  allUsers,
}: CommanderMessagesProps) {
  const [messages, setMessages] = useState<CommanderMessage[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [important, setImportant] = useState(false);
  const [targetType, setTargetType] = useState<CommanderMessageTarget>("all");
  const [targetUnit, setTargetUnit] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const activeUsers = useMemo(
    () =>
      allUsers.filter(
        (user) => !user.isDischarged && user.role === "soldier"
      ),
    [allUsers]
  );
  const units = useMemo(
    () =>
      Array.from(new Set(activeUsers.map((user) => user.unit).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b, "he")
      ),
    [activeUsers]
  );

  const refresh = async () => setMessages(await dataService.getCommanderMessages());

  useEffect(() => {
    refresh().catch((loadError) =>
      console.error("Failed loading commander messages:", loadError)
    );
  }, []);

  const getRecipients = (message: CommanderMessage) => {
    if (message.targetType === "unit") {
      return activeUsers.filter((user) => user.unit === message.targetUnit);
    }
    if (message.targetType === "user") {
      return activeUsers.filter((user) => user.userId === message.targetUserId);
    }
    return activeUsers;
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (!title.trim() || !content.trim()) {
      setError("יש להזין כותרת ותוכן להודעה.");
      return;
    }
    if (targetType === "unit" && !targetUnit) {
      setError("יש לבחור יחידה.");
      return;
    }
    if (targetType === "user" && !targetUserId) {
      setError("יש לבחור חייל.");
      return;
    }

    setSaving(true);
    try {
      await dataService.createCommanderMessage({
        title: title.trim(),
        content: content.trim(),
        important,
        targetType,
        ...(targetType === "unit" ? { targetUnit } : {}),
        ...(targetType === "user" ? { targetUserId } : {}),
        createdAt: new Date().toISOString(),
        createdBy: currentUser.userId,
        createdByName: currentUser.fullName,
        acknowledgements: {},
      });
      setTitle("");
      setContent("");
      setImportant(false);
      setTargetType("all");
      setTargetUnit("");
      setTargetUserId("");
      await refresh();
    } catch (createError) {
      console.error("Failed creating commander message:", createError);
      setError("פרסום ההודעה נכשל.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (messageId: string) => {
    if (!window.confirm("למחוק את ההודעה ואת אישורי הקריאה שלה?")) return;
    await dataService.deleteCommanderMessage(messageId);
    await refresh();
  };

  return (
    <section className="border-b border-slate-200 bg-slate-50 p-4 sm:p-5" dir="rtl">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <form onSubmit={handleCreate} className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5 text-blue-600" />
            <h3 className="text-sm font-black text-slate-900">פרסום הודעה לחיילים</h3>
          </div>
          {error && <div className="mb-3 rounded-lg bg-rose-50 p-2 text-xs font-bold text-rose-700">{error}</div>}
          <div className="space-y-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="כותרת ההודעה" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold" />
            <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="תוכן ההודעה" rows={3} className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-xs" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <select value={targetType} onChange={(e) => setTargetType(e.target.value as CommanderMessageTarget)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">
                <option value="all">כלל החיילים</option>
                <option value="unit">יחידה מסוימת</option>
                <option value="user">חייל מסוים</option>
              </select>
              {targetType === "unit" && (
                <select value={targetUnit} onChange={(e) => setTargetUnit(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">
                  <option value="">בחר יחידה</option>
                  {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                </select>
              )}
              {targetType === "user" && (
                <select value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">
                  <option value="">בחר חייל</option>
                  {[...activeUsers].sort((a, b) => a.fullName.localeCompare(b.fullName, "he")).map((user) => (
                    <option key={user.userId} value={user.userId}>{user.fullName} · {user.unit}</option>
                  ))}
                </select>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-amber-800">
              <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />
              הודעה חשובה — הצג בהבלטה
            </label>
            <button disabled={saving} className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-60">
              {saving ? "מפרסם..." : "פרסם הודעה"}
            </button>
          </div>
        </form>

        <div className="max-h-[430px] space-y-3 overflow-y-auto custom-scrollbar">
          {messages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs font-bold text-slate-400">אין הודעות שפורסמו</div>
          ) : messages.map((message) => {
            const recipients = getRecipients(message);
            const acknowledgements = Object.values(message.acknowledgements || {});
            const acknowledgedIds = new Set(acknowledgements.map((item) => item.userId));
            const pending = recipients.filter((user) => !acknowledgedIds.has(user.userId));
            return (
              <article key={message.messageId} className={`rounded-xl border bg-white p-4 shadow-sm ${message.important ? "border-amber-300" : "border-slate-200"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {message.important && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                      <h4 className="text-sm font-black text-slate-900">{message.title}</h4>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{message.content}</p>
                  </div>
                  <button type="button" onClick={() => handleDelete(message.messageId)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="mt-3 text-[10px] font-bold text-slate-400">
                  {new Date(message.createdAt).toLocaleString("he-IL")} · {message.createdByName}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[11px] font-black">
                  <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><CheckCircle2 className="mx-auto mb-1 h-4 w-4" />אישרו: {acknowledgements.length}</div>
                  <div className="rounded-lg bg-rose-50 p-2 text-rose-700">טרם אישרו: {pending.length}</div>
                </div>
                {acknowledgements.length > 0 && (
                  <div className="mt-2 text-[10px] leading-5 text-slate-500">
                    {acknowledgements.map((item) => `${item.userName} — ${new Date(item.readAt).toLocaleString("he-IL")}`).join(" · ")}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
