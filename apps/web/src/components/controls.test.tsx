import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Button } from './Button';
import { RadioCard } from './RadioCard';
import { RatingScale } from './RatingScale';
import { SegmentedTabs } from './SegmentedTabs';
import { Switch } from './Switch';
import { ToggleChip } from './ToggleChip';

describe('Button', () => {
  it('renders a primary button by default and handles clicks', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Tiếp tục</Button>);
    const button = screen.getByRole('button', { name: 'Tiếp tục' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button.className).toMatch(/primary/);
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it.each(['secondary', 'danger', 'ghost'] as const)('supports the %s variant', (variant) => {
    render(<Button variant={variant}>X</Button>);
    expect(screen.getByRole('button').className).toMatch(new RegExp(variant));
  });

  it('TC-UI-016 is disabled and busy while loading, so a double tap sends once', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Lưu
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Lưu' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.dblClick(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('can span the full width and submit a form', () => {
    render(
      <Button type="submit" fullWidth>
        Gửi
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('type', 'submit');
    expect(button.className).toMatch(/fullWidth/);
  });
});

describe('ToggleChip', () => {
  function Harness() {
    const [on, setOn] = useState(false);
    return (
      <ToggleChip pressed={on} onPressedChange={setOn}>
        Trứng
      </ToggleChip>
    );
  }

  it('TC-UI-010 toggles with click, Space and Enter and exposes aria-pressed', async () => {
    render(<Harness />);
    const chip = screen.getByRole('button', { name: 'Trứng' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    chip.focus();
    await userEvent.keyboard(' ');
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await userEvent.keyboard('{Enter}');
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses the danger tone for avoided foods', () => {
    render(
      <ToggleChip pressed tone="danger" onPressedChange={() => {}}>
        Trứng
      </ToggleChip>,
    );
    expect(screen.getByRole('button').className).toMatch(/danger/);
  });
});

describe('Switch', () => {
  it('exposes role=switch with aria-checked and toggles', async () => {
    const onChange = vi.fn();
    render(<Switch label="Bé sinh non" checked={false} onCheckedChange={onChange} />);
    const control = screen.getByRole('switch', { name: 'Bé sinh non' });
    expect(control).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('turns off when checked', async () => {
    const onChange = vi.fn();
    render(<Switch label="Chưa ăn 7 ngày" checked onCheckedChange={onChange} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

describe('RadioCard', () => {
  it('is a real radio input grouped by name, with title and description', async () => {
    const onChange = vi.fn();
    render(
      <>
        <RadioCard
          name="health"
          value="normal"
          title="Bình thường"
          description="Thực đơn đầy đủ"
          checked
          onChange={onChange}
        />
        <RadioCard name="health" value="sick" title="Đang ốm" checked={false} onChange={onChange} />
      </>,
    );
    expect(screen.getByRole('radio', { name: /Bình thường/ })).toBeChecked();
    expect(screen.getByText('Thực đơn đầy đủ')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Đang ốm/ }));
    expect(onChange).toHaveBeenCalledWith('sick');
  });
});

describe('RatingScale', () => {
  it('offers 1–5 with spoken labels and marks the chosen one', async () => {
    const onChange = vi.fn();
    render(
      <RatingScale
        label="Bé có thích món này?"
        value={3}
        onChange={onChange}
        lowLabel="Từ chối"
        highLabel="Rất thích"
      />,
    );
    expect(screen.getByRole('group', { name: 'Bé có thích món này?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3 trên 5' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: '1 trên 5' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByText('Từ chối')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '5 trên 5' }));
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('works with nothing selected yet', () => {
    render(<RatingScale label="x" value={null} onChange={() => {}} lowLabel="a" highLabel="b" />);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('aria-pressed', 'false');
    }
  });
});

describe('SegmentedTabs', () => {
  const tabs = [
    { id: '1', label: '6–7 tháng' },
    { id: '2', label: '8–9 tháng' },
    { id: '3', label: '10–12 tháng' },
  ];

  function Harness() {
    const [value, setValue] = useState('2');
    return <SegmentedTabs label="Theo độ tuổi" tabs={tabs} value={value} onChange={setValue} />;
  }

  it('TC-UI-010 is a tablist; arrows move and wrap, Home/End jump', async () => {
    render(<Harness />);
    expect(screen.getByRole('tablist', { name: 'Theo độ tuổi' })).toBeInTheDocument();
    const selected = () => screen.getByRole('tab', { selected: true });
    expect(selected()).toHaveTextContent('8–9 tháng');
    expect(selected()).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: '6–7 tháng' })).toHaveAttribute('tabindex', '-1');

    selected().focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(selected()).toHaveTextContent('10–12 tháng');
    expect(selected()).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(selected()).toHaveTextContent('6–7 tháng');
    await userEvent.keyboard('{ArrowLeft}');
    expect(selected()).toHaveTextContent('10–12 tháng');
    await userEvent.keyboard('{Home}');
    expect(selected()).toHaveTextContent('6–7 tháng');
    await userEvent.keyboard('{End}');
    expect(selected()).toHaveTextContent('10–12 tháng');
    await userEvent.keyboard('a');
    expect(selected()).toHaveTextContent('10–12 tháng');
  });

  it('selects by click', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('tab', { name: '6–7 tháng' }));
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('6–7 tháng');
  });
});
