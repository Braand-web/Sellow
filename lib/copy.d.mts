export const brandCopy: { headline: string; description: string; title: string; explore: string; createShop: string };
export const paymentCopy: { continue: string; confirmed: string; fees: string; reference: string; introduction: string; privacy: string; unavailable: string; verificationUnavailable: string; pending: string; unconfirmed: string; demo: string };
export const membershipCopy: { renewal: string; cancellation: string };
export const commissionCopy: string;
export function checkoutConfirmation(kind: string, demo?: boolean): { title: string; description: string };
export function publicErrorMessage(error: unknown, fallback?: string): string;
