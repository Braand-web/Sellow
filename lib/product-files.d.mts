import type { ProductFile } from "./types";
export function validateProductPricing(price: number, compareAtPrice: number | undefined, currency: string): void;
export function normalizeProductFiles(value: unknown): ProductFile[];
export function productFileStoragePath(creatorId: string, productId: string, file: ProductFile): string;
export function productFilesFromRows(rows: Record<string, unknown>[]): ProductFile[];
export function changeFavorite(current: string[], productId: string, enabled?: boolean): string[];
