import Link from "next/link";
import { Zap } from "lucide-react";

/** Shared header for the auth pages (login / register). */
export function AuthHeader() {
  return (
    <header className="absolute top-0 left-0 z-10 w-full">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Zap className="size-4.5" aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold tracking-tight">
            Urja<span className="text-primary">OS</span>
          </span>
        </Link>
      </div>
    </header>
  );
}
