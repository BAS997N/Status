import { auth } from "../firebase";

const PUSH_WORKER_URL = "https://status-997-push.avielias0.workers.dev/";

export type PushTarget =
  | { type: "all" }
  | { type: "management" }
  | { type: "role"; role: "commander" | "soldier" | "adjutant_officer" }
  | { type: "unit"; unit: string }
  | { type: "user"; userId: string }
  | { type: "users"; userIds: string[] };

export interface AutomaticPushRequest {
  kind: "commander_message" | "emergency" | "shift" | "attendance_reminder" | "registration";
  target: PushTarget;
  title: string;
  body: string;
  url?: string;
}

export async function sendAutomaticPush(request: AutomaticPushRequest) {
  if (!auth?.currentUser) throw new Error("Push sender is not authenticated");
  const idToken = await auth.currentUser.getIdToken();
  const response = await fetch(PUSH_WORKER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Push delivery failed");
  return result as { ok: true; recipients: number; sent: number; failed: number };
}

export async function getPushAvailableUserIds(): Promise<string[]> {
  if (!auth?.currentUser) throw new Error("Push availability requires authentication");
  const idToken = await auth.currentUser.getIdToken();
  const response = await fetch(`${PUSH_WORKER_URL}push/availability`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Push availability failed");
  return Array.isArray(result.userIds)
    ? result.userIds.filter((userId: unknown): userId is string => typeof userId === "string")
    : [];
}
