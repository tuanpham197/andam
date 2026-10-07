import type { ReactNode } from 'react';

export function Disclaimer({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: '2px 4px 0',
        fontSize: '0.75rem',
        lineHeight: 1.5,
        color: 'var(--text-muted)',
      }}
    >
      {children}
    </p>
  );
}
