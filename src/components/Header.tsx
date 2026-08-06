import { useState, useEffect } from "react";
import { Shield, User, Sliders, Database, Wifi, WifiOff, RefreshCw, Layers, Bell, Check, Trash2, MailOpen, AlertTriangle, LogOut } from "lucide-react";
import { UserProfile, AppNotification, ATTENDANCE_STATUS_LABELS, SystemSettingsConfig } from "../types";
import { isFirebaseActive } from "../firebase";
import { motion, AnimatePresence } from "motion/react";
import PushNotificationButton from "./PushNotificationButton";
import { requestRecoveryEmailVerification } from "../services/accountRecoveryService";

interface HeaderProps {
  currentUser: UserProfile;
  allUsers: UserProfile[];
  onSwitchUser: (userId: string) => void;
  onUpdateProfile: (profile: UserProfile) => void;
  onResetData: () => void;
  notifications: AppNotification[];
  onMarkNotificationRead: (id: string) => void;
  onClearAllNotifications: () => void;
  onLogout: () => void;
  medicalUnits?: string[];
  canEdit?: boolean;
  systemSettings?: SystemSettingsConfig | null;
}

export default function Header({ 
  currentUser, 
  allUsers, 
  onSwitchUser, 
  onUpdateProfile, 
  onResetData,
  notifications = [],
  onMarkNotificationRead,
  onClearAllNotifications,
  onLogout,
  medicalUnits = [],
  canEdit = false,
  systemSettings
}: HeaderProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [time, setTime] = useState(new Date());

  // Edit states
  const [editName, setEditName] = useState(currentUser.fullName);
  const [editUnit, setEditUnit] = useState(currentUser.unit);
  const [editRole, setEditRole] = useState(currentUser.role);
  const [editRecoveryEmail, setEditRecoveryEmail] = useState(
    currentUser.recoveryEmail || ""
  );
  const [profileError, setProfileError] = useState("");
  const [recoveryStatus, setRecoveryStatus] = useState("");
  const [sendingRecoveryVerification, setSendingRecoveryVerification] = useState(false);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  useEffect(() => {
  const timer = setInterval(() => {
    setTime(new Date());
  }, 1000);

  return () => {
    clearInterval(timer);
  };
}, []);

  // Update local inputs when currentUser changes
  useEffect(() => {
    setEditName(currentUser.fullName);
    setEditUnit(currentUser.unit);
    setEditRole(currentUser.role);
    setEditRecoveryEmail(currentUser.recoveryEmail || "");
  }, [currentUser]);

  const handleSaveProfile = () => {
    const cleanRecoveryEmail = editRecoveryEmail.trim().toLowerCase();
    if (
      cleanRecoveryEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanRecoveryEmail)
    ) {
      setProfileError("כתובת המייל אינה תקינה.");
      return;
    }
    setProfileError("");
    onUpdateProfile({
      ...currentUser,
      fullName: canEdit ? editName : currentUser.fullName,
      unit: canEdit ? editUnit : currentUser.unit,
      role: canEdit ? editRole : currentUser.role,
      recoveryEmail: cleanRecoveryEmail,
      recoveryEmailVerified:
        cleanRecoveryEmail === (currentUser.recoveryEmail || "").toLowerCase()
          ? currentUser.recoveryEmailVerified
          : false,
    });
    setIsProfileOpen(false);
  };

  const handleSendRecoveryVerification = async () => {
    setProfileError("");
    setRecoveryStatus("");
    if (!currentUser.recoveryEmail) {
      setProfileError("יש לשמור תחילה כתובת מייל אישית.");
      return;
    }
    if (editRecoveryEmail.trim().toLowerCase() !== currentUser.recoveryEmail.toLowerCase()) {
      setProfileError("כתובת המייל השתנתה. שמור את הפרטים לפני שליחת האימות.");
      return;
    }
    setSendingRecoveryVerification(true);
    try {
      const result = await requestRecoveryEmailVerification();
      setRecoveryStatus(
        result.message ||
          "קישור אימות נשלח למייל האישי. אם ההודעה אינה מופיעה, יש לבדוק גם בתיקיית הספאם."
      );
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "שליחת האימות נכשלה.");
    } finally {
      setSendingRecoveryVerification(false);
    }
  };

  const configuredTimeZone = systemSettings?.timeZone || "Asia/Jerusalem";
  const formattedTime = time.toLocaleTimeString("he-IL", { hour12: false, timeZone: configuredTimeZone });
  const formattedDate = time.toLocaleDateString("he-IL", { 
    weekday: "long", 
    year: "numeric", 
    month: "long", 
    day: "numeric",
    timeZone: configuredTimeZone
  });

  return (
    <header id="app-header" className="relative max-w-full border-b-4 border-military-600 bg-military-800 text-white shadow-md">
      <div className="mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Main Title & Clock */}
          <div className="flex min-w-0 items-center gap-3">
            <div className="p-2.5 bg-military-600 rounded-lg flex items-center justify-center border border-military-500 shadow-inner">
              <Shield className="w-8 h-8 text-military-100 animate-pulse" />
            </div>
            <div>
              <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight text-military-100 sm:text-2xl">
                {systemSettings?.systemName || "מערכת נוכחות חיילים"}
                <span className="text-xs bg-military-600 font-normal px-2.5 py-0.5 rounded-full border border-military-400">
                  {systemSettings?.unitName || "תאג״ד 997"}
                </span>
                <span
                  className="rounded-full border border-military-500 bg-military-900/50 px-2 py-0.5 font-mono text-[10px] font-normal text-military-200"
                  title="גרסת המערכת"
                >
                  גרסה {systemSettings?.systemVersion || "1.0.0"}
                </span>
              </h1>
              <p className="text-xs text-military-200 mt-0.5 font-mono">
                {formattedDate} | <span className="font-semibold">{formattedTime}</span>
              </p>
            </div>
          </div>

          {/* Quick Stats & Config Badges */}
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center md:self-center">
            
            {/* Database Engine Status */}
            <div className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-semibold transition-colors duration-300 ${
              isFirebaseActive 
                ? "bg-emerald-950/60 border border-emerald-500/30 text-emerald-300" 
                : "bg-emerald-950/60 border border-emerald-500/30 text-emerald-300"
            }`}>
              {isFirebaseActive ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  <span>ענן Firebase פעיל ובטוח</span>
                </>
              ) : (
                <>
                  <Shield className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span>סביבה מוגנת ומאובטחת</span>
                </>
              )}
            </div>

            <PushNotificationButton currentUser={currentUser} />

            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="text-xs bg-military-700 hover:bg-military-600 text-white font-medium py-1.5 px-3 rounded-lg flex items-center gap-1.5 border border-military-600 cursor-pointer transition shadow-sm"
            >
              <User className="w-3.5 h-3.5 text-military-300" />
              <span>הגדרות פרופיל ({currentUser.fullName})</span>
            </button>

            {/* Log Out Button */}
            <button
              onClick={onLogout}
              className="text-xs bg-military-900 hover:bg-rose-950 text-slate-350 hover:text-rose-100 hover:border-rose-900/40 font-bold py-1.5 px-3 rounded-lg flex items-center gap-1.5 border border-military-700 cursor-pointer shadow-sm transition-all"
              title="התנתק מהמערכת ומחק את זיהוי המכשיר"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-450" />
              <span>יציאה</span>
            </button>

            {/* Notification Bell (Only for commander) */}
            {systemSettings?.notificationsEnabled !== false && currentUser.role === "commander" && (
              <div id="commander-notifications-panel" className="relative">
                <button
                  onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                  className={`text-xs font-semibold py-1.5 px-3 rounded-lg flex items-center gap-1.5 border cursor-pointer transition shadow-sm relative focus:outline-none ${
                    isNotificationsOpen 
                      ? "bg-military-500 border-military-300 text-white" 
                      : "bg-military-700 hover:bg-military-600 border-military-600 text-white"
                  }`}
                >
                  <Bell className={`w-3.5 h-3.5 ${unreadCount > 0 ? "text-amber-400 animate-bounce" : "text-military-300"}`} />
                  <span>התראות מפעיל</span>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white font-bold text-[9px] h-4.5 w-4.5 rounded-full flex items-center justify-center border border-military-800 shadow animate-pulse">
                      {unreadCount}
                    </span>
                  )}
                </button>

                <AnimatePresence>
                  {isNotificationsOpen && (
                    <div className="fixed inset-x-3 top-20 z-[100] mx-auto flex max-h-[calc(100vh-6rem)] w-auto max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-right font-sans text-slate-800 shadow-2xl sm:inset-x-auto sm:left-6 sm:right-auto sm:mx-0 sm:w-96">
                      <div className="bg-slate-50 p-3 px-4 border-b border-slate-100 flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-700 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                          התראות חריגים ודיווחים מחוץ לבסיס
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                        {unreadCount > 0 && (
                          <button 
                            onClick={() => {
                              onClearAllNotifications();
                            }}
                            className="text-[10px] text-military-600 hover:text-military-800 font-bold transition flex items-center gap-0.5 cursor-pointer border-none bg-transparent"
                            title="סמן הכל כנקרא"
                          >
                            <MailOpen className="w-3 h-3" />
                            אשר קריאת הכל
                          </button>
                        )}
                          <button
                            type="button"
                            onClick={() => setIsNotificationsOpen(false)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-200 text-lg font-black leading-none text-slate-700 transition hover:bg-slate-300"
                            title="סגור התראות"
                            aria-label="סגור התראות"
                          >
                            ×
                          </button>
                        </div>
                      </div>

                      <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-slate-100">
                        {notifications.length === 0 ? (
                          <div className="p-8 text-center text-slate-400 text-xs">
                            <Shield className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-50" />
                            המבצעיות תקינה. אין דיווחי חריגים רשומים.
                          </div>
                        ) : (
                          notifications.map((not) => {
                            const date = new Date(not.timestamp);
                            const timeStr = date.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
                            const dateStr = date.toLocaleDateString("he-IL", { month: "2-digit", day: "2-digit" });
                            const reportDateValue = not.reportDate || "";
                            const reportDate = /^\d{4}-\d{2}-\d{2}$/.test(
                              reportDateValue
                            )
                              ? new Date(`${reportDateValue}T12:00:00`)
                              : null;
                            const reportDateStr = reportDate
                              ? reportDate.toLocaleDateString("he-IL", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                })
                              : "לא ידוע";
                            const labelObj = ATTENDANCE_STATUS_LABELS[not.status] || { label: not.status, color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200" };

                            return (
                              <div 
                                key={not.notificationId} 
                                className={`p-3 text-xs transition duration-155 flex flex-col gap-1.5 ${
                                  not.isRead 
                                    ? "bg-white" 
                                    : "bg-rose-50/40 border-r-3 border-rose-500"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-slate-950">
                                    {not.soldierName}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    בוצע: {dateStr} | {timeStr}
                                  </span>
                                </div>

                                <div className="text-slate-600 p-0 text-right">
                                  {not.message}
                                </div>

                                <div className="inline-flex w-fit items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-800">
                                  תאריך הדיווח: {reportDateStr}
                                </div>

                                <div className="flex items-center justify-between mt-1 pt-1 border-t border-dashed border-slate-100">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[10px] font-mono text-slate-400">
                                      {not.unit.split(" - ")[0]}
                                    </span>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${labelObj.bg} ${labelObj.color} ${labelObj.border}`}>
                                      {not.status === "base" ? "חריג" : labelObj.label}
                                    </span>
                                  </div>

                                  {!not.isRead && (
                                    <button
                                      onClick={() => onMarkNotificationRead(not.notificationId)}
                                      className="text-[10px] text-emerald-600 hover:text-emerald-700 font-bold flex items-center gap-0.5 transition cursor-pointer border-none bg-transparent"
                                    >
                                      <Check className="w-3 h-3" />
                                      אשר קריאה
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            )}

          </div>
        </div>

        {(!currentUser.recoveryEmail || currentUser.recoveryEmailVerified !== true) && (
          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-amber-400/50 bg-amber-950/60 px-3 py-2.5 text-right sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <div>
                <p className="text-xs font-black text-amber-100">
                  {!currentUser.recoveryEmail
                    ? "לא הוגדר מייל אישי לשחזור הקוד"
                    : "המייל האישי שלך עדיין לא אומת"}
                </p>
                <p className="mt-0.5 text-[10px] font-bold leading-4 text-amber-200/80">
                  ללא מייל מאומת לא ניתן להשתמש באפשרות „שכחתי קוד”. יש לעדכן ולאמת את המייל כעת.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setRecoveryStatus("");
                setProfileError("");
                setIsProfileOpen(true);
              }}
              className="shrink-0 rounded-lg bg-amber-400 px-3 py-2 text-[11px] font-black text-slate-950 transition hover:bg-amber-300"
            >
              עדכון ואימות מייל
            </button>
          </div>
        )}

        {/* Edit Profile Settings Dialog */}
        <AnimatePresence>
          {isProfileOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="mt-4 border-t border-military-700 pt-4"
            >
              <div className="bg-military-900/80 p-4 rounded-lg border border-military-700 max-w-lg mx-auto shadow-xl">
                <h3 className="text-sm font-bold text-white mb-3">עריכת פרטי משתמש פעיל</h3>
                
                <div className="space-y-3">
                  {canEdit && <div>
                    <label className="block text-xs text-military-300 mb-1">שם מלא</label>
                    <input 
                      type="text" 
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-military-800 text-white border border-military-600 rounded px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-military-400 outline-none"
                    />
                  </div>}
                  
                  {canEdit && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-military-300 mb-1">שיוך רפואי</label>
                      <select
                        value={editUnit}
                        onChange={(e) => setEditUnit(e.target.value)}
                        className="w-full bg-military-800 text-white border border-military-600 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-military-400 outline-none"
                      >
                        {(medicalUnits.length > 0 ? medicalUnits : [currentUser.unit]).map((unit) => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-military-300 mb-1">
                        תפקיד צבאי
                        {currentUser.systemRole && (
                          <span className="mr-2 text-[10px] text-military-400">
                            הרשאת מערכת: {currentUser.systemRole}
                          </span>
                        )}
                      </label>
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value as any)}
                        className="w-full bg-military-800 text-white border border-military-600 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-military-400 outline-none"
                      >
                        <option value="soldier">חייל (מדווח נוכחות)</option>
                        <option value="commander">מפקד (לוח בקרה ואישור)</option>
                      </select>
                    </div>
                  </div>}

                  <div>
                    <label className="mb-1 block text-xs text-military-300">
                      מייל אישי לשחזור
                    </label>
                    <input
                      type="email"
                      value={editRecoveryEmail}
                      onChange={(e) => setEditRecoveryEmail(e.target.value)}
                      placeholder="name@example.com"
                      autoComplete="email"
                      className="w-full rounded border border-military-600 bg-military-800 px-2.5 py-1.5 text-left text-xs text-white outline-none focus:ring-1 focus:ring-military-400"
                    />
                    <p className="mt-1 text-[10px] font-bold text-military-400">
                      המייל נשמר בנפרד מהמספר האישי וישמש לשחזור הקוד.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-black ${
                        currentUser.recoveryEmailVerified
                          ? "bg-emerald-900/60 text-emerald-200"
                          : "bg-amber-900/60 text-amber-200"
                      }`}>
                        {currentUser.recoveryEmailVerified ? "המייל מאומת" : "המייל עדיין לא אומת"}
                      </span>
                      {!currentUser.recoveryEmailVerified && (
                        <button
                          type="button"
                          onClick={handleSendRecoveryVerification}
                          disabled={sendingRecoveryVerification}
                          className="rounded border border-emerald-600/60 bg-emerald-900/40 px-2.5 py-1 text-[10px] font-black text-emerald-200 hover:bg-emerald-800/50 disabled:opacity-50"
                        >
                          {sendingRecoveryVerification ? "שולח..." : "שלח קישור אימות"}
                        </button>
                      )}
                    </div>
                  </div>

                  {recoveryStatus && (
                    <div className="rounded border border-emerald-700/50 bg-emerald-950/40 px-3 py-2 text-xs font-bold text-emerald-200">
                      {recoveryStatus}
                    </div>
                  )}

                  {profileError && (
                    <div className="rounded border border-rose-700/50 bg-rose-950/40 px-3 py-2 text-xs font-bold text-rose-200">
                      {profileError}
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => setIsProfileOpen(false)}
                      className="bg-transparent hover:bg-military-800 text-military-300 text-xs py-1.5 px-3 rounded cursor-pointer transition"
                    >
                      ביטול
                    </button>
                    <button
                      onClick={handleSaveProfile}
                      className="bg-military-500 hover:bg-military-400 text-white font-semibold text-xs py-1.5 px-4 rounded cursor-pointer transition shadow"
                    >
                      שמור פרטים
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </header>
  );
}
