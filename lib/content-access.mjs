const activeStatuses = new Set(["paid_demo", "paid"]);

export function canAccessCourseContent({ userId, creatorId, courseId, productKind, entitlements, membershipCourseIds }) {
  if (!userId) return false;
  if (creatorId === userId) return true;
  const activeFor = (productId) => entitlements.some((entitlement) =>
    entitlement.buyerId === userId &&
    entitlement.productId === productId &&
    entitlement.active &&
    activeStatuses.has(entitlement.orderStatus),
  );
  if (activeFor(courseId)) return true;
  return productKind === "course" &&
    membershipCourseIds.includes(courseId) &&
    entitlements.some((entitlement) =>
      entitlement.buyerId === userId &&
      entitlement.active &&
      activeStatuses.has(entitlement.orderStatus),
    );
}
