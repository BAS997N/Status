import { useEffect, useMemo, useState } from "react";
import { BellRing, RefreshCw, Smartphone } from "lucide-react";
import {
  PwaInstallationStatus,
  PushDeviceStatus,
  UserProfile,
} from "../../types";
import { dataService } from "../../services/dataService";

export default function AppStatusManager({ users }: { users: UserProfile[] }) {
  const [pushDevices, setPushDevices] = useState<PushDeviceStatus[]>([]);
  const [installations, setInstallations] = useState<PwaInstallationStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [nextPushDevices, nextInstallations] = await Promise.all([
        dataService.getPushDeviceStatuses(),
        dataService.getPwaInstallationStatuses(),
      ]);
      setPushDevices(nextPushDevices);
      setInstallations(nextInstallations);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(console.error);
  }, []);

  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("he");
    return users
      .filter((user) => !user.isDischarged)
      .map((user) => {
        const userPushDevices = pushDevices.filter(
          (device) => device.userId === user.userId && device.enabled
        );
        const userInstallations = installations.filter(
          (installation) =>
            installation.userId === user.userId && installation.installed
        );
        const installed =
          userInstallations.length > 0 ||
          userPushDevices.some((device) => device.standalone === true);
        const activityDates = [
          ...userPushDevices.map((device) => device.updatedAt),
          ...userInstallations.map((installation) => installation.lastOpenedAt),
        ]
          .filter((value): value is string => Boolean(value))
          .map((value) => new Date(value))
          .filter((value) => !Number.isNaN(value.getTime()));
        const lastActivity = activityDates.sort(
          (a, b) => b.getTime() - a.getTime()
        )[0];
        return {
          user,
          installed,
          pushCount: userPushDevices.length,
          lastActivity,
        };
      })
      .filter(({ user }) =>
        !query
          ? true
          : `${user.fullName} ${user.personalId || ""} ${user.unit || ""}`
              .toLocaleLowerCase("he")
              .includes(query)
      )
      .sort((a, b) => a.user.fullName.localeCompare(b.user.fullName, "he"));
  }, [installations, pushDevices, search, users]);

  const installedCount = rows.filter((row) => row.installed).length;
  const pushCount = rows.filter((row) => row.pushCount > 0).length;

  return (
    <section dir="rtl" className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="משתמשים פעילים" value={rows.length} />
        <SummaryCard label="האפליקציה הותקנה ונפתחה" value={installedCount} />
        <SummaryCard label="התראות פעילות" value={pushCount} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-black text-slate-900">
              התקנת אפליקציה והתראות
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              התקנה מזוהה לאחר פתיחה ראשונה של המערכת ממסך הבית.
            </p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => load().catch(console.error)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            רענן נתונים
          </button>
        </div>

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="חיפוש לפי שם, מספר אישי או יחידה"
          className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
        />

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-right text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-3">משתמש</th>
                <th className="px-3 py-3">יחידה</th>
                <th className="px-3 py-3">אפליקציה</th>
                <th className="px-3 py-3">התראות</th>
                <th className="px-3 py-3">פעילות אחרונה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ user, installed, pushCount: deviceCount, lastActivity }) => (
                <tr key={user.userId}>
                  <td className="px-3 py-3">
                    <div className="font-black text-slate-900">{user.fullName}</div>
                    <div className="mt-1 text-[10px] text-slate-500">
                      {user.personalId || "ללא מספר אישי"}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{user.unit || "—"}</td>
                  <td className="px-3 py-3">
                    <StatusBadge active={installed} icon={Smartphone} activeText="הותקנה ונפתחה" inactiveText="לא זוהתה" />
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge active={deviceCount > 0} icon={BellRing} activeText={`פעילות · ${deviceCount} מכשירים`} inactiveText="לא הופעלו" />
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {lastActivity
                      ? lastActivity.toLocaleString("he-IL", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "אין נתונים"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-2xl font-black text-slate-900">{value}</div>
      <div className="mt-1 text-xs font-bold text-slate-500">{label}</div>
    </div>
  );
}

function StatusBadge({
  active,
  icon: Icon,
  activeText,
  inactiveText,
}: {
  active: boolean;
  icon: typeof Smartphone;
  activeText: string;
  inactiveText: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-black ${
        active
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 text-slate-500"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {active ? activeText : inactiveText}
    </span>
  );
}
