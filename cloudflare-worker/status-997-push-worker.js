const REQUIRED_PERMISSION_BY_KIND = {
  commander_message: "dashboard.notifications.view",
  emergency: "emergency.manage",
  shift: "shifts.manage",
  attendance_reminder: "reports.manage",
  registration: null,
};

const jsonResponse = (body, status, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin || "null",
      Vary: "Origin",
    },
  });

const base64UrlEncode = (value) => {
  const bytes = value instanceof Uint8Array ? value : new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64UrlDecode = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const decodeJsonPart = (value) =>
  JSON.parse(new TextDecoder().decode(base64UrlDecode(value)));

async function verifyFirebaseIdToken(idToken, projectId) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid Firebase token");

  const header = decodeJsonPart(parts[0]);
  const claims = decodeJsonPart(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Invalid token header");

  const jwksResponse = await fetch(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  );
  if (!jwksResponse.ok) throw new Error("Unable to load Firebase signing keys");
  const jwks = await jwksResponse.json();
  const jwk = jwks.keys?.find((candidate) => candidate.kid === header.kid);
  if (!jwk) throw new Error("Firebase signing key not found");

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const validSignature = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    base64UrlDecode(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );

  const now = Math.floor(Date.now() / 1000);
  if (
    !validSignature ||
    claims.aud !== projectId ||
    claims.iss !== `https://securetoken.google.com/${projectId}` ||
    !claims.sub ||
    claims.exp <= now
  ) {
    throw new Error("Firebase token verification failed");
  }
  return claims;
}

async function importServiceAccountKey(privateKeyPem) {
  const normalized = privateKeyPem.replace(/\\n/g, "\n");
  const der = Uint8Array.from(
    atob(
      normalized
        .replace("-----BEGIN PRIVATE KEY-----", "")
        .replace("-----END PRIVATE KEY-----", "")
        .replace(/\s/g, "")
    ),
    (character) => character.charCodeAt(0)
  );
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function getGoogleAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope:
        "https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${payload}`;
  const key = await importServiceAccountKey(serviceAccount.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );
  const assertion = `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Google authorization failed: ${await response.text()}`);
  return (await response.json()).access_token;
}

function decodeFirestoreValue(value) {
  if (!value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if (value.arrayValue) return (value.arrayValue.values || []).map(decodeFirestoreValue);
  if (value.mapValue) return decodeFirestoreFields(value.mapValue.fields || {});
  return null;
}

function decodeFirestoreFields(fields) {
  return Object.fromEntries(
    Object.entries(fields || {}).map(([key, value]) => [key, decodeFirestoreValue(value)])
  );
}

function encodeFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  }
  if (typeof value === "object") {
    return { mapValue: { fields: encodeFirestoreFields(value) } };
  }
  return { stringValue: String(value) };
}

function encodeFirestoreFields(value) {
  return Object.fromEntries(
    Object.entries(value || {})
      .filter(([, fieldValue]) => fieldValue !== undefined)
      .map(([key, fieldValue]) => [key, encodeFirestoreValue(fieldValue)])
  );
}

async function getFirestoreDocument(projectId, bearerToken, documentPath) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`,
    { headers: { Authorization: `Bearer ${bearerToken}` } }
  );
  if (!response.ok) {
    throw new Error(
      `Firestore document read failed (${response.status}): ${documentPath} - ${await response.text()}`
    );
  }
  return decodeFirestoreFields((await response.json()).fields || {});
}

async function getOptionalFirestoreDocument(
  projectId,
  bearerToken,
  documentPath
) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`,
    { headers: { Authorization: `Bearer ${bearerToken}` } }
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `Firestore document read failed (${response.status}): ${documentPath} - ${await response.text()}`
    );
  }
  return decodeFirestoreFields((await response.json()).fields || {});
}

async function runFirestoreQuery(projectId, accessToken, structuredQuery) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ structuredQuery }),
    }
  );
  if (!response.ok) {
    throw new Error(`Firestore query failed: ${await response.text()}`);
  }
  const rows = await response.json();
  return rows
    .filter((row) => row.document?.fields)
    .map((row) => ({
      id: row.document.name.split("/").pop(),
      ...decodeFirestoreFields(row.document.fields),
    }));
}

async function patchFirestoreDocument(
  projectId,
  accessToken,
  documentPath,
  fields
) {
  const updateMask = Object.keys(fields)
    .map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
    .join("&");
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}?${updateMask}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: encodeFirestoreFields(fields) }),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Firestore document update failed (${response.status}): ${await response.text()}`
    );
  }
}

async function createAuditLog(projectId, accessToken, fields) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/system_logs`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: encodeFirestoreFields(fields) }),
    }
  );
  if (!response.ok) {
    console.warn("Credential audit log failed", await response.text());
  }
}

const RECOVERY_TOKEN_TTL_MS = 30 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RECOVERY_REQUEST_COOLDOWN_MS = 15 * 60 * 1000;

function createSecureToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function hashActionToken(token) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return base64UrlEncode(new Uint8Array(digest));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function recoveryAppUrl(env, origin, action, token) {
  const configured = String(env.APP_URL || `${origin}/Status/`).trim();
  const base = configured.endsWith("/") ? configured : `${configured}/`;
  const url = new URL(base);
  url.searchParams.set("recoveryAction", action);
  url.searchParams.set("token", token);
  return url.toString();
}

