import styles from '../../app/layout.module.css';
import { ScreenHeader } from '../../components/ScreenHeader';
import { vi } from '../../strings/vi';

/** Screens whose real version arrives in a later phase (P4–P6). */
export function Placeholder({ title, back }: { title: string; back?: string }) {
  return (
    <>
      {back && <ScreenHeader title="" back={back} />}
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.intro}>{vi.common.comingSoon}</p>
    </>
  );
}
