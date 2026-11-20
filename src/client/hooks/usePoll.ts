import { useEffect, useRef } from "react";

/** Calls `tick` every `ms` while the page is open and visible. */
export function usePoll(
  tick: () => Promise<unknown> | void,
  ms: number,
  enabled = true,
) {
  const saved = useRef(tick);
  saved.current = tick;
  useEffect(() => {
    if (!enabled) return;
    let busy = false;
    const id = setInterval(async () => {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      try {
        await saved.current();
      } catch {
        // The next tick tries again.
      } finally {
        busy = false;
      }
    }, ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
}
