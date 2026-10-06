const activeStatuses = new Set(["paid_demo", "paid"]);

export function canAccessCourseContent({ userId, creatorId, courseId, productKind, entitlements, membershipCourseIds, now = Date.now() }) {
  if (!userId) return false;
  if (creatorId === userId) return true;
  const notExpired = (entitlement) => !entitlement.endsAt || new Date(entitlement.endsAt).getTime() > now;
  const activeFor = (productId) => entitlements.some((entitlement) =>
    entitlement.buyerId === userId &&
    entitlement.productId === productId &&
    entitlement.active &&
    notExpired(entitlement) &&
    activeStatuses.has(entitlement.orderStatus),
  );
  if (activeFor(courseId)) return true;
  return productKind === "course" &&
    membershipCourseIds.includes(courseId) &&
    entitlements.some((entitlement) =>
      entitlement.buyerId === userId &&
      entitlement.active &&
      notExpired(entitlement) &&
      activeStatuses.has(entitlement.orderStatus),
    );
}
