import { auth, isFirebaseActive } from "../firebase";

const RECOVERY_WORKER_URL = "https://status-997-push.avielias0.workers.dev";

async function postRecovery(path: string, body: Record<string, unknown>, authenticated = false) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authenticated) {
    if (!isFirebaseActive() || !auth?.currentUser) {
      throw new Error("יש להתחבר מחדש לפני אימות המייל");
    }
    headers.Authorization = `Bearer ${await auth.currentUser.getIdToken(true)}`;
  }

  const response = await fetch(`${RECOVERY_WORKER_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    error?: string;
  };
  if (!response.ok) throw new Error(result.error || "הפעולה נכשלה");
  return result;
}

export const requestRecoveryEmailVerification = () =>
  postRecovery("/auth/recovery-email/request-verification", {}, true);

export const verifyRecoveryEmail = (token: string) =>
  postRecovery("/auth/recovery-email/verify", { token });

export const requestPasswordReset = (personalId: string) =>
  postRecovery("/auth/password-reset/request", { personalId });

export const completePasswordReset = (token: string, newCode: string) =>
  postRecovery("/auth/password-reset/complete", { token, newCode });