async function sendRecoveryEmail(env, { to, name, subject, heading, message, link, button }) {
  const html = `
        <div dir="rtl" style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0f172a">
          <h2>${escapeHtml(heading)}</h2>
          <p>שלום ${escapeHtml(name || "")},</p>
          <p style="line-height:1.7">${escapeHtml(message)}</p>
          <p style="margin:28px 0"><a href="${escapeHtml(link)}" style="background:#059669;color:white;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold">${escapeHtml(button)}</a></p>
          <p style="font-size:12px;color:#64748b">אם לא ביקשת פעולה זו, אין ללחוץ על הקישור. אין להעביר את הקישור לאדם אחר.</p>
        </div>`;

  let response;
  if (env.BREVO_API_KEY && env.BREVO_SENDER_EMAIL) {
    response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          email: env.BREVO_SENDER_EMAIL,
          name: env.BREVO_SENDER_NAME || "מערכת נוכחות תאג״ד 997",
        },
        to: [{ email: to, name: name || undefined }],
        subject,
        htmlContent: html,
      }),
    });
  } else if (env.RESEND_API_KEY && env.RESET_EMAIL_FROM) {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.RESET_EMAIL_FROM,
        to: [to],
        subject,
        html,
      }),
    });
  } else {
    throw new Error("שירות שליחת המייל טרם הוגדר ב-Cloudflare");
  }
  if (!response.ok) {
    throw new Error(`שליחת המייל נכשלה (${response.status}): ${await response.text()}`);
  }
}

async function saveActionToken(projectId, accessToken, token, fields) {
  const tokenHash = await hashActionToken(token);
  await patchFirestoreDocument(
    projectId,
    accessToken,
    `account_recovery_tokens/${tokenHash}`,
    fields
  );
}

async function readActionToken(projectId, accessToken, token) {
  if (!token || token.length > 200) return null;
  const tokenHash = await hashActionToken(token);
  const record = await getOptionalFirestoreDocument(
    projectId,
    accessToken,
    `account_recovery_tokens/${tokenHash}`
  );
  return record ? { ...record, tokenHash } : null;
}

function isUsableActionToken(record, purpose) {
  return Boolean(
    record &&
      record.purpose === purpose &&
      !record.usedAt &&
      Date.parse(record.expiresAt || "") > Date.now()
  );
}

async function getRecoveryAdminContext(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error("Worker secret is missing");
  }
  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  return {
    serviceAccount,
    projectId: serviceAccount.project_id,
    accessToken: await getGoogleAccessToken(serviceAccount),
  };
}

async function handleRecoveryEmailVerificationRequest(request, env, origin) {
  const { projectId, accessToken } = await getRecoveryAdminContext(env);
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return jsonResponse({ error: "יש להתחבר מחדש" }, 401, origin);
  }
  const idToken = authorization.slice(7);
  let claims;
  try {
    claims = await verifyFirebaseIdToken(idToken, projectId);
  } catch {
    return jsonResponse({ error: "ההתחברות פגה. יש להתחבר מחדש." }, 401, origin);
  }
  const profile = await getFirestoreDocument(projectId, accessToken, `users/${claims.sub}`);
  const email = String(profile.recoveryEmail || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: "לא הוגדר מייל אישי תקין בפרופיל" }, 400, origin);
  }
  if (profile.recoveryEmailVerified === true) {
    return jsonResponse({ ok: true, message: "המייל כבר מאומת." }, 200, origin);
  }

  const token = createSecureToken();
  const now = new Date();
  await saveActionToken(projectId, accessToken, token, {
    purpose: "verify_recovery_email",
    userId: claims.sub,
    email,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS).toISOString(),
    usedAt: "",
  });
  await sendRecoveryEmail(env, {
    to: email,
    name: profile.fullName,
    subject: "אימות המייל האישי במערכת הנוכחות",
    heading: "אימות מייל אישי",
    message: "לחץ על הכפתור כדי לאמת את המייל ולאפשר שחזור עצמאי של הקוד האישי. הקישור תקף ל-24 שעות.",
    link: recoveryAppUrl(env, origin, "verify", token),
    button: "אימות המייל",
  });
  return jsonResponse(
    {
      ok: true,
      message:
        "קישור אימות נשלח למייל האישי. אם ההודעה אינה מופיעה, יש לבדוק גם בתיקיית הספאם.",
    },
    200,
    origin
  );
}

async function handleRecoveryEmailVerify(request, env, origin) {
  const { projectId, accessToken } = await getRecoveryAdminContext(env);
  const input = await request.json();
  const record = await readActionToken(projectId, accessToken, String(input.token || ""));
  if (!isUsableActionToken(record, "verify_recovery_email")) {
    return jsonResponse({ error: "קישור האימות אינו תקין או שפג תוקפו." }, 400, origin);
  }
  const profile = await getFirestoreDocument(projectId, accessToken, `users/${record.userId}`);
  if (String(profile.recoveryEmail || "").trim().toLowerCase() !== record.email) {
    return jsonResponse({ error: "כתובת המייל השתנתה. יש לשלוח קישור אימות חדש." }, 400, origin);
  }
  const now = new Date().toISOString();
  await patchFirestoreDocument(projectId, accessToken, `users/${record.userId}`, {
    recoveryEmailVerified: true,
    recoveryEmailVerifiedAt: now,
  });
  await patchFirestoreDocument(projectId, accessToken, `account_recovery_tokens/${record.tokenHash}`, {
    usedAt: now,
  });
  return jsonResponse({ ok: true, message: "המייל אומת בהצלחה. מעכשיו ניתן לאפס את הקוד באופן עצמאי." }, 200, origin);
}

