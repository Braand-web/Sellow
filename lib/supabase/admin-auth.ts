import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function getSellowAdminContext() {
  const authClient = await getSupabaseServerClient();
  const { data } = authClient ? await authClient.auth.getUser() : { data: { user: null } };
  const allowedEmails = (process.env.SELLOW_ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (!data.user?.email || !allowedEmails.includes(data.user.email.toLowerCase())) return null;
  return { user: data.user, admin: getSupabaseAdmin() };
}
