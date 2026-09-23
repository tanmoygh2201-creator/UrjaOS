import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CopilotChat } from "@/components/copilot/copilot-chat";
import { createClient } from "@/lib/supabase/server";
import { resolveProviderConfig } from "@/lib/ai/provider";
import { DemoSystemButton } from "@/components/systems/demo-system-button";

export const metadata = { title: "AI Copilot" };

interface CopilotPageProps {
  searchParams: Promise<{ system?: string }>;
}

export default async function CopilotPage({ searchParams }: CopilotPageProps) {
  const { system: requestedSystem } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: systems } = await supabase
    .from("energy_systems")
    .select("id, name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const systemList = systems ?? [];
  if (systemList.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          AI Energy Copilot
        </h1>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <div>
              <h2 className="text-lg font-semibold">No energy systems yet.</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                The Copilot answers from your system&apos;s real data. Create a
                system or load a demo to explore.
              </p>
            </div>
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Button asChild>
                <Link href="/systems/new">Create a system</Link>
              </Button>
              <DemoSystemButton scenario="factory-alpha-tou" label="Try the TOU demo" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const configured = resolveProviderConfig() !== null;
  const selectedId =
    systemList.find((s) => s.id === requestedSystem)?.id ?? systemList[0].id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          AI Energy Copilot
        </h1>
        <p className="mt-1 text-muted-foreground">
          A full AI assistant — general chat plus analysis grounded in your
          system&apos;s own data, never invented.
        </p>
      </div>

      {!configured ? (
        <Card>
          <CardContent className="flex items-start gap-3 py-4">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-energy-amber" aria-hidden="true" />
            <div className="text-sm">
              <p className="font-medium">AI is not configured on this server yet.</p>
              <p className="mt-1 text-muted-foreground">
                The chat below works once <code className="rounded bg-muted px-1 py-0.5 text-xs">AI_API_KEY</code>{" "}
                is set in <code className="rounded bg-muted px-1 py-0.5 text-xs">.env.local</code>{" "}
                (an OpenAI-compatible key; the key stays server-side and is
                never sent to the browser). You can still explore the interface.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ask your energy Copilot</CardTitle>
          <CardDescription>
            Every answer is grounded in the selected system&apos;s readings,
            forecasts, and optimization plans.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CopilotChat systems={systemList} initialSystemId={selectedId} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-start gap-3 py-4">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            The Copilot answers only from your data block — if a number is not
            in it, it says so. Savings are estimates valued at your tariff, not
            guarantees; optimization outputs are recommendations, never device
            commands. Your API key stays on the server.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
