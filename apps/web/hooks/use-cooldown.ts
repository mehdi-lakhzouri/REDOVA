'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** A UI countdown based on elapsed time; server rate limits remain authoritative. */
export function useCooldown() {
  const deadline = useRef(0);
  const [remaining, setRemaining] = useState(0);
  const active = remaining > 0;
  const start = useCallback((seconds: number) => {
    const duration = Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 0;
    deadline.current = Date.now() + duration * 1000;
    setRemaining(duration);
  }, []);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  return { remaining, start };
}
