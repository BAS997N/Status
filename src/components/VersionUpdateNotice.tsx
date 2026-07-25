import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";

declare const __APP_BUILD_ID__: string;

interface VersionUpdateNoticeProps {
  systemVersion?: string;
}

const VERSION_URL = "/Status/app-version.json";
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export default function VersionUpdateNotice({
  systemVersion,
}: VersionUpdateNoticeProps) {
  const [availableBuildId, setAvailableBuildId] = useState("");
  const [updating, setUpdating] = useState(false);
  const dismissedBuildId = useRef("");

  const checkForUpdate = useCallback(async () => {
    if (!navigator.onLine) return;

    try {
      const response = await fetch(
        `${VERSION_URL}?check=${encodeURIComponent(Date.now())}`,
        { cache: "no-store" }
      );
      if (!response.ok) return;

      const result = (await response.json()) as { buildId?: string };
      const remoteBuildId = result.buildId || "";

      if (
        remoteBuildId &&
        remoteBuildId !== __APP_BUILD_ID__ &&
        remoteBuildId !== dismissedBuildId.current
      ) {
        setAvailableBuildId(remoteBuildId);
      }
    } catch {
      // A failed version check must not interrupt normal system use.
    }
  }, []);

  useEffect(() => {
    const initialCheck = window.setTimeout(checkForUpdate, 5000);
    const interval = window.setInterval(checkForUpdate, CHECK_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkForUpdate();
    };

    window.addEventListener("online", checkForUpdate);
    window.addEventListener("focus", checkForUpdate);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearTimeout(initialCheck);
      window.clearInterval(interval);
      window.removeEventListener("online", checkForUpdate);
      window.removeEventListener("focus", checkForUpdate);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkForUpdate]);

  const installUpdate = async () => {
    setUpdating(true);

    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration(
          "/Status/"
        );
        await registration?.update();
        registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
      }
    } catch {
      // Reloading still fetches the current index from the network.
    }

    window.setTimeout(() => window.location.reload(), 400);
  };

  if (!availableBuildId) return null;

  return (
    <aside
      dir="rtl"
      className="fixed inset-x-3 bottom-3 z-[250] mx-auto flex max-w-lg items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-white p-3 shadow-2xl sm:bottom-5"
      role="status"
      aria-live="polite"
    >
      <div className="min-w-0">
        <div className="text-sm font-black text-slate-900">
          גרסה חדשה של המערכת זמינה
        </div>
        <div className="mt-0.5 text-[11px] font-bold text-slate-500">
          {systemVersion
            ? `גרסת מערכת ${systemVersion} מוכנה לעדכון.`
            : "מומלץ לעדכן כדי לקבל את השיפורים האחרונים."}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={installUpdate}
          disabled={updating}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-70"
        >
          <RefreshCw className={`h-4 w-4 ${updating ? "animate-spin" : ""}`} />
          {updating ? "מעדכן..." : "עדכן עכשיו"}
        </button>
        <button
          type="button"
          onClick={() => {
            dismissedBuildId.current = availableBuildId;
            setAvailableBuildId("");
          }}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="הזכר לי בכניסה הבאה"
          aria-label="סגור את הודעת העדכון"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
