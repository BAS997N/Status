import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();

type RolePermissionConfig = {
  systemRole?: string;
  permissions?: Record<string, boolean>;
};

const getEffectiveRole = (profile: FirebaseFirestore.DocumentData): string => {
  if (typeof profile.systemRole === "string" && profile.systemRole.trim()) {
    return profile.systemRole.trim();
  }

  if (profile.role === "commander") return "admin";
  if (profile.role === "adjutant_officer") return "viewer";
  return "reporter";
};

const callerMayResetCodes = async (
  callerUid: string,
  callerProfile: FirebaseFirestore.DocumentData
): Promise<boolean> => {
  if (
    callerProfile.personalId === "5749199" ||
    callerProfile.systemRole === "super_admin"
  ) {
    return true;
  }

  const effectiveRole = getEffectiveRole(callerProfile);
  const permissionsSnapshot = await getFirestore()
    .doc("settings/role_permissions")
    .get();

  const roles = Array.isArray(permissionsSnapshot.data()?.roles)
    ? (permissionsSnapshot.data()?.roles as RolePermissionConfig[])
    : [];

  const roleConfig = roles.find(
    (item) => String(item.systemRole || "") === effectiveRole
  );

  return roleConfig?.permissions?.["system_admin.users.manage"] === true;
};

export const resetPersonalCode = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError(
        "unauthenticated",
        "יש להתחבר למערכת לפני איפוס קוד אישי."
      );
    }

    const targetUserId = String(request.data?.targetUserId || "").trim();
    const newCode = String(request.data?.newCode || "").trim();

    if (!targetUserId) {
      throw new HttpsError("invalid-argument", "חסר מזהה משתמש.");
    }

    if (!/^\d{6}$/.test(newCode)) {
      throw new HttpsError(
        "invalid-argument",
        "הקוד האישי חייב להכיל בדיוק 6 ספרות."
      );
    }

    const db = getFirestore();
    const callerRef = db.doc(`users/${request.auth.uid}`);
    const targetRef = db.doc(`users/${targetUserId}`);

    const [callerSnapshot, targetSnapshot] = await Promise.all([
      callerRef.get(),
      targetRef.get(),
    ]);

    if (!callerSnapshot.exists) {
      throw new HttpsError(
        "permission-denied",
        "פרופיל המשתמש המבצע לא נמצא."
      );
    }

    const callerProfile = callerSnapshot.data() || {};
    const allowed = await callerMayResetCodes(
      request.auth.uid,
      callerProfile
    );

    if (!allowed) {
      throw new HttpsError(
        "permission-denied",
        "אין לך הרשאה לאפס קודים אישיים."
      );
    }

    if (!targetSnapshot.exists) {
      throw new HttpsError("not-found", "פרופיל המשתמש לא נמצא.");
    }

    const targetProfile = targetSnapshot.data() || {};

    try {
      await getAuth().updateUser(targetUserId, {
        password: newCode,
      });
    } catch (error: any) {
      if (error?.code === "auth/user-not-found") {
        throw new HttpsError(
          "not-found",
          "המשתמש לא נמצא ב־Firebase Authentication."
        );
      }

      console.error("Firebase Auth password reset failed:", error);
      throw new HttpsError(
        "internal",
        "שינוי הקוד ב־Firebase Authentication נכשל."
      );
    }

    await db.collection("system_logs").add({
      logType: "audit",
      action: "reset_personal_code",
      module: "users",
      actorId: request.auth.uid,
      actorName:
        callerProfile.fullName ||
        request.auth.token.email ||
        "משתמש לא ידוע",
      actorRole: getEffectiveRole(callerProfile),
      targetId: targetUserId,
      targetLabel:
        targetProfile.fullName ||
        targetProfile.personalId ||
        targetUserId,
      metadata: {
        targetPersonalId: targetProfile.personalId || "",
      },
      createdAt: new Date().toISOString(),
      timestamp: FieldValue.serverTimestamp(),
    });

    return { success: true };
  }
);
