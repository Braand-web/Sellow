import test from "node:test";
import assert from "node:assert/strict";
import { canAccessCourseContent } from "./content-access.mjs";

const base = {
  userId: "buyer-a",
  creatorId: "creator",
  courseId: "course-a",
  productKind: "course",
  entitlements: [],
  membershipCourseIds: [],
};

test("a buyer can read a directly purchased course", () => {
  assert.equal(canAccessCourseContent({
    ...base,
    entitlements: [{ buyerId: "buyer-a", productId: "course-a", active: true, orderStatus: "paid_demo" }],
  }), true);
});

test("content stays hidden from another buyer and from canceled orders", () => {
  assert.equal(canAccessCourseContent({
    ...base,
    entitlements: [{ buyerId: "buyer-b", productId: "course-a", active: true, orderStatus: "paid_demo" }],
  }), false);
  assert.equal(canAccessCourseContent({
    ...base,
    entitlements: [{ buyerId: "buyer-a", productId: "course-a", active: true, orderStatus: "canceled_demo" }],
  }), false);
});

test("an active membership grants its included course and cancellation revokes that path", () => {
  const membership = { buyerId: "buyer-a", productId: "membership-a", active: true, orderStatus: "paid_demo" };
  const included = { ...base, entitlements: [membership], membershipCourseIds: ["course-a"] };
  assert.equal(canAccessCourseContent(included), true);
  assert.equal(canAccessCourseContent({
    ...included,
    entitlements: [{ ...membership, orderStatus: "canceled_demo" }],
  }), false);
});

test("creators can manage their own content without a purchase", () => {
  assert.equal(canAccessCourseContent({ ...base, userId: "creator", creatorId: "creator" }), true);
});
