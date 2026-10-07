import test from "node:test";
import assert from "node:assert/strict";
import { resolveProductFileDownload } from "./product-file-access.mjs";
function mockAdmin(overrides = {}) {
  const records = {
    orders: [{ id: "order", product_id: "product", buyer_id: "buyer", status: "paid" }],
    entitlements: [{ id: "entitlement", order_id: "order", product_id: "product", buyer_id: "buyer", active: true }],
    product_files: [{ id: "file", product_id: "product", storage_path: "private/guide.pdf", file_name: "guide.pdf" }, { id: "foreign", product_id: "other", storage_path: "private/other.pdf" }],
    products: [{ id: "product", file_path: "legacy/guide.pdf", file_name: "guide.pdf" }], ...overrides,
  };
  return { from(table) {
    let rows = records[table];
    return { select() { return this; }, eq(key, value) { rows = rows.filter((row) => row[key] === value); return this; }, in(key, values) { rows = rows.filter((row) => values.includes(row[key])); return this; }, maybeSingle() { return Promise.resolve({ data: rows[0] ?? null }); } };
  } };
}
const input = { orderId: "order", userId: "buyer", fileId: "file" };
test("entitled buyer receives the selected file, including legacy compatibility", async () => {
  assert.equal((await resolveProductFileDownload(mockAdmin(), input)).path, "private/guide.pdf");
  assert.equal((await resolveProductFileDownload(mockAdmin(), { ...input, fileId: null })).path, "legacy/guide.pdf");
});
test("visitor, other buyer, unpaid order, inactive or expired access cannot download", async () => {
  assert.equal((await resolveProductFileDownload(mockAdmin(), { ...input, userId: null })).status, 401);
  assert.equal((await resolveProductFileDownload(mockAdmin(), { ...input, userId: "other" })).status, 404);
  assert.equal((await resolveProductFileDownload(mockAdmin({ orders: [{ id: "order", product_id: "product", buyer_id: "buyer", status: "pending" }] }), input)).status, 404);
  assert.equal((await resolveProductFileDownload(mockAdmin({ entitlements: [] }), input)).status, 403);
  const expired = { id: "entitlement", order_id: "order", product_id: "product", buyer_id: "buyer", active: true, ends_at: "2020-01-01" };
  assert.equal((await resolveProductFileDownload(mockAdmin({ entitlements: [expired] }), input)).status, 403);
});
test("a file from a different product never receives a signed download", async () => {
  const result = await resolveProductFileDownload(mockAdmin(), { ...input, fileId: "foreign" });
  assert.equal(result.status, 404); assert.equal(result.path, undefined);
});
