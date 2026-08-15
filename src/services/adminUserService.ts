import { auth, isFirebaseActive } from "../firebase";

const ADMIN_WORKER_BASE_URL =
  "https://status-997-push.avielias0.workers.dev/admin/users";

export interface UpdateUserCredentialsRequest {
  targetUserId: string;
  newPersonalId?: string;
  newCode?: string;
}

export interface UpdateUserCredentialsResult {
  ok: true;
  personalId: string;
  codeReset: boolean;
  authEmailSynced: boolean;
}

export async function updateUserCredentials(
  request: UpdateUserCredentialsRequest
): Promise<UpdateUserCredentialsResult> {
  if (!isFirebaseActive() || !auth?.currentUser) {
    throw new Error("יש להתחבר מחדש לפני ניהול פרטי ההתחברות");
  }

  const idToken = await auth.currentUser.getIdToken(true);
  const response = await fetch(`${ADMIN_WORKER_BASE_URL}/credentials`, {
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

export interface DeleteUserAccountResult {
  ok: true;
  userId: string;
  authDeleted: boolean;
  profileDeleted: boolean;
  relatedRecordsDeleted: number;
}

export async function deleteUserAccount(
  targetUserId: string
): Promise<DeleteUserAccountResult> {
  if (!isFirebaseActive() || !auth?.currentUser) {
    throw new Error("יש להתחבר מחדש לפני מחיקת משתמש מלאה");
  }

  const idToken = await auth.currentUser.getIdToken(true);
  const response = await fetch(`${ADMIN_WORKER_BASE_URL}/delete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ targetUserId }),
  });
  const result = (await response.json().catch(() => ({}))) as Partial<
    DeleteUserAccountResult
  > & { error?: string };
  if (!response.ok) {
    throw new Error(result.error || "מחיקת המשתמש נכשלה");
  }
  return result as DeleteUserAccountResult;
}
