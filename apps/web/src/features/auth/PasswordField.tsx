import { useState, type InputHTMLAttributes } from 'react';
import { Icon } from '../../components/Icon';
import { TextField } from '../../components/TextField';
import { vi } from '../../strings/vi';

export function PasswordField(
  props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
    label: string;
    hint?: string;
    error?: string;
  },
) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <TextField {...props} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        aria-label={visible ? vi.auth.hidePassword : vi.auth.showPassword}
        style={{
          position: 'absolute',
          right: 2,
          top: 27,
          width: 44,
          height: 44,
          border: 'none',
          background: 'transparent',
          color: 'var(--text-muted)',
          cursor: 'pointer',
        }}
      >
        <Icon name={visible ? 'eyeOff' : 'eye'} />
      </button>
    </div>
  );
}
