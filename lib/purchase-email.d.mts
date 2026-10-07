export function receiptMessage(order: { id: string; amount: number; currency: string; product_kind: string; product_title: string }, appUrl?: string): { subject: string; html: string; text: string };
export function emailRetry(attempts: number, now?: number): { status: string; nextAttemptAt: string };