async function handlePasswordResetRequest(request, env, origin) {
  const genericMessage =
    "אם קיים חשבון עם מייל מאומת, נשלח אליו קישור לאיפוס הקוד. אם ההודעה אינה מופיעה, יש לבדוק גם בתיקיית הספאם.";
  const { projectId, accessToken } = await getRecoveryAdminContext(env);
  const input = await request.json();
  const personalId = String(input.personalId || "").trim();
  if (!/^\d{5,10}$/.test(personalId)) {
    return jsonResponse({ ok: true, message: genericMessage }, 200, origin);
  }
  const matches = await findUsersByPersonalId(projectId, accessToken, personalId);
  if (matches.length !== 1) return jsonResponse({ ok: true, message: genericMessage }, 200, origin);
  const userId = matches[0];
  const profile = await getFirestoreDocument(projectId, accessToken, `users/${userId}`);
  const email = String(profile.recoveryEmail || "").trim().toLowerCase();
  if (profile.recoveryEmailVerified !== true || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ ok: true, message: genericMessage }, 200, origin);
  }

  const rateRecord = await getOptionalFirestoreDocument(projectId, accessToken, `account_recovery_rate/${userId}`);
  if (rateRecord?.lastSentAt && Date.now() - Date.parse(rateRecord.lastSentAt) < RECOVERY_REQUEST_COOLDOWN_MS) {
    return jsonResponse({ ok: true, message: genericMessage }, 200, origin);
  }

  const token = createSecureToken();
  const now = new Date();
  await saveActionToken(projectId, accessToken, token, {
    purpose: "password_reset",
    userId,
    email,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + RECOVERY_TOKEN_TTL_MS).toISOString(),
    usedAt: "",
  });
  await sendRecoveryEmail(env, {
    to: email,
    name: profile.fullName,
    subject: "איפוס הקוד האישי במערכת הנוכחות",
    heading: "איפוס קוד אישי",
    message: "התקבלה בקשה לאיפוס הקוד האישי. הקישור חד-פעמי ותקף ל-30 דקות.",
    link: recoveryAppUrl(env, origin, "reset", token),
    button: "בחירת קוד חדש",
  });
  await patchFirestoreDocument(projectId, accessToken, `account_recovery_rate/${userId}`, {
    lastSentAt: now.toISOString(),
  });
  return jsonResponse({ ok: true, message: genericMessage }, 200, origin);
}

async function handlePasswordResetComplete(request, env, origin) {
  const { projectId, accessToken } = await getRecoveryAdminContext(env);
  const input = await request.json();
  const newCode = String(input.newCode || "").trim();
  if (!/^\d{6}$/.test(newCode)) {
    return jsonResponse({ error: "הקוד החדש חייב להכיל 6 ספרות." }, 400, origin);
  }
  const record = await readActionToken(projectId, accessToken, String(input.token || ""));
  if (!isUsableActionToken(record, "password_reset")) {
    return jsonResponse({ error: "קישור האיפוס אינו תקין, כבר נוצל או שפג תוקפו." }, 400, origin);
  }
  const profile = await getFirestoreDocument(projectId, accessToken, `users/${record.userId}`);
  if (
    profile.recoveryEmailVerified !== true ||
    String(profile.recoveryEmail || "").trim().toLowerCase() !== record.email
  ) {
    return jsonResponse({ error: "המייל בחשבון השתנה. יש להתחיל את האיפוס מחדש." }, 400, origin);
  }
  await updateFirebaseAuthUser(projectId, accessToken, {
    localId: record.userId,
    password: newCode,
  });
  const now = new Date().toISOString();
  await patchFirestoreDocument(projectId, accessToken, `account_recovery_tokens/${record.tokenHash}`, {
    usedAt: now,
  });
  await createAuditLog(projectId, accessToken, {
    action: "reset",
    module: "users",
    actorId: record.userId,
    actorName: profile.fullName || "משתמש",
    actorRole: profile.systemRole || profile.role || "reporter",
    targetId: record.userId,
    targetLabel: profile.fullName || record.userId,
    after: { selfServicePasswordReset: true },
    createdAt: now,
    timestamp: now,
    logType: "audit",
  });
  return jsonResponse({ ok: true, message: "הקוד עודכן בהצלחה. ניתן להתחבר באמצעות הקוד החדש." }, 200, origin);
}

async function findUsersByPersonalId(projectId, accessToken, personalId) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "users" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "personalId" },
              op: "EQUAL",
              value: { stringValue: personalId },
            },
          },
          limit: 2,
        },
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`Personal ID lookup failed: ${await response.text()}`);
  }
  const rows = await response.json();
  return rows
    .filter((row) => row.document?.name)
    .map((row) => row.document.name.split("/").pop());
}

