import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { vi } from '../../strings/vi';
import { formatAge } from './format';
import { useActiveChild, useChildChoice } from './guards';
import styles from './ChildSwitcher.module.css';

const t = vi.switcher;

/** G04: shown next to the child's name only when the user belongs to more than one child. */
export function ChildSwitcher() {
  const child = useActiveChild();
  const { children, select } = useChildChoice();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (children.length < 2) return null;
  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label={t.open(child.name)}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Icon name="chevronDown" size={20} />
      </button>
      {open && (
        <div className={styles.backdrop} onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={styles.sheet}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.head}>
              <h2 id={titleId} className={styles.title}>
                {t.title}
              </h2>
              <button
                ref={closeButton}
                type="button"
                className={styles.close}
                aria-label={t.close}
                onClick={() => setOpen(false)}
              >
                <Icon name="close" />
              </button>
            </div>
            <ul className={styles.list}>
              {children.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={styles.option}
                    aria-current={c.id === child.id ? 'true' : undefined}
                    onClick={() => {
                      select(c.id);
                      setOpen(false);
                    }}
                  >
                    <span className={styles.avatar} aria-hidden="true">
                      {c.initials}
                    </span>
                    <span className={styles.text}>
                      <span className={styles.name}>{c.name}</span>
                      <span className={styles.meta}>
                        {formatAge(c.age)} · {t.role[c.role]}
                      </span>
                    </span>
                    {c.id === child.id && <Icon name="check" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
