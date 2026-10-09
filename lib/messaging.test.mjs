import assert from "node:assert/strict";
import test from "node:test";
import {
  attachmentError,
  customerBadge,
  customerSummary,
  fileMatches,
  messageError,
  messageNotification,
} from "./messaging.mjs";
test("messages enforce text, file limits and attachment-only messages", () => {
  assert.equal(messageError("", ["one"]), null);
  assert.ok(messageError("", []));
  assert.ok(messageError("x".repeat(4001), []));
  assert.equal(messageError("x".repeat(4000), []), null);
  assert.ok(messageError("x", ["a", "a"]));
  assert.ok(messageError("x", ["a", "b", "c", "d"]));
  for (const mimeType of [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ])
    assert.equal(
      attachmentError({ name: "fichier", size: 10485760, mimeType }),
      null,
    );
  for (const f of [
    { name: "../escape", size: 10, mimeType: "image/png" },
    { name: "file", size: 0, mimeType: "image/png" },
    { name: "file", size: 10485761, mimeType: "image/png" },
    { name: "file", size: 10, mimeType: "text/html" },
  ])
    assert.ok(attachmentError(f));
});
test("files are checked against actual signature, not the claimed MIME", () => {
  assert.equal(
    fileMatches(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), "image/png"),
    true,
  );
  assert.equal(
    fileMatches(new Uint8Array([255, 216, 255]), "image/jpeg"),
    true,
  );
  assert.equal(
    fileMatches(new TextEncoder().encode("RIFFxxxxWEBP"), "image/webp"),
    true,
  );
  assert.equal(
    fileMatches(new TextEncoder().encode("%PDF-1.4"), "application/pdf"),
    true,
  );
  for (const mime of [
    "image/png",
    "image/jpeg",
    "image/webp",
    "application/pdf",
  ])
    assert.equal(
      fileMatches(new TextEncoder().encode("<script>private</script>"), mime),
      false,
    );
});
test("only confirmed paid orders count, with separate free/refund/demo history", () => {
  const orders = [
    ...["pending", "failed", "canceled"].map((status) => ({
      id: status,
      status,
      amount: 20,
    })),
    {
      id: "paid",
      status: "paid",
      amount: 50,
      productId: "p",
      productTitle: "Cours",
      createdAt: "2026-10-01",
      currency: "XOF",
    },
    { id: "expired", status: "paid", amount: 10 },
    { id: "free", status: "paid", amount: 0 },
    { id: "refunded", status: "refunded", amount: 10 },
    { id: "demo", status: "paid_demo", amount: 10 },
    { id: "demo-canceled", status: "canceled_demo", amount: 10 },
  ];
  const summary = customerSummary(orders);
  assert.equal(summary.paidCount, 2);
  assert.equal(summary.freeCount, 1);
  assert.equal(summary.refundCount, 1);
  assert.equal(summary.demoCount, 2);
  assert.equal(summary.purchases.length, 6);
  assert.equal(customerBadge(summary), "Client · 2 achats confirmés");
  assert.equal(
    customerBadge(customerSummary([{ status: "paid_demo", amount: 20 }])),
    "Prospect",
  );
  assert.equal(
    customerBadge(customerSummary([{ status: "paid", amount: 20 }])),
    "Client · 1 achat confirmé",
  );
});
test("notification carries only a discussion link, no private content", () => {
  const id = "20000000-0000-4000-8000-000000000001";
  const email = messageNotification(id);
  assert.match(email.text, new RegExp(`/messages/${id}`));
  assert.doesNotMatch(
    email.text,
    /message_body|attachment|token|saspay|commande/i,
  );
  assert.throws(() => messageNotification("../escape"));
});
