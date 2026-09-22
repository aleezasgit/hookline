import { fetchVideoBlob } from "./fetch";
import { captureFrames } from "./frames";
import { api, ApiError } from "@/lib/api";

const MAX = 2;
const seen = new Set<string>();
export const failedLocally = new Set<string>(); // frame capture failed in this browser
const waiting: { id: string; url: string; onDone: () => void }[] = [];
let running = 0;

export function enqueueReview(id: string, url: string, onDone: () => void) {
  if (seen.has(id)) return;
  seen.add(id);
  waiting.push({ id, url, onDone });
  pump();
}

export function retryReview(id: string, url: string, onDone: () => void) {
  seen.delete(id);
  failedLocally.delete(id);
  enqueueReview(id, url, onDone);
}

// H2: while the tab is hidden, let jobs already running finish (aborting them would
// leave the server-side "pending" claim to expire the slow way, via the 2 minute
// stale-review reap), but don't start new ones. A visibilitychange listener resumes
// the queue as soon as the tab is visible again.
function hidden() {
  return typeof document !== "undefined" && document.hidden;
}

function pump() {
  while (running < MAX && waiting.length && !hidden()) {
    const job = waiting.shift()!;
    running++;
    (async () => {
      try {
        const frames = await captureFrames(await fetchVideoBlob(job.url));
        await api.post(`/api/generations/${job.id}/review`, { frames });
      } catch (e) {
        // ApiError: server already marked it failed, or 409 means another tab is on it.
        // Anything else: frames could not be captured in this browser.
        if (!(e instanceof ApiError)) failedLocally.add(job.id);
      }
      finally { running--; job.onDone(); pump(); }
    })();
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) pump();
  });
}