async function updateFirebaseAuthUser(projectId, accessToken, payload) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
  if (!response.ok) {
    const details = await response.text();
    if (details.includes("EMAIL_EXISTS")) {
      throw new Error("המספר האישי כבר משויך למשתמש אחר");
    }
    throw new Error(`Firebase Auth update failed (${response.status}): ${details}`);
  }
}

async function deleteFirebaseAuthUser(projectId, accessToken, localId) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:delete`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ localId }),
    }
  );
  if (!response.ok) {
    const details = await response.text();
    if (details.includes("USER_NOT_FOUND")) return false;
    throw new Error(`Firebase Auth delete failed (${response.status}): ${details}`);
  }
  return true;
}

async function deleteFirestoreDocument(projectId, accessToken, documentPath) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(
      `Firestore document delete failed (${response.status}): ${documentPath} - ${await response.text()}`
    );
  }
  return true;
}

async function authorizeAdminRequest(request, serviceAccount, requiredPermission) {
  const projectId = serviceAccount.project_id;
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    throw Object.assign(new Error("Authentication required"), { status: 401 });
  }

  const idToken = authorization.slice(7);
  let claims;
  try {
    claims = await verifyFirebaseIdToken(idToken, projectId);
  } catch (error) {
    throw Object.assign(error, { status: 401 });
  }

  const [user, permissionSettings] = await Promise.all([
    getFirestoreDocument(projectId, idToken, `users/${claims.sub}`),
    getFirestoreDocument(projectId, idToken, "settings/role_permissions"),
  ]);
  const effectiveRole =
    user.systemRole ||
    (user.role === "commander"
      ? "admin"
      : user.role === "adjutant_officer"
      ? "viewer"
      : "reporter");
  const authorized =
    effectiveRole === "super_admin" ||
    permissionSettings.roleMap?.[effectiveRole]?.[requiredPermission] === true;
  if (!authorized) {
    throw Object.assign(new Error("Permission denied"), { status: 403 });
  }

  return { claims, user, effectiveRole, idToken };
}

function roleHasAnyPermission(permissionSettings, effectiveRole, permissions) {
  if (effectiveRole === "super_admin") return true;
  const rolePermissions = permissionSettings.roleMap?.[effectiveRole] || {};
  return permissions.some((permission) => rolePermissions[permission] === true);
}

async function forwardGoogleSheetsPayload(env, payload) {
  const webAppUrl = String(env.GOOGLE_SHEETS_WEB_APP_URL || "").trim();
  const sharedSecret = String(env.GOOGLE_SHEETS_SHARED_SECRET || "").trim();
  if (!webAppUrl || !sharedSecret) {
    throw Object.assign(
      new Error("Google Sheets server configuration is missing"),
      { status: 500 }
    );
  }
  const response = await fetch(webAppUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...payload, sharedSecret }),
  });
  const text = await response.text();
  if (!response.ok || /^ERROR:/i.test(text.trim())) {
    throw Object.assign(
      new Error(text.trim() || `Google Sheets request failed (${response.status})`),
      { status: 502 }
    );
  }
  return text;
}

async function handleGoogleSheetsSync(request, env, origin) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return jsonResponse({ error: "Worker secret is missing" }, 500, origin);
  }

  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const projectId = serviceAccount.project_id;
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return jsonResponse({ error: "Authentication required" }, 401, origin);
  }
  const idToken = authorization.slice(7);
  let claims;
  try {
    claims = await verifyFirebaseIdToken(idToken, projectId);
  } catch (error) {
    return jsonResponse({ error: error.message }, 401, origin);
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400, origin);
  }
  if (!input || typeof input !== "object") {
    return jsonResponse({ error: "Invalid request body" }, 400, origin);
  }

  const [user, permissionSettings] = await Promise.all([
    getFirestoreDocument(projectId, idToken, `users/${claims.sub}`),
    getFirestoreDocument(projectId, idToken, "settings/role_permissions"),
  ]);
  const effectiveRole =
    user.systemRole ||
    (user.role === "commander"
      ? "admin"
      : user.role === "adjutant_officer"
      ? "viewer"
      : "reporter");
  const canManageAttendanceExport = roleHasAnyPermission(
    permissionSettings,
    effectiveRole,
    ["reports.manage", "sheets.export", "system_admin.sheets.manage"]
  );

  const authorizeAttendanceEntry = (entry) => {
    if (canManageAttendanceExport) return true;
    return (
      String(entry.targetUserId || "") === claims.sub &&
      String(entry.personalId || "") === String(user.personalId || "")
    );
  };

  try {
    if (input.action === "connection_test") {
      if (
        !roleHasAnyPermission(permissionSettings, effectiveRole, [
          "system_admin.sheets.manage",
        ])
      ) {
        return jsonResponse({ error: "Permission denied" }, 403, origin);
      }
      await forwardGoogleSheetsPayload(env, input);
      return jsonResponse({ ok: true }, 200, origin);
    }

    if (input.action === "syncLineNumericRoster") {
      if (
        !roleHasAnyPermission(permissionSettings, effectiveRole, [
          "line_planning.manage",
          "system_admin.sheets.manage",
        ])
      ) {
        return jsonResponse({ error: "Permission denied" }, 403, origin);
      }
      if (!Array.isArray(input.rows) || input.rows.length > 500) {
        return jsonResponse({ error: "Invalid roster payload" }, 400, origin);
      }
      await forwardGoogleSheetsPayload(env, input);
      return jsonResponse({ ok: true, sent: 1, failed: 0 }, 200, origin);
    }

    const entries =
      input.action === "attendance_batch"
        ? input.entries
        : input.action === "attendance"
        ? [input]
        : null;
    if (!Array.isArray(entries) || entries.length === 0 || entries.length > 100) {
      return jsonResponse({ error: "Invalid attendance payload" }, 400, origin);
    }
    if (!entries.every(authorizeAttendanceEntry)) {
      return jsonResponse({ error: "Permission denied" }, 403, origin);
    }

    const responseText = await forwardGoogleSheetsPayload(
      env,
      input.action === "attendance_batch"
        ? { action: "attendance_batch", entries }
        : { ...entries[0], action: "attendance" }
    );
    let sheetResult = {};
    try {
      sheetResult = JSON.parse(responseText);
    } catch {
      sheetResult = { sent: entries.length, failed: 0 };
    }
    const sent = Number(sheetResult.sent || 0);
    const failed = Number(sheetResult.failed || 0);
    return jsonResponse(
      { ok: failed === 0, sent, failed, errors: sheetResult.errors || [] },
      failed === entries.length ? 502 : 200,
      origin
    );
  } catch (error) {
    return jsonResponse({ error: error.message }, error.status || 500, origin);
  }
}

async function handleUserCredentials(request, env, origin) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return jsonResponse({ error: "Worker secret is missing" }, 500, origin);
  }

  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const projectId = serviceAccount.project_id;
  let admin;
  try {
    admin = await authorizeAdminRequest(
      request,
      serviceAccount,
      "system_admin.users.manage"
    );
  } catch (error) {
    return jsonResponse({ error: error.message }, error.status || 500, origin);
  }

  const input = await request.json();
  const targetUserId = String(input.targetUserId || "").trim();
  const newPersonalId = String(input.newPersonalId || "").trim();
  const newCode = String(input.newCode || "").trim();
  if (!targetUserId || targetUserId.length > 128) {
    return jsonResponse({ error: "משתמש יעד לא תקין" }, 400, origin);
  }
  if (newPersonalId && !/^\d{5,10}$/.test(newPersonalId)) {
    return jsonResponse({ error: "מספר אישי חייב להכיל 5 עד 10 ספרות" }, 400, origin);
  }
  if (newCode && !/^\d{6}$/.test(newCode)) {
    return jsonResponse({ error: "הקוד החדש חייב להכיל 6 ספרות" }, 400, origin);
  }
  if (!newPersonalId && !newCode) {
    return jsonResponse({ error: "לא נבחר שינוי לביצוע" }, 400, origin);
  }

  const accessToken = await getGoogleAccessToken(serviceAccount);
  const targetUser = await getFirestoreDocument(
    projectId,
    admin.idToken,
    `users/${targetUserId}`
  );
  const currentPersonalId = String(targetUser.personalId || "").trim();
  const personalIdChanged =
    Boolean(newPersonalId) && newPersonalId !== currentPersonalId;
  // A supplied personal ID is also a repair/sync request. The Firestore profile
  // may already contain the new ID while Firebase Auth still has the old email.
  if (newPersonalId) {
    const matches = await findUsersByPersonalId(
      projectId,
      accessToken,
      newPersonalId
    );
    if (matches.some((userId) => userId !== targetUserId)) {
      return jsonResponse(
        { error: "המספר האישי כבר משויך למשתמש אחר" },
        409,
        origin
      );
    }
  }

  const authUpdate = { localId: targetUserId };
  if (newPersonalId) authUpdate.email = `${newPersonalId}@idf.local`;
  if (newCode) authUpdate.password = newCode;
  await updateFirebaseAuthUser(projectId, accessToken, authUpdate);

  const now = new Date().toISOString();
  if (personalIdChanged) {
    try {
      await patchFirestoreDocument(projectId, accessToken, `users/${targetUserId}`, {
        personalId: newPersonalId,
        credentialsUpdatedAt: now,
        credentialsUpdatedBy: admin.claims.sub,
      });
    } catch (error) {
      if (currentPersonalId) {
        await updateFirebaseAuthUser(projectId, accessToken, {
          localId: targetUserId,
          email: `${currentPersonalId}@idf.local`,
        }).catch(() => undefined);
      }
      throw error;
    }
  }

  await createAuditLog(projectId, accessToken, {
    action: "update",
    module: "users",
    actorId: admin.claims.sub,
    actorName: admin.user.fullName || admin.claims.email || "מנהל מערכת",
    actorRole: admin.effectiveRole,
    targetId: targetUserId,
    targetLabel: targetUser.fullName || targetUserId,
    before: { personalId: currentPersonalId },
    after: {
      personalId: newPersonalId || currentPersonalId,
      codeReset: Boolean(newCode),
    },
    metadata: {
      credentialManagement: true,
      authEmailSynced: Boolean(newPersonalId),
    },
    createdAt: now,
    timestamp: now,
    logType: "audit",
  });

  return jsonResponse(
    {
      ok: true,
      personalId: newPersonalId || currentPersonalId,
      codeReset: Boolean(newCode),
      authEmailSynced: Boolean(newPersonalId),
    },
    200,
    origin
  );
}

async function handleUserAccountDelete(request, env, origin) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return jsonResponse({ error: "Worker secret is missing" }, 500, origin);
  }

  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const projectId = serviceAccount.project_id;
  let admin;
  try {
    admin = await authorizeAdminRequest(
      request,
      serviceAccount,
      "system_admin.users.manage"
    );
  } catch (error) {
    return jsonResponse({ error: error.message }, error.status || 500, origin);
  }
  if (admin.effectiveRole !== "super_admin") {
    return jsonResponse({ error: "רק סופר־אדמין רשאי לבצע מחיקה מלאה" }, 403, origin);
  }

  const input = await request.json();
  const targetUserId = String(input.targetUserId || "").trim();
  if (!targetUserId || targetUserId.length > 128) {
    return jsonResponse({ error: "משתמש יעד לא תקין" }, 400, origin);
  }
  if (targetUserId === admin.claims.sub) {
    return jsonResponse({ error: "לא ניתן למחוק את החשבון המחובר כעת" }, 400, origin);
  }

  const accessToken = await getGoogleAccessToken(serviceAccount);
  const targetUser = await getOptionalFirestoreDocument(
    projectId,
    admin.idToken,
    `users/${targetUserId}`
  );
  if (targetUser?.systemRole === "super_admin") {
    return jsonResponse({ error: "לא ניתן למחוק חשבון סופר־אדמין אחר" }, 403, origin);
  }

  const authDeleted = await deleteFirebaseAuthUser(
    projectId,
    accessToken,
    targetUserId
  );

  let relatedRecordsDeleted = 0;
  for (const collectionId of [
    "push_subscriptions",
    "pwa_installations",
    "account_recovery_tokens",
  ]) {
    const records = await runFirestoreQuery(projectId, accessToken, {
      from: [{ collectionId }],
      where: {
        fieldFilter: {
          field: { fieldPath: "userId" },
          op: "EQUAL",
          value: { stringValue: targetUserId },
        },
      },
      limit: 500,
    });
    for (const record of records) {
      if (
        await deleteFirestoreDocument(
          projectId,
          accessToken,
          `${collectionId}/${record.id}`
        )
      ) {
        relatedRecordsDeleted += 1;
      }
    }
  }

  const profileDeleted = await deleteFirestoreDocument(
    projectId,
    accessToken,
    `users/${targetUserId}`
  );
  const now = new Date().toISOString();
  await createAuditLog(projectId, accessToken, {
    action: "delete",
    module: "users",
    actorId: admin.claims.sub,
    actorName: admin.user.fullName || admin.claims.email || "מנהל מערכת",
    actorRole: admin.effectiveRole,
    targetId: targetUserId,
    targetLabel: targetUser?.fullName || targetUserId,
    before: targetUser || { userId: targetUserId },
    after: null,
    metadata: {
      fullAccountDeletion: true,
      authDeleted,
      profileDeleted,
      relatedRecordsDeleted,
    },
    createdAt: now,
    timestamp: now,
    logType: "audit",
  });

  return jsonResponse(
    {
      ok: true,
      userId: targetUserId,
      authDeleted,
      profileDeleted,
      relatedRecordsDeleted,
    },
    200,
    origin
  );
}

async function getPushSubscriptions(projectId, accessToken) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "push_subscriptions" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "enabled" },
              op: "EQUAL",
              value: { booleanValue: true },
            },
          },
          limit: 500,
        },
      }),
    }
  );
  if (!response.ok) throw new Error(`Subscription query failed: ${await response.text()}`);
  const rows = await response.json();
  return rows
    .filter((row) => row.document?.fields)
    .map((row) => decodeFirestoreFields(row.document.fields));
}

async function handlePushAvailability(request, env, origin) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return jsonResponse({ error: "Worker secret is missing" }, 500, origin);
  }

  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  let admin;
  try {
    admin = await authorizeAdminRequest(
      request,
      serviceAccount,
      "reports.manage"
    );
  } catch (error) {
    return jsonResponse({ error: error.message }, error.status || 500, origin);
  }

  const accessToken = await getGoogleAccessToken(serviceAccount);
  const subscriptions = await getPushSubscriptions(
    serviceAccount.project_id,
    accessToken
  );
  const userIds = Array.from(
    new Set(
      subscriptions
        .filter(
          (subscription) =>
            subscription.enabled !== false &&
            subscription.token &&
            subscription.userId
        )
        .map((subscription) => subscription.userId)
    )
  );

  return jsonResponse({ ok: true, userIds }, 200, origin);
}

const normalizeUnit = (value) =>
  String(value || "")
    .replace(/[״׳'"`]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();

