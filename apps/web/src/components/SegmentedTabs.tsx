import { useRef, type KeyboardEvent } from 'react';
import styles from './SegmentedTabs.module.css';

interface Tab {
  id: string;
  label: string;
}

/** WAI-ARIA tabs with automatic activation: arrows, Home and End move the selection. */
export function SegmentedTabs({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: Tab[];
  value: string;
  onChange: (id: string) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent, index: number) {
    const last = tabs.length - 1;
    const next = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onChange(tabs[next]!.id);
    refs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className={styles.list}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(el) => {
            refs.current[index] = el;
          }}
          type="button"
          role="tab"
          aria-selected={tab.id === value}
          tabIndex={tab.id === value ? 0 : -1}
          className={styles.tab}
          onClick={() => onChange(tab.id)}
          onKeyDown={(e) => onKeyDown(e, index)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
