import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { emailRetry, receiptMessage } from "../../../lib/purchase-email.mjs";

function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  if (!sameSecret(request.headers.get("x-worker-secret") ?? "", Deno.env.get("EMAIL_WORKER_SECRET") ?? "")) return new Response(null, { status: 403 });
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return new Response(null, { status: 503 });
  const body = await request.json().catch(() => null) as { action?: string; testId?: string } | null;
  // A protected delivery probe checks the receipt sender without inventing a
  // purchase or sending a receipt to a customer. The destination is fixed.
  if (body?.action === "check-delivery") {
    if (!body.testId || !/^[0-9a-f-]{36}$/i.test(body.testId)) return new Response(null, { status: 400 });
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST", signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `sellow-email-check/${body.testId}` },
        body: JSON.stringify({ from: Deno.env.get("RESEND_RECEIPT_FROM") ?? "Sellow <achats@notifications.sellow.fun>", to: ["delivered@resend.dev"], subject: "Test de livraison des reçus Sellow", text: "Ce message vérifie la configuration des e-mails Sellow. Il ne correspond à aucun achat." }),
      });
      const payload = await response.json().catch(() => null);
      const ready = response.ok && typeof payload?.id === "string";
      return Response.json({ ready, deliveryStatus: response.status }, { status: ready ? 200 : 502 });
    } catch {
      return Response.json({ ready: false }, { status: 502 });
    }
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date().toISOString();
  await admin.from("sellow_rate_limits").delete().lt("expires_at", now);
  await admin.from("guest_checkout_sessions").delete().lt("expires_at", now);
  await admin.from("email_outbox").update({ status: "failed", last_error: "L’envoi n’a pas abouti après plusieurs tentatives." }).eq("status", "processing").gte("attempts", 6).lt("locked_until", now);
  // Five requests with a 15-second timeout fit within the Edge runtime budget.
  // Leases protect concurrent cron invocations and retries.
  const { data: jobs, error } = await admin.rpc("lease_purchase_emails", { p_limit: 5 });
  if (error) return new Response(null, { status: 503 });
  let sent = 0;
  for (const job of jobs ?? []) {
    try {
      const { data: order, error: orderError } = await admin.from("orders").select("id,amount,currency,product_title,product_kind,status").eq("id", job.order_id).single();
      if (orderError || !order || order.status !== "paid") throw new Error("order_unavailable");
      const message = receiptMessage(order, Deno.env.get("SELLOW_APP_URL") ?? "https://sellow.fun");
      const response = await fetch("https://api.resend.com/emails", { method: "POST", signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `sellow-receipt/${job.id}/${job.revision}` }, body: JSON.stringify({ from: Deno.env.get("RESEND_RECEIPT_FROM") ?? "Sellow <achats@notifications.sellow.fun>", to: [job.recipient], ...message }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || typeof payload?.id !== "string") throw new Error(`send_${response.status}`);
      const { error: saveError } = await admin.from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: payload.id, locked_until: null, last_error: null }).eq("id", job.id).eq("locked_until", job.locked_until).eq("revision", job.revision);
      if (saveError) throw new Error("save_failed");
      sent++;
    } catch {
      const retry = emailRetry(job.attempts);
      await admin.from("email_outbox").update({ status: retry.status, next_attempt_at: retry.nextAttemptAt, locked_until: null, last_error: "Le reçu n’a pas pu être envoyé. Une nouvelle tentative est prévue." }).eq("id", job.id).eq("locked_until", job.locked_until).eq("revision", job.revision);
      console.warn("email.receipt_attempt_failed", { jobId: job.id, attempt: job.attempts });
    }
  }
  return Response.json({ processed: jobs?.length ?? 0, sent });
});
