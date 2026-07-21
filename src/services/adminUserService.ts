import { auth, isFirebaseActive } from "../firebase";

const ADMIN_WORKER_URL =
  "https://status-997-push.avielias0.workers.dev/admin/users/credentials";

export interface UpdateUserCredentialsRequest {
  targetUserId: string;
  newPersonalId?: string;
  newCode?: string;
}

export interface UpdateUserCredentialsResult {
  ok: true;
  personalId: string;
  codeReset: boolean;
}

export async function updateUserCredentials(
  request: UpdateUserCredentialsRequest
): Promise<UpdateUserCredentialsResult> {
  if (!isFirebaseActive() || !auth?.currentUser) {
    throw new Error("יש להתחבר מחדש לפני ניהול פרטי ההתחברות");
  }

  const idToken = await auth.currentUser.getIdToken(true);
  const response = await fetch(ADMIN_WORKER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  const result = (await response.json().catch(() => ({}))) as Partial<
    UpdateUserCredentialsResult
  > & { error?: string };
  if (!response.ok) {
    throw new Error(result.error || "עדכון פרטי ההתחברות נכשל");
  }

  return result as UpdateUserCredentialsResult;
}
