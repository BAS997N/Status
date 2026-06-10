import { useState, useEffect } from "react";
import { Shield, User, Sliders, Database, Wifi, WifiOff, RefreshCw, Layers, Bell, Check, Trash2, MailOpen, AlertTriangle, LogOut } from "lucide-react";
import { UserProfile, IDF_UNITS, AppNotification, ATTENDANCE_STATUS_LABELS } from "../types";
import { isFirebaseActive } from "../firebase";
import { motion, AnimatePresence } from "motion/react";

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
  onLogout
}: HeaderProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [time, setTime] = useState(new Date());

  // Edit states
  const [editName, setEditName] = useState(currentUser.fullName);
  const [editUnit, setEditUnit] = useState(currentUser.unit);
  const [editRole, setEditRole] = useState(currentUser.role);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Update local inputs when currentUser changes
  useEffect(() => {
    setEditName(currentUser.fullName);
    setEditUnit(currentUser.unit);
    setEditRole(currentUser.role);
  }, [currentUser]);

  const handleSaveProfile = () => {
    onUpdateProfile({
      ...currentUser,
      fullName: editName,
      unit: editUnit,
      role: editRole,
    });
    setIsProfileOpen(false);
  };

  const formattedTime = time.toLocaleTimeString("he-IL", { hour12: false });
  const formattedDate = time.toLocaleDateString("he-IL", { 
    weekday: "long", 
    year: "numeric", 
    month: "long", 
    day: "numeric" 
  });

  return (
    <header id="app-header" className="bg-military-800 text-white shadow-md border-b-4 border-military-600 relative">
      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Main Title & Clock */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-military-600 rounded-lg flex items-center justify-center border border-military-500 shadow-inner">
              <Shield className="w-8 h-8 text-military-100 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-military-100 flex items-center gap-2">
                מערכת נוכחות חיילים
                <span className="text-xs bg-military-600 font-normal px-2.5 py-0.5 rounded-full border border-military-400">
                  תאג״ד 997
                </span>
              </h1>
              <p className="text-xs text-military-200 mt-0.5 font-mono">
                {formattedDate} | <span className="font-semibold">{formattedTime}</span>
              </p>
            </div>
          </div>

          {/* Quick Stats & Config Badges */}
          <div className="flex flex-wrap items-center gap-2 md:self-center">
            
            {/* Database Engine Status */}
            <div className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-semibold transition-colors duration-300 ${
              isFirebaseActive 
                ? "bg-emerald-950/60 border border-emerald-500/30 text-emerald-300" 
                : "bg-amber-950/60 border border-amber-600/30 text-amber-300"
            }`}>
              {isFirebaseActive ? (
                <>
                  <Wifi className="w-3.5 h-3.5" />
                  <span>בסיס נתונים Firebase פעיל</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>סביבת סימולציה מקומית (Offline)</span>
                </>
              )}
            </div>

            {/* Simulated Persona Switcher Button */}
            <button
              onClick={() => setIsSimulatorOpen(!isSimulatorOpen)}
              className="text-xs bg-military-700 hover:bg-military-600 text-white font-medium py-1.5 px-3 rounded-lg flex items-center gap-1.5 border border-military-600 cursor-pointer shadow-sm transition"
            >
              <Sliders className="w-3.5 h-3.5 text-military-300" />
              <span>החלף משתמש לסימולציה</span>
            </button>

            {/* Profile Settings Button */}
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
            {currentUser.role === "commander" && (
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
                    <div className="absolute left-0 mt-2 w-80 md:w-96 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden text-right text-slate-800 font-sans">
                      <div className="bg-slate-50 p-3 px-4 border-b border-slate-100 flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-700 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                          התראות חריגים ודיווחים מחוץ לבסיס
                        </span>
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
                      </div>

                      <div className="max-h-[320px] overflow-y-auto divide-y divide-slate-100">
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
                                    {dateStr} | {timeStr}
                                  </span>
                                </div>

                                <div className="text-slate-600 p-0 text-right">
                                  {not.message}
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

            {/* Reset simulated data */}
            {!isFirebaseActive && (
              <button
                onClick={onResetData}
                title="אפס נתוני סימולציה"
                className="p-1.5 bg-military-900/60 hover:bg-rose-950/60 transition text-rose-300 hover:text-rose-100 rounded-lg border border-rose-900/30 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Simulation Switcher Panel */}
        <AnimatePresence>
          {isSimulatorOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 border-t border-military-700 pt-4 overflow-hidden"
            >
              <div className="bg-military-900/40 p-3.5 rounded-lg border border-military-700">
                <span className="text-xs font-semibold text-military-200 block mb-2.5 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-military-100" />
                  בחרו דמות לסימולציה כדי לבחון את הממשק באמולציה מלאה (חייל או מפקד):
                </span>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
                  {allUsers.map((user) => {
                    const isActive = user.userId === currentUser.userId;
                    return (
                      <button
                        key={user.userId}
                        onClick={() => {
                          onSwitchUser(user.userId);
                          setIsSimulatorOpen(false);
                        }}
                        className={`p-2.5 rounded-lg text-right text-xs transition duration-200 cursor-pointer flex flex-col justify-between ${
                          isActive 
                            ? "bg-military-500 border-2 border-military-300 text-white shadow" 
                            : "bg-military-800 hover:bg-military-700 text-military-100 border border-military-700"
                        }`}
                      >
                        <div className="font-bold truncate">{user.fullName}</div>
                        <div className="text-[10px] text-military-200 mt-1 truncate">
                          {user.role === "commander" ? "⭐ מפקד" : "חייל"} | {user.unit.split(" - ")[0]}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
                  <div>
                    <label className="block text-xs text-military-300 mb-1">שם מלא</label>
                    <input 
                      type="text" 
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-military-800 text-white border border-military-600 rounded px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-military-400 outline-none"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-military-300 mb-1">מחלקה / פלוגה</label>
                      <select
                        value={editUnit}
                        onChange={(e) => setEditUnit(e.target.value)}
                        className="w-full bg-military-800 text-white border border-military-600 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-military-400 outline-none"
                      >
                        {IDF_UNITS.map((unit) => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-military-300 mb-1">תפקיד / הרשאה</label>
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value as any)}
                        className="w-full bg-military-800 text-white border border-military-600 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-military-400 outline-none"
                      >
                        <option value="soldier">חייל (מדווח נוכחות)</option>
                        <option value="commander">מפקד (לוח בקרה ואישור)</option>
                      </select>
                    </div>
                  </div>

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
