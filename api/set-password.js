// Vercel serverless: الأمين يحدد باسورد جديد لخادم من غير ما يعرف القديم.
// محتاج متغير بيئة FIREBASE_SERVICE_ACCOUNT (محتوى ملف مفتاح الخدمة JSON) على Vercel.
const admin = require("firebase-admin");

let initReason = "";
function init() {
  if (admin.apps.length) return true;
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw || !raw.trim()) { initReason = "env_missing"; return false; }
  raw = raw.trim();
  if ((raw[0] === '"' && raw[raw.length - 1] === '"') || (raw[0] === "'" && raw[raw.length - 1] === "'")) raw = raw.slice(1, -1);
  let cred = null;
  try { cred = JSON.parse(raw); } catch (_) {}
  if (!cred) { try { cred = JSON.parse(Buffer.from(raw, "base64").toString("utf8")); } catch (_) {} }
  if (!cred) { initReason = "env_not_json"; return false; }
  if (typeof cred === "string") { try { cred = JSON.parse(cred); } catch (_) { initReason = "env_not_json"; return false; } }
  if (!cred.private_key || !cred.client_email) { initReason = "env_missing_fields"; return false; }
  cred.private_key = String(cred.private_key).replace(/\\n/g, "\n");
  try { admin.initializeApp({ credential: admin.credential.cert(cred) }); }
  catch (e) { initReason = "bad_key"; console.error("init failed", e && e.message); return false; }
  return true;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!init()) return res.status(501).json({ error: "not_configured", reason: initReason });
  try {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
    if (!m) return res.status(401).json({ error: "no_token" });
    let caller;
    try { caller = await admin.auth().verifyIdToken(m[1]); } catch (_) { return res.status(401).json({ error: "bad_token" }); }
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { uid, newPassword } = body;
    if (!uid || typeof newPassword !== "string" || newPassword.length < 6) return res.status(400).json({ error: "bad_request" });
    const db = admin.firestore();
    const [meSnap, tgtSnap] = await Promise.all([db.doc("users/" + caller.uid).get(), db.doc("users/" + uid).get()]);
    const me = meSnap.exists ? meSnap.data() : null, tgt = tgtSnap.exists ? tgtSnap.data() : null;
    if (!me || me.role !== "admin" || me.status !== "approved") return res.status(403).json({ error: "not_admin" });
    if (!tgt || !me.churchCode || me.churchCode !== tgt.churchCode) return res.status(403).json({ error: "other_church" });
    if (tgt.role === "admin" && uid !== caller.uid) return res.status(403).json({ error: "target_is_admin" });
    await admin.auth().updateUser(uid, { password: newPassword });
    try { await admin.auth().revokeRefreshTokens(uid); } catch (_) {}
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("set-password failed", e && e.code, e && e.message);
    return res.status(500).json({ error: "server_error" });
  }
};
