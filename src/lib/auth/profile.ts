import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/types/energy";

export type ProfileRecord = Pick<
  Profile,
  "id" | "user_id" | "full_name" | "phone" | "role"
>;

const PROFILE_COLUMNS = "id, user_id, full_name, phone, role";

/**
 * Loads the user's profile row, creating it if it does not exist yet.
 *
 * The signup trigger (supabase/migrations) normally creates profiles, but if
 * a user logged in before the migration ran, the row would be missing — this
 * helper self-heals that case instead of crashing.
 *
 * Throws when the row cannot be read or created (caller shows a safe message).
 */
export async function ensureProfile(
  supabase: SupabaseClient,
  userId: string,
  metadata?: Record<string, unknown> | null
): Promise<ProfileRecord> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("PROFILE_UNAVAILABLE");
  }
  if (data) {
    return data as ProfileRecord;
  }

  const fullName =
    typeof metadata?.full_name === "string" ? metadata.full_name : "";

  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .insert({ user_id: userId, full_name: fullName })
    .select(PROFILE_COLUMNS)
    .single();

  if (insertError || !created) {
    throw new Error("PROFILE_UNAVAILABLE");
  }
  return created as ProfileRecord;
}
