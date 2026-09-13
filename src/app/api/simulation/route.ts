import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resetSystemData, getDataSummary } from "@/lib/simulation/service";

const systemIdSchema = z.string().uuid("A valid systemId is required.");

/** GET /api/simulation?systemId=… → data summary for the system. */
export async function GET(request: Request) {
  const systemId = new URL(request.url).searchParams.get("systemId");
  const parsed = systemIdSchema.safeParse(systemId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: system } = await supabase
    .from("energy_systems")
    .select("id")
    .eq("id", parsed.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!system) {
    return NextResponse.json({ error: "System not found." }, { status: 404 });
  }

  const summary = await getDataSummary(supabase, parsed.data);
  return NextResponse.json(summary);
}

/** DELETE /api/simulation?systemId=… → reset all reading data for a system. */
export async function DELETE(request: Request) {
  const systemId = new URL(request.url).searchParams.get("systemId");
  const parsed = systemIdSchema.safeParse(systemId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: system } = await supabase
    .from("energy_systems")
    .select("id")
    .eq("id", parsed.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!system) {
    return NextResponse.json({ error: "System not found." }, { status: 404 });
  }

  const result = await resetSystemData(supabase, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: "Reset failed." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
