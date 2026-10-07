import { NavLink } from 'react-router';
import { vi } from '../strings/vi';
import styles from './BottomNav.module.css';
import { Icon, type IconName } from './Icon';

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: vi.nav.today, icon: 'home' },
  { to: '/week', label: vi.nav.week, icon: 'calendar' },
  { to: '/dishes', label: vi.nav.dishes, icon: 'bowl' },
  { to: '/journal', label: vi.nav.journal, icon: 'journal' },
  { to: '/profile', label: vi.nav.profile, icon: 'profile' },
];

export function BottomNav() {
  return (
    <nav aria-label={vi.nav.label} className={styles.nav}>
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.to === '/'} className={styles.link}>
          <Icon name={tab.icon} size={22} />
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
