import { Link } from 'react-router';
import styles from '../app/layout.module.css';
import { vi } from '../strings/vi';

export function NotFoundPage() {
  return (
    <>
      <h1 className={styles.title}>{vi.notFound.title}</h1>
      <p className={styles.intro}>{vi.notFound.body}</p>
      <Link to="/">{vi.notFound.home}</Link>
    </>
  );
}
