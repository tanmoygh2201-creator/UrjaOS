import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getReportData, buildReportCsv, isReportPeriodKey } from "@/lib/energy/report-service";

const querySchema = z.object({
  systemId: z.string().uuid("A valid systemId is required."),
  period: z
    .string()
    .refine(isReportPeriodKey, "Period must be daily, weekly, or monthly."),
});

/**
 * GET /api/reports/export?systemId=…&period=daily|weekly|monthly
 *
 * Streams the same report the /reports page renders as a CSV download.
 * Authentication and system ownership are verified before any data leaves
 * the server (RLS defense-in-depth: the explicit user_id filter mirrors the
 * other API routes).
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    systemId: params.get("systemId"),
    period: params.get("period"),
  });
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
    .select("*")
    .eq("id", parsed.data.systemId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!system) {
    return NextResponse.json({ error: "System not found." }, { status: 404 });
  }

  const report = await getReportData(
    supabase,
    system as never,
    parsed.data.period
  );

  const csv = buildReportCsv(report);
  const filename = `urjaos-${report.system.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-${parsed.data.period}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