function matchesTarget(subscription, target, kind) {
  if (!subscription.token || subscription.enabled === false) return false;
  if (kind === "emergency") {
    const unit = normalizeUnit(subscription.unit);
    if (unit.includes("מסופח") && unit.includes("תאגד")) return false;
  }
  if (target.type === "user") return subscription.userId === target.userId;
  if (target.type === "users") return target.userIds.includes(subscription.userId);
  if (target.type === "management") {
    const systemRole = String(subscription.systemRole || "").trim();
    return (
      subscription.role === "commander" ||
      systemRole === "super_admin" ||
      systemRole === "admin" ||
      (systemRole !== "" && systemRole !== "reporter" && systemRole !== "viewer")
    );
  }
  if (target.type === "registration_recipients") return false;
  if (target.type === "unit") {
    return subscription.role === "soldier" && subscription.unit === target.unit;
  }
  if (target.type === "role") return subscription.role === target.role;
  return subscription.role === "soldier";
}

async function sendFcmMessage(projectId, accessToken, token, message) {
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: message.title, body: message.body },
          webpush: {
            headers: { Urgency: message.kind === "emergency" ? "high" : "normal" },
            notification: {
              icon: "https://bas997n.github.io/Status/icon-transparent-192.png",
              badge: "https://bas997n.github.io/Status/icon-transparent-192.png",
              dir: "rtl",
              lang: "he",
              requireInteraction: message.kind === "emergency",
              tag: `status-997-${message.kind}`,
            },
            fcm_options: { link: message.url || "https://bas997n.github.io/Status/" },
          },
        },
      }),
    }
  );
  return { ok: response.ok, status: response.status, text: await response.text() };
}

