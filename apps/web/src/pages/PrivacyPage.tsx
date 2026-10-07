import styles from '../app/layout.module.css';
import { ScreenHeader } from '../components/ScreenHeader';
import { vi } from '../strings/vi';

export function PrivacyPage() {
  return (
    <>
      <ScreenHeader title="" back="/register" />
      <h1 className={styles.title}>{vi.privacy.title}</h1>
      {vi.privacy.sections.map((section) => (
        <section key={section.heading} className={styles.card}>
          <h2 style={{ fontSize: '1.0625rem', marginBottom: 6 }}>{section.heading}</h2>
          <p style={{ margin: 0, color: 'var(--text-2)' }}>{section.body}</p>
        </section>
      ))}
    </>
  );
}
