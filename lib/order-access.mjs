export function orderBelongsToBuyer(orderBuyerId, authenticatedBuyerId) {
  return typeof orderBuyerId === "string" && orderBuyerId.length > 0 && orderBuyerId === authenticatedBuyerId;
}
