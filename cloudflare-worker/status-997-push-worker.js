const REQUIRED_PERMISSION_BY_KIND = {
  commander_message: "dashboard.notifications.view",
  emergency: "emergency.manage",
  shift: "shifts.manage",
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
  if (!personalIdChanged && !newCode) {
    return jsonResponse({ error: "לא בוצע שינוי בפרטי המשתמש" }, 400, origin);
  }

  if (personalIdChanged) {
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
  if (personalIdChanged) authUpdate.email = `${newPersonalId}@idf.local`;
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
      personalId: personalIdChanged ? newPersonalId : currentPersonalId,
      codeReset: Boolean(newCode),
    },
    metadata: { credentialManagement: true },
    createdAt: now,
    timestamp: now,
    logType: "audit",
  });

  return jsonResponse(
    {
      ok: true,
      personalId: personalIdChanged ? newPersonalId : currentPersonalId,
      codeReset: Boolean(newCode),
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
  if (!requiredPermission || !input.target || !input.title || !input.body) {
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
  const authorized =
    effectiveRole === "super_admin" ||
    permissionSettings.roleMap?.[effectiveRole]?.[requiredPermission] === true;
  if (!authorized) return jsonResponse({ error: "Permission denied" }, 403, origin);

  const subscriptions = await getPushSubscriptions(projectId, accessToken);
  const recipients = subscriptions.filter((subscription) =>
    matchesTarget(subscription, input.target, input.kind)
  );
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
      if (path === "/admin/users/credentials") {
        return await handleUserCredentials(request, env, allowedOrigin);
      }
      return await handlePush(request, env, allowedOrigin);
    } catch (error) {
      console.error("Push worker error", error);
      return jsonResponse({ error: error.message || "Push failed" }, 500, allowedOrigin);
    }
  },
};
