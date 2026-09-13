import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateSimulationSchema } from "@/lib/validation/simulation";
import { generateAndPersist } from "@/lib/simulation/service";
import { defaultDailyTarget } from "@/lib/energy/targets";

const requestSchema = generateSimulationSchema.extend({
  systemId: z.string().uuid("A valid systemId is required."),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed.", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  // Verify ownership before writing anything.
  const { data: system } = await supabase
    .from("energy_systems")
    .select("*")
    .eq("id", parsed.data.systemId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!system) {
    return NextResponse.json({ error: "System not found." }, { status: 404 });
  }

  const result = await generateAndPersist(supabase, {
    system: system as never,
    dailyKwhTarget:
      parsed.data.dailyKwhTarget ?? defaultDailyTarget(system.system_type),
    days: parsed.data.days,
    seed: 20260914,
    cloudiness: parsed.data.cloudiness,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: "Simulation failed.", detail: result.error },
      { status: 500 }
    );
  }

  return NextResponse.json({
    written: result.written,
    startDate: result.startDate,
    endDate: result.endDate,
  });
}
