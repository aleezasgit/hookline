"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TopNav } from "@/components/shell/TopNav";

// H6: a visitor whose connection drops gets an explicit heads-up instead of just
// watching every button silently start failing.
function useOfflineToast() {
  useEffect(() => {
    const onOffline = () => toast.error("You're offline.");
    const onOnline = () => toast.success("Back online.");
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  useOfflineToast();
  return (
    <TooltipProvider>
      <div className="flex min-h-full flex-col">
        <TopNav />
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
      <Toaster theme="dark" position="bottom-right" />
    </TooltipProvider>
  );
}
