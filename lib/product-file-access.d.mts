import type { SupabaseClient } from "@supabase/supabase-js";
export function resolveProductFileDownload(admin: SupabaseClient, input: { orderId: string; userId: string | null; fileId?: string | null; now?: Date }): Promise<{ status: number; error: string; path?: never; fileName?: never } | { path: string; fileName?: string; status?: never; error?: never }>;
