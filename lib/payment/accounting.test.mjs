import assert from "node:assert/strict";
import test from "node:test";
import {
  addOneMonth,
  amountToStoredUnits,
  calculateAvailableBalance,
  calculateCommission,
  commissionRateForLifetimeSales,
  currencyFractionDigits,
} from "./accounting.mjs";

test("commission tiers change only at the cumulative 5,000 USD threshold", () => {
  assert.equal(commissionRateForLifetimeSales(4999.99), 0.1);
  assert.equal(commissionRateForLifetimeSales(5000), 0.05);
  assert.equal(calculateCommission(100, "EUR", 0.1), 1000);
  assert.equal(calculateCommission(100, "EUR", 0.05), 500);
});

test("stored amounts preserve the catalogue's hundredth-unit convention for XAF and XOF", () => {
  assert.equal(currencyFractionDigits("XAF"), 0);
  assert.equal(currencyFractionDigits("XOF"), 0);
  assert.equal(amountToStoredUnits(1500, "XAF"), 150000);
  assert.equal(amountToStoredUnits(1500.5, "EUR"), 150050);
});

test("available balance reserves pending and paid requests but releases rejected requests", () => {
  const paidOrders = [
    { currency: "XOF", creator_net_amount: 250000 },
    { currency: "EUR", creator_net_amount: 30000 },
  ];
  const requests = [
    { currency: "XOF", amount: 50000, status: "requested" },
    { currency: "XOF", amount: 25000, status: "paid" },
    { currency: "XOF", amount: 10000, status: "rejected" },
  ];
  assert.equal(calculateAvailableBalance(paidOrders, requests, "XOF"), 175000);
});

test("membership renewal adds one calendar month and clamps month ends", () => {
  assert.equal(addOneMonth("2026-01-31T12:00:00.000Z"), "2026-02-28T12:00:00.000Z");
  assert.equal(addOneMonth("2024-01-31T12:00:00.000Z"), "2024-02-29T12:00:00.000Z");
});
