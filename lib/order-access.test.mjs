import assert from "node:assert/strict";
import test from "node:test";
import { orderBelongsToBuyer } from "./order-access.mjs";

test("an order is accessible only to its authenticated buyer", () => {
  assert.equal(orderBelongsToBuyer("buyer-1", "buyer-1"), true);
  assert.equal(orderBelongsToBuyer("buyer-1", "buyer-2"), false);
  assert.equal(orderBelongsToBuyer(null, "buyer-1"), false);
  assert.equal(orderBelongsToBuyer("", ""), false);
});
