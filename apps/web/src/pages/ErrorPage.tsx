import { useEffect } from 'react';
import { useRouteError } from 'react-router';
import styles from '../app/layout.module.css';
import { Button } from '../components/Button';
import { vi } from '../strings/vi';

/** A screen that crashed while rendering: say so plainly and offer a way out (P7). */
export function ErrorPage() {
  const error = useRouteError();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        <h1 className={styles.title}>{vi.crash.title}</h1>
        <p className={styles.intro}>{vi.crash.body}</p>
        <div className={styles.form}>
          <Button onClick={() => window.location.reload()}>{vi.crash.reload}</Button>
          {/* A full page load: the crashed tree is not reused. */}
          <a href="/" className={styles.secondaryLink}>
            {vi.crash.home}
          </a>
        </div>
      </main>
    </div>
  );
}