function getLocalDateAndTime(timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

async function runAttendanceReminder(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error("Worker secret is missing");
  }

  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const projectId = serviceAccount.project_id;
  const accessToken = await getGoogleAccessToken(serviceAccount);
  const settings = await getFirestoreDocument(
    projectId,
    accessToken,
    "settings/system_settings"
  );

  if (
    settings.notificationsEnabled === false ||
    settings.attendanceReminderEnabled !== true
  ) {
    return { skipped: "disabled" };
  }

  const reminderTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(
    String(settings.attendanceReminderTime || "")
  )
    ? String(settings.attendanceReminderTime)
    : "09:00";
  const local = getLocalDateAndTime(settings.timeZone || "Asia/Jerusalem");
  if (local.time < reminderTime) return { skipped: "before-time" };

  const statePath = "automation_state/attendance_reminder";
  const state = await getOptionalFirestoreDocument(
    projectId,
    accessToken,
    statePath
  );
  if (state?.lastSentDate === local.date) {
    return { skipped: "already-sent" };
  }

  const [users, reports, subscriptions] = await Promise.all([
    runFirestoreQuery(projectId, accessToken, {
      from: [{ collectionId: "users" }],
      limit: 500,
    }),
    runFirestoreQuery(projectId, accessToken, {
      from: [{ collectionId: "attendance" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "reportDate" },
          op: "EQUAL",
          value: { stringValue: local.date },
        },
      },
      limit: 500,
    }),
    getPushSubscriptions(projectId, accessToken),
  ]);

  const reportedUserIds = new Set(
    reports
      .filter((report) => report.isReset !== true && report.userId)
      .map((report) => report.userId)
  );
  const missingUserIds = new Set(
    users
      .filter(
        (user) =>
          user.role === "soldier" &&
          user.isDischarged !== true &&
          !reportedUserIds.has(user.id)
      )
      .map((user) => user.id)
  );
  const recipientByUserId = new Map();
  subscriptions
    .filter(
      (subscription) =>
        subscription.enabled !== false &&
        missingUserIds.has(subscription.userId) &&
        subscription.token
    )
    .sort(
      (a, b) =>
        new Date(b.updatedAt || 0).getTime() -
        new Date(a.updatedAt || 0).getTime()
    )
    .forEach((subscription) => {
      if (!recipientByUserId.has(subscription.userId)) {
        recipientByUserId.set(subscription.userId, subscription);
      }
    });
  const recipients = Array.from(recipientByUserId.values());

  const message = {
    kind: "attendance_reminder",
    title: "תזכורת לדיווח נוכחות",
    body: "טרם ביצעת דיווח נוכחות להיום. יש להיכנס למערכת ולדווח.",
    url: "https://bas997n.github.io/Status/",
  };
  const results = await Promise.all(
    recipients.map((subscription) =>
      sendFcmMessage(projectId, accessToken, subscription.token, message)
    )
  );
  const sent = results.filter((result) => result.ok).length;

  await patchFirestoreDocument(projectId, accessToken, statePath, {
    lastSentDate: local.date,
    lastRunAt: new Date().toISOString(),
    scheduledTime: reminderTime,
    missingUsers: missingUserIds.size,
    recipients: recipients.length,
    sent,
    failed: results.length - sent,
  });

  return {
    date: local.date,
    missingUsers: missingUserIds.size,
    recipients: recipients.length,
    sent,
    failed: results.length - sent,
  };
}

