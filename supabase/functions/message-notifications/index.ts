import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { messageNotification } from "../../../lib/messaging.mjs";
import { emailRetry } from "../../../lib/purchase-email.mjs";
function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++)
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  if (
    !sameSecret(
      request.headers.get("x-worker-secret") ?? "",
      Deno.env.get("EMAIL_WORKER_SECRET") ?? "",
    )
  )
    return new Response(null, { status: 403 });
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return new Response(null, { status: 503 });
  const body = await request.json().catch(() => null);
  if (body?.action === "check-delivery") {
    if (
      typeof body.testId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(body.testId)
    )
      return new Response(null, { status: 400 });
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `sellow-message-check/${body.testId}`,
        },
        body: JSON.stringify({
          from: "Sellow <messages@notifications.sellow.fun>",
          to: ["delivered@resend.dev"],
          subject: "Test des alertes de messages Sellow",
          text: "Ce message vérifie la configuration des alertes Sellow. Il ne contient aucune discussion.",
        }),
      });
      const payload = await r.json().catch(() => null);
      return Response.json(
        {
          ready: r.ok && typeof payload?.id === "string",
          deliveryStatus: r.status,
        },
        { status: r.ok ? 200 : 502 },
      );
    } catch {
      return Response.json({ ready: false }, { status: 502 });
    }
  }
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: jobs, error } = await admin.rpc("lease_message_notifications", {
    p_limit: 5,
  });
  if (error) return new Response(null, { status: 503 });
  let sent = 0;
  for (const job of jobs ?? []) {
    try {
      const { data: recipient, error: prepareError } = await admin.rpc(
        "prepare_message_notification",
        { p_job: job.id, p_lease: job.locked_until },
      );
      if (prepareError) throw new Error("prepare_failed");
      if (!recipient) continue;
      const message = messageNotification(
        recipient.conversation_id,
        Deno.env.get("SELLOW_APP_URL") ?? "https://sellow.fun",
      );
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `sellow-message/${job.id}`,
        },
        body: JSON.stringify({
          from: "Sellow <messages@notifications.sellow.fun>",
          to: [recipient.email],
          ...message,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || typeof payload?.id !== "string")
        throw new Error("send_failed");
      const { error: saveError } = await admin.rpc(
        "finish_message_notification",
        { p_job: job.id, p_lease: job.locked_until, p_provider: payload.id },
      );
      if (saveError) throw new Error("save_failed");
      sent++;
    } catch {
      const retry = emailRetry(job.attempts);
      await admin
        .from("message_notification_outbox")
        .update({
          status: retry.status,
          next_attempt_at: retry.nextAttemptAt,
          locked_until: null,
          last_error: "L’alerte n’a pas pu être envoyée.",
        })
        .eq("id", job.id)
        .eq("locked_until", job.locked_until)
        .eq("status", "processing");
      console.warn("messaging.email_attempt_failed", {
        jobId: job.id,
        attempt: job.attempts,
      });
    }
  }
  // Upload tokens can live for two hours. Only abandoned files older than a day
  // are removed, and committed attachments are never part of this cleanup.
  const { data: abandoned } = await admin
    .from("message_attachments")
    .select("id,storage_path")
    .is("message_id", null)
    .lt("created_at", new Date(Date.now() - 86400000).toISOString())
    .limit(20);
  if (abandoned?.length) {
    const { error: removeError } = await admin.storage
      .from("message-files")
      .remove(abandoned.map((file) => file.storage_path));
    if (!removeError)
      await admin
        .from("message_attachments")
        .delete()
        .in(
          "id",
          abandoned.map((file) => file.id),
        )
        .is("message_id", null);
  }
  return Response.json({ processed: jobs?.length ?? 0, sent });
});
