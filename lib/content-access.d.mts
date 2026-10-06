export type ContentEntitlement = {
  buyerId: string;
  productId: string;
  active: boolean;
  orderStatus: string;
};

export function canAccessCourseContent(input: {
  userId: string | null;
  creatorId: string;
  courseId: string;
  productKind: string;
  entitlements: ContentEntitlement[];
  membershipCourseIds: string[];
}): boolean;
