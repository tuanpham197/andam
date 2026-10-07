const PENDING = new Set(['planned', 'prepared']);

/** BR-30: the earliest meal of the day not yet eaten, refused or skipped. */
export function nextMealId(
  meals: readonly { id: string; time: string; status: string }[],
): string | null {
  const pending = meals
    .filter((m) => PENDING.has(m.status))
    .sort((a, b) => a.time.localeCompare(b.time));
  return pending[0]?.id ?? null;
}
