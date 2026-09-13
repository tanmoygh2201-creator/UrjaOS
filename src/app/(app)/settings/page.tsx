import { ProfileForm } from "@/components/settings/profile-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("user_id", user!.id)
    .single();

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your UrjaOS profile and account details.
        </p>
      </div>

      <ProfileForm
        defaultValues={{
          fullName: profile?.full_name ?? "",
          phone: profile?.phone ?? "",
        }}
        email={user?.email ?? ""}
      />
    </div>
  );
}
