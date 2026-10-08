import { render, screen } from '@testing-library/react';
import { AlertBox } from './AlertBox';
import { Chip } from './Chip';
import { Disclaimer } from './Disclaimer';
import { Icon, type IconName } from './Icon';
import { Stepper } from './Stepper';
import { TextField } from './TextField';

describe('AlertBox', () => {
  it('announces dangers immediately with role=alert', () => {
    render(
      <AlertBox tone="danger" title="Tránh">
        Chứa trứng
      </AlertBox>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Tránh Chứa trứng');
  });

  it.each(['warn', 'info'] as const)('uses role=status for %s', (tone) => {
    render(<AlertBox tone={tone}>Lần đầu thử</AlertBox>);
    expect(screen.getByRole('status')).toHaveTextContent('Lần đầu thử');
  });
});

describe('Chip', () => {
  it.each(['neutral', 'primary', 'danger', 'warn'] as const)('renders the %s tone', (tone) => {
    render(<Chip tone={tone}>Tránh: Trứng</Chip>);
    expect(screen.getByText('Tránh: Trứng').className).toMatch(new RegExp(tone));
  });

  it('defaults to neutral', () => {
    render(<Chip>Kết cấu</Chip>);
    expect(screen.getByText('Kết cấu').className).toMatch(/neutral/);
  });
});

describe('Disclaimer', () => {
  it('renders the note', () => {
    render(<Disclaimer>Không thay thế tư vấn y tế.</Disclaimer>);
    expect(screen.getByText('Không thay thế tư vấn y tế.')).toBeInTheDocument();
  });
});

describe('Icon', () => {
  const names: IconName[] = [
    'back',
    'close',
    'chevronDown',
    'chevronRight',
    'check',
    'clock',
    'swap',
    'home',
    'calendar',
    'bowl',
    'journal',
    'profile',
    'pulse',
    'eye',
    'eyeOff',
    'search',
    'phone',
    'plus',
    'edit',
    'trash',
  ];

  it.each(names)('draws %s as a decorative 24px-grid SVG', (name) => {
    const { container } = render(<Icon name={name} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect(svg.querySelectorAll('path, rect, circle').length).toBeGreaterThan(0);
  });

  it('accepts a size', () => {
    const { container } = render(<Icon name="home" size={16} />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '16');
  });
});

describe('Stepper', () => {
  it('shows x/y and exposes progress to assistive tech', () => {
    render(<Stepper current={3} total={5} />);
    const bar = screen.getByRole('progressbar', { name: 'Bước 3 trên 5' });
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuemax', '5');
    expect(screen.getByText('3/5')).toBeInTheDocument();
  });
});

describe('TextField', () => {
  it('links the label, hint and error to the input', () => {
    render(
      <TextField label="Email" hint="Dùng để đăng nhập" error="Email không hợp lệ" name="email" />,
    );
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Dùng để đăng nhập Email không hợp lệ');
  });

  it('is valid without an error', () => {
    render(<TextField label="Tên bé" />);
    expect(screen.getByLabelText('Tên bé')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText('Tên bé')).not.toHaveAccessibleDescription();
  });
});
