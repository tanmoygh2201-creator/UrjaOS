"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation/auth";
import { profileSchema } from "@/lib/validation/profile";
import { ensureProfile } from "@/lib/auth/profile";

export interface ProfileFormState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
}

export async function updateProfileAction(
  _prevState: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to update your profile." };
  }

  try {
    // Self-heals a missing profile row (e.g. signed up before migration ran).
    await ensureProfile(supabase, user.id, user.user_metadata);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: parsed.data.fullName,
        phone: parsed.data.phone || null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (error) {
      return { error: "Could not save your profile. Please try again." };
    }

    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return { success: "Profile updated." };
  } catch {
    // ensureProfile throws a user-safe message if the row is unavailable.
    return {
      error:
        "Your profile could not be loaded. If you just signed up, confirm the database migration has run.",
    };
  }
}
