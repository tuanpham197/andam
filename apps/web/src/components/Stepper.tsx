export function Stepper({ current, total }: { current: number; total: number }) {
  return (
    <div
      role="progressbar"
      aria-label={`Bước ${current} trên ${total}`}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current}
      style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)' }}
    >
      {current}/{total}
    </div>
  );
}
