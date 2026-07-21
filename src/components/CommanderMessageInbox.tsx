import { useEffect, useState } from "react";
import { AlertTriangle, Bell, CheckCircle2 } from "lucide-react";
import { CommanderMessage, UserProfile } from "../types";
import { dataService } from "../services/dataService";

export default function CommanderMessageInbox({ currentUser }: { currentUser: UserProfile }) {
  const [messages, setMessages] = useState<CommanderMessage[]>([]);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

  const refresh = async () => {
    const allMessages = await dataService.getCommanderMessages();
    setMessages(
      allMessages.filter((message) => {
        if (message.acknowledgements?.[currentUser.userId]) return false;
        if (message.targetType === "user") return message.targetUserId === currentUser.userId;
        if (message.targetType === "role") return message.targetRole === currentUser.role;
        if (message.targetType === "unit") {
          return currentUser.role === "soldier" && message.targetUnit === currentUser.unit;
        }
        return currentUser.role === "soldier";
      })
    );
  };

  useEffect(() => {
    refresh().catch((error) => console.error("Failed loading user messages:", error));
  }, [currentUser.userId, currentUser.role, currentUser.unit]);

  const acknowledge = async (messageId: string) => {
    setAcknowledgingId(messageId);
    try {
      await dataService.acknowledgeCommanderMessage(messageId, currentUser);
      await refresh();
    } finally {
      setAcknowledgingId(null);
    }
  };

  if (messages.length === 0) return null;

  return (
    <section className="mx-auto mt-4 w-full max-w-7xl px-3 sm:px-6 lg:px-8" dir="rtl">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Bell className="h-5 w-5 text-blue-600" />
          <h2 className="text-sm font-black text-slate-900">הודעות חדשות</h2>
          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-black text-white">
            {messages.length}
          </span>
        </div>
        <div className="space-y-3">
          {messages.map((message) => (
            <article
              key={message.messageId}
              className={`rounded-xl border bg-white p-4 ${message.important ? "border-amber-300" : "border-blue-100"}`}
            >
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {message.important && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />}
                    <h3 className="text-sm font-black text-slate-900">{message.title}</h3>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-6 text-slate-600">{message.content}</p>
                  <p className="mt-2 text-[10px] font-bold text-slate-400">
                    {message.createdByName} · {new Date(message.createdAt).toLocaleString("he-IL")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={acknowledgingId === message.messageId}
                  onClick={() => acknowledge(message.messageId)}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {acknowledgingId === message.messageId ? "שומר..." : "קראתי ואישרתי"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
