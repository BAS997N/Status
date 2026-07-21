import { useEffect, useState } from "react";
import { Bell, BellOff, Check, LoaderCircle } from "lucide-react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { app, db, isFirebaseActive } from "../firebase";
import { UserProfile } from "../types";

const VAPID_PUBLIC_KEY =
  "BHQmIKmZKdv_8MmYStvekIpAgr1Gi4NDiqyGw_MM-mjNA1BRBh_ec0BHgcuR8Ckuq8w9Oyf1zg9tyefg6hKqL8M";

type PushState = "checking" | "available" | "enabling" | "enabled" | "denied" | "unsupported" | "error";

async function tokenDocumentId(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export default function PushNotificationButton({ currentUser }: { currentUser: UserProfile }) {
  const [state, setState] = useState<PushState>("checking");

  const saveCurrentDevice = async (requestPermission: boolean) => {
    if (!isFirebaseActive() || !app || !db || !("serviceWorker" in navigator)) {
      setState("unsupported");
      return;
    }

    if (!(await isSupported())) {
      setState("unsupported");
      return;
    }

    let permission = Notification.permission;
    if (permission === "default" && requestPermission) {
      permission = await Notification.requestPermission();
    }

    if (permission === "denied") {
      setState("denied");
      return;
    }
    if (permission !== "granted") {
      setState("available");
      return;
    }

    setState("enabling");
    const registration = await navigator.serviceWorker.ready;
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_PUBLIC_KEY,
      serviceWorkerRegistration: registration,
    });

    if (!token) throw new Error("FCM registration token was not created");

    const subscriptionId = await tokenDocumentId(token);
    await setDoc(
      doc(db, "push_subscriptions", subscriptionId),
      {
        subscriptionId,
        token,
        userId: currentUser.userId,
        personalId: currentUser.personalId || "",
        userName: currentUser.fullName,
        unit: currentUser.unit || "",
        role: currentUser.role,
        systemRole: currentUser.systemRole || "",
        medicalRole: currentUser.medicalRole || "",
        platform: navigator.platform || "web",
        userAgent: navigator.userAgent,
        enabled: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    localStorage.setItem("idf_push_subscription_id", subscriptionId);
    setState("enabled");
  };

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !(await isSupported())) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      if (Notification.permission === "granted") {
        saveCurrentDevice(false).catch((error) => {
          console.warn("Push registration refresh failed:", error);
          if (!cancelled) setState("error");
        });
        return;
      }
      if (!cancelled) setState("available");
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [currentUser.userId]);

  useEffect(() => {
    if (state !== "enabled" || !app) return;
    const messaging = getMessaging(app);
    return onMessage(messaging, async (payload) => {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(payload.notification?.title || "מערכת נוכחות 997", {
        body: payload.notification?.body || payload.data?.body || "התקבלה הודעה חדשה",
        icon: "/Status/icon-transparent-192.png",
        badge: "/Status/icon-transparent-192.png",
        data: { url: payload.fcmOptions?.link || payload.data?.url || "/Status/" },
        dir: "rtl",
        lang: "he",
      });
    });
  }, [state]);

  if (state === "unsupported") return null;

  const enabled = state === "enabled";
  const denied = state === "denied";
  const busy = state === "checking" || state === "enabling";

  return (
    <button
      type="button"
      disabled={busy || enabled}
      onClick={() =>
        saveCurrentDevice(true).catch((error) => {
          console.error("Push registration failed:", error);
          setState("error");
          window.alert(
            "הפעלת ההתראות נכשלה. יש לרענן את הדף ולנסות שוב. אם התקלה נמשכת, יש לוודא שחוקי Firebase המעודכנים פורסמו."
          );
        })
      }
      title={denied ? "יש לאפשר התראות בהגדרות הדפדפן" : undefined}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
        enabled
          ? "border-emerald-400/40 bg-emerald-950/60 text-emerald-200"
          : denied
          ? "cursor-not-allowed border-rose-400/30 bg-rose-950/50 text-rose-200"
          : "border-amber-400/40 bg-amber-950/50 text-amber-100 hover:bg-amber-900/60"
      }`}
    >
      {busy ? (
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
      ) : enabled ? (
        <Check className="h-3.5 w-3.5" />
      ) : denied ? (
        <BellOff className="h-3.5 w-3.5" />
      ) : (
        <Bell className="h-3.5 w-3.5" />
      )}
      <span>{enabled ? "התראות פעילות" : denied ? "התראות חסומות" : state === "error" ? "נסה להפעיל שוב" : "הפעל התראות"}</span>
    </button>
  );
}
