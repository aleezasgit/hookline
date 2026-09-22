import { useState } from "react";
import { CLIENT } from "@/config/client";

// H6: shared by every polling SWR hook. Counts consecutive failures so the
// caller's refreshInterval can slow down after a few in a row, and exposes
// "reconnecting" so the page can show a subtle hint instead of pretending
// everything is fine while requests keep failing.
export function useReconnectStreak() {
  const [errorStreak, setErrorStreak] = useState(0);
  return {
    errorStreak,
    reconnecting: errorStreak >= CLIENT.reconnectAfterErrors,
    onSuccess: () => setErrorStreak(0),
    onError: () => setErrorStreak((n) => n + 1),
    pollMs: errorStreak >= CLIENT.reconnectAfterErrors ? CLIENT.reconnectPollMs : CLIENT.pollMs,
  };
}
