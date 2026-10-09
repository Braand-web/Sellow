import type { SellerCustomerSummary } from "./types";
export const MESSAGE_LIMIT: number;
export const ATTACHMENT_LIMIT: number;
export const FILE_LIMIT: number;
export const MESSAGE_MIME_TYPES: string[];
export const UUID: RegExp;
export function attachmentError(file: {
  name: string;
  size: number;
  mimeType?: string;
  type?: string;
}): string | null;
export function messageError(
  body: string,
  attachments: string[],
): string | null;
export function fileMatches(bytes: Uint8Array, mimeType: string): boolean;
export function customerSummary(
  orders: Record<string, unknown>[],
): SellerCustomerSummary;
export function customerBadge(summary: SellerCustomerSummary): string;
export function messageNotification(
  id: string,
  appUrl?: string,
): { subject: string; text: string };