async function handlePush(request, env, origin) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return jsonResponse({ error: "Worker secret is missing" }, 500, origin);
  }

  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const projectId = serviceAccount.project_id;
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return jsonResponse({ error: "Authentication required" }, 401, origin);
  }

  const idToken = authorization.slice(7);
  let claims;
  try {
    claims = await verifyFirebaseIdToken(idToken, projectId);
  } catch (error) {
    return jsonResponse({ error: error.message }, 401, origin);
  }

  const input = await request.json();
  const requiredPermission = REQUIRED_PERMISSION_BY_KIND[input.kind];
  if (!(input.kind in REQUIRED_PERMISSION_BY_KIND) || !input.target || !input.title || !input.body) {
    return jsonResponse({ error: "Invalid push request" }, 400, origin);
  }
  if (input.title.length > 120 || input.body.length > 600) {
    return jsonResponse({ error: "Notification text is too long" }, 400, origin);
  }

  const accessToken = await getGoogleAccessToken(serviceAccount);
  // Read the sender's own profile and the public role settings with the verified
  // Firebase ID token. Firestore rules already allow these reads to signed-in
  // users, so this does not depend on the service account's Firestore IAM role.
  const [user, permissionSettings] = await Promise.all([
    getFirestoreDocument(projectId, idToken, `users/${claims.sub}`),
    getFirestoreDocument(projectId, idToken, "settings/role_permissions"),
  ]);
  const effectiveRole =
    user.systemRole ||
    (user.role === "commander" ? "admin" : user.role === "adjutant_officer" ? "viewer" : "reporter");
  const registrationCreatedAt = Date.parse(String(user.createdAt || ""));
  const registrationAgeMs = Date.now() - registrationCreatedAt;
  const isRegistrationPush =
    input.kind === "registration" &&
    input.target?.type === "registration_recipients" &&
    user.systemAccessBlocked !== true &&
    String(user.fullName || "").trim().length > 0 &&
    Number.isFinite(registrationCreatedAt) &&
    registrationAgeMs >= 0 &&
    registrationAgeMs <= 15 * 60 * 1000;
  const authorized =
    isRegistrationPush ||
    effectiveRole === "super_admin" ||
    (requiredPermission && permissionSettings.roleMap?.[effectiveRole]?.[requiredPermission] === true);
  if (!authorized) return jsonResponse({ error: "Permission denied" }, 403, origin);

  let registrationRecipientPersonalIds = ["5749199"];
  if (input.kind === "registration") {
    const systemSettings = await getOptionalFirestoreDocument(
      projectId,
      accessToken,
      "settings/system_settings"
    );
    const configuredRecipients = Array.isArray(
      systemSettings?.registrationNotificationRecipientPersonalIds
    )
      ? systemSettings.registrationNotificationRecipientPersonalIds
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      : [];
    if (configuredRecipients.length > 0) {
      registrationRecipientPersonalIds = configuredRecipients;
    }
  }

  const subscriptions = await getPushSubscriptions(projectId, accessToken);
  const recipients = subscriptions.filter((subscription) => {
    if (input.kind === "registration") {
      return (
        subscription.token &&
        subscription.enabled !== false &&
        registrationRecipientPersonalIds.includes(
          String(subscription.personalId || "").trim()
        )
      );
    }
    return matchesTarget(subscription, input.target, input.kind);
  });
  if (recipients.length > 500) {
    return jsonResponse({ error: "Recipient limit exceeded" }, 400, origin);
  }

  const results = await Promise.all(
    recipients.map((subscription) =>
      sendFcmMessage(projectId, accessToken, subscription.token, input)
    )
  );
  const sent = results.filter((result) => result.ok).length;
  return jsonResponse(
    { ok: true, recipients: recipients.length, sent, failed: results.length - sent },
    200,
    origin
  );
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = env.ALLOWED_ORIGIN || "https://bas997n.github.io";

    if (request.method === "GET") {
      return jsonResponse({ ok: true, service: "status-997-push" }, 200, allowedOrigin);
    }
    if (origin !== allowedOrigin) {
      return jsonResponse({ error: "Origin not allowed" }, 403, allowedOrigin);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        },
      });
    }
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, allowedOrigin);
    }

    try {
      const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
      if (path === "/auth/recovery-email/request-verification") {
        return await handleRecoveryEmailVerificationRequest(request, env, allowedOrigin);
      }
      if (path === "/auth/recovery-email/verify") {
        return await handleRecoveryEmailVerify(request, env, allowedOrigin);
      }
      if (path === "/auth/password-reset/request") {
        return await handlePasswordResetRequest(request, env, allowedOrigin);
      }
      if (path === "/auth/password-reset/complete") {
        return await handlePasswordResetComplete(request, env, allowedOrigin);
      }
      if (path === "/admin/users/credentials") {
        return await handleUserCredentials(request, env, allowedOrigin);
      }
      if (path === "/admin/users/delete") {
        return await handleUserAccountDelete(request, env, allowedOrigin);
      }
      if (path === "/sheets/sync") {
        return await handleGoogleSheetsSync(request, env, allowedOrigin);
      }
      if (path === "/push/availability") {
        return await handlePushAvailability(request, env, allowedOrigin);
      }
      return await handlePush(request, env, allowedOrigin);
    } catch (error) {
      console.error("Push worker error", error);
      return jsonResponse({ error: error.message || "Push failed" }, 500, allowedOrigin);
    }
  },
  async scheduled(_event, env, context) {
    context.waitUntil(
      runAttendanceReminder(env)
        .then((result) =>
          console.log("Attendance reminder schedule completed", result)
        )
        .catch((error) =>
          console.error("Attendance reminder schedule failed", error)
        )
    );
  },
};
