import type { SupabaseClient } from "@supabase/supabase-js";
import { canAccessCourseContent } from "@/lib/content-access.mjs";

export async function canAccessProductContent(admin: SupabaseClient, productId: string, userId: string) {
  const { data: product } = await admin.from("products").select("id, creator_id, product_kind").eq("id", productId).maybeSingle();
  if (!product) return { allowed: false, owner: false, product: null };
  const owner = product.creator_id === userId;
  if (owner) return { allowed: true, owner, product };
  const { data: links } = product.product_kind === "course"
    ? await admin.from("membership_courses").select("membership_id, course_id").eq("course_id", productId)
    : { data: [] };
  const membershipCourseIds = (links ?? []).map((link) => String(link.course_id));
  const productIds = [...new Set([productId, ...(links ?? []).map((link) => String(link.membership_id))])];
  const { data: rows } = await admin.from("entitlements")
    .select("buyer_id, product_id, order_id, active")
    .eq("buyer_id", userId)
    .eq("active", true)
    .in("product_id", productIds);
  const orderIds = [...new Set((rows ?? []).map((row) => String(row.order_id)))];
  const { data: orderRows } = orderIds.length
    ? await admin.from("orders").select("id, status").in("id", orderIds)
    : { data: [] };
  const statuses = new Map((orderRows ?? []).map((order) => [String(order.id), String(order.status)]));
  const entitlements = (rows ?? []).map((row) => ({
    buyerId: String(row.buyer_id),
    productId: String(row.product_id),
    active: Boolean(row.active),
    orderStatus: statuses.get(String(row.order_id)) ?? "",
  }));
  const allowed = canAccessCourseContent({
    userId,
    creatorId: String(product.creator_id),
    courseId: productId,
    productKind: String(product.product_kind),
    entitlements,
    membershipCourseIds,
  });
  return { allowed, owner, product };
}
