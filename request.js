// POST /api/request
// Cloudflare Pages Function. No build step: Pages bundles everything in /functions on deploy.
//
// Bindings and secrets (see README):
//   UPLOADS                R2 bucket binding (private bucket for reference files)
//   SUPABASE_URL           https://<project>.supabase.co
//   SUPABASE_SECRET_KEY    secret / service_role key (server only, never in the browser)
//   RESEND_API_KEY         Resend API key
//   FROM_EMAIL             e.g. "ClearNote Sheets <hello@yourdomain.com>" (verified Resend domain)
//   NOTIFY_EMAIL           where new requests are sent
//   SITE_URL               e.g. https://clearnotesheets.com (used for the logo in emails)

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXT = ["pdf", "mp3", "wav", "m4a", "mid", "midi", "musicxml", "mxl", "xml", "png", "jpg", "jpeg"];
const LIMITS = { name: 120, email: 200, piece: 200, instrument: 120, notes: 4000 };

export async function onRequestPost({ request, env }) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "The form data couldn’t be read. Reload the page and try again." }, 400);
  }

  // Honeypot: pretend success so bots don't learn anything
  if (str(form.get("company"))) return json({ ok: true });

  const data = {
    name: str(form.get("name")),
    email: str(form.get("email")).toLowerCase(),
    piece: str(form.get("piece")),
    instrument: str(form.get("instrument")),
    deadline: str(form.get("deadline")) || null,
    notes: str(form.get("notes")) || null,
  };

  const problem = validate(data);
  if (problem) return json({ ok: false, error: problem }, 422);

  // ---- optional reference file → R2 ----
  const file = form.get("file");
  let fileKey = null;
  let fileName = null;
  if (file && typeof file === "object" && file.size > 0) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return json({ ok: false, error: "That file type isn’t supported. Send a PDF, audio, MIDI, MusicXML or image file." }, 422);
    }
    if (file.size > MAX_BYTES) {
      return json({ ok: false, error: "That file is over 20 MB. Send a shorter clip or a link in the details instead." }, 413);
    }
    const now = new Date();
    fileName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
    fileKey = `requests/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}/${fileName}`;
    try {
      await env.UPLOADS.put(fileKey, file.stream(), {
        httpMetadata: { contentType: file.type || "application/octet-stream" },
        customMetadata: { email: data.email, originalName: file.name },
      });
    } catch (err) {
      console.error("R2 upload failed", err);
      return json({ ok: false, error: "Your file couldn’t be uploaded. Try again, or send the request without it." }, 502);
    }
  }

  // ---- save in Supabase ----
  let saved;
  try {
    saved = await supabaseInsert(env, "requests", { ...data, file_key: fileKey, file_name: fileName });
  } catch (err) {
    console.error("Supabase insert failed", err);
    return json({ ok: false, error: "Your request couldn’t be saved. Try again in a minute." }, 502);
  }

  // ---- emails via Resend (don't fail the request if email has a hiccup) ----
  const results = await Promise.allSettled([
    sendEmail(env, {
      to: env.NOTIFY_EMAIL,
      reply_to: data.email,
      subject: `New request: ${data.piece} (${data.instrument})`,
      html: ownerEmail(env, data, fileKey),
    }),
    sendEmail(env, {
      to: data.email,
      subject: "We got your sheet music request",
      html: customerEmail(env, data),
    }),
  ]);
  results.filter((r) => r.status === "rejected").forEach((r) => console.error("Resend failed", r.reason));

  return json({ ok: true, id: saved?.id ?? null });
}

export function onRequest() {
  return json({ ok: false, error: "Use POST." }, 405, { Allow: "POST" });
}

// ---------------------------------------------------------------------------

function validate(d) {
  if (!d.name) return "Add your name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return "Enter an email address like name@example.com.";
  if (!d.piece) return "Add the piece you want written.";
  if (!d.instrument) return "Add the instrument or ensemble.";
  for (const [k, max] of Object.entries(LIMITS)) {
    if (d[k] && d[k].length > max) return `The ${k} field is too long (max ${max} characters).`;
  }
  if (d.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(d.deadline)) return "Pick the date from the calendar.";
  return null;
}

async function supabaseInsert(env, table, row) {
  const key = env.SUPABASE_SECRET_KEY;
  const headers = {
    apikey: key,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  // Legacy service_role keys are JWTs and also go in Authorization; new sb_secret_ keys don't.
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers,
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return rows[0];
}

async function sendEmail(env, { to, subject, html, reply_to }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.FROM_EMAIL, to: [to], subject, html, ...(reply_to ? { reply_to } : {}) }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

// ---- email templates ---------------------------------------------------------

function shell(env, inner) {
  const logo = `${env.SITE_URL}/assets/logo/clearnote-note-email.png`;
  return `<!doctype html><html><body style="margin:0;background:#F5F2EC;font-family:Montserrat,Helvetica,Arial,sans-serif;color:#172B3B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F2EC;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:20px;padding:32px">
<tr><td style="padding-bottom:20px">
<img src="${logo}" width="40" height="48" alt="" style="display:inline-block;vertical-align:middle">
<span style="font-size:22px;font-weight:300;vertical-align:middle;margin-left:8px">ClearNote Sheets</span>
</td></tr>
<tr><td style="font-size:15px;line-height:1.6">${inner}</td></tr>
</table></td></tr></table></body></html>`;
}

function rows(d) {
  const r = (label, value) => value
    ? `<tr><td style="padding:6px 16px 6px 0;color:#4F6577;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:6px 0">${esc(value)}</td></tr>`
    : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:15px">
${r("Piece", d.piece)}${r("Instrument", d.instrument)}${r("Needed by", d.deadline)}${r("Details", d.notes)}</table>`;
}

function customerEmail(env, d) {
  return shell(env, `<p>Hi ${esc(d.name)},</p>
<p>Thanks for your request. Here’s what we received:</p>
${rows(d)}
<p>We’ll reply with a quote and delivery date soon. Just reply to this email if you want to add anything.</p>`);
}

function ownerEmail(env, d, fileKey) {
  return shell(env, `<p><strong>${esc(d.name)}</strong> &lt;${esc(d.email)}&gt; sent a request.</p>
${rows(d)}
${fileKey ? `<p style="color:#4F6577">Reference file in R2: <code>${esc(fileKey)}</code></p>` : ""}
<p style="color:#4F6577">Reply to this email to answer them directly.</p>`);
}

// ---- helpers ---------------------------------------------------------------

function str(v) {
  return typeof v === "string" ? v.trim() : "";
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });
}
