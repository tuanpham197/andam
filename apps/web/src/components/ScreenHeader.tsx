import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { vi } from '../strings/vi';
import { Icon } from './Icon';
import styles from './ScreenHeader.module.css';

export function ScreenHeader({
  title,
  back,
  close,
  trailing,
  level = 2,
}: {
  title: string;
  /** 1 when the header title is the screen's only title (NFR-013: one h1 per screen). */
  level?: 1 | 2;
  back?: string;
  close?: string;
  trailing?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      {back && (
        <Link to={back} aria-label={vi.common.back} className={styles.nav}>
          <Icon name="back" />
        </Link>
      )}
      {level === 1 ? (
        <h1 className={styles.title}>{title}</h1>
      ) : (
        <h2 className={styles.title}>{title}</h2>
      )}
      {trailing}
      {close && (
        <Link to={close} aria-label={vi.common.close} className={styles.nav}>
          <Icon name="close" />
        </Link>
      )}
    </header>
  );
}
