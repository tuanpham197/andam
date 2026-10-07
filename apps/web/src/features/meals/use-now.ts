import { useEffect, useState } from 'react';

/**
 * The current time, refreshed often enough that a countdown rounded to the minute is never
 * more than a few seconds late, and the day rolls over at midnight without a reload.
 */
export function useNow(intervalMs = 15_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
