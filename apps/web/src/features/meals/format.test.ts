import {
  avoidSummary,
  countdown,
  dayHeading,
  daySummary,
  firstTryNames,
  formatQty,
  isSnackSlot,
  mealInstant,
  slotLabel,
  todayInVietnam,
} from './format';

describe('todayInVietnam', () => {
  it('uses the calendar day in Vietnam, not the device or UTC day', () => {
    expect(todayInVietnam(new Date('2026-09-24T16:59:59Z'))).toBe('2026-09-24');
    // 00:00 in Hà Nội is still the previous day in UTC.
    expect(todayInVietnam(new Date('2026-09-24T17:00:00Z'))).toBe('2026-09-25');
  });
});

describe('dayHeading', () => {
  it.each([
    ['2026-09-24', 'Thứ Năm, 24 tháng 9'],
    ['2026-09-27', 'Chủ Nhật, 27 tháng 9'],
    ['2026-09-28', 'Thứ Hai, 28 tháng 9'],
    ['2027-01-01', 'Thứ Sáu, 1 tháng 1'],
    ['2028-02-29', 'Thứ Ba, 29 tháng 2'],
  ])('%s → %s', (date, heading) => {
    expect(dayHeading(date)).toBe(heading);
  });
});

describe('countdown (TC-NXT-004: rounded up to the minute)', () => {
  const at = (iso: string) => new Date(iso);
  const lunch = mealInstant('2026-09-24', '11:00');

  it('pins meal times to Vietnam time', () => {
    expect(lunch.toISOString()).toBe('2026-09-24T04:00:00.000Z');
  });

  it.each([
    ['2026-09-24T04:00:00Z', 'đã tới giờ'],
    ['2026-09-24T04:30:00Z', 'đã tới giờ'],
    ['2026-09-24T03:59:01Z', 'còn 1 phút'],
    ['2026-09-24T03:59:00Z', 'còn 1 phút'],
    ['2026-09-24T03:58:59Z', 'còn 2 phút'],
    ['2026-09-24T03:15:00Z', 'còn 45 phút'],
    ['2026-09-24T02:00:00Z', 'còn 2 giờ'],
    ['2026-09-24T02:40:00Z', 'còn 1 giờ 20 phút'],
  ])('now %s → %s', (now, text) => {
    expect(countdown(lunch, at(now))).toBe(text);
  });
});

describe('slots', () => {
  it('names every slot the way the design does', () => {
    expect(
      (
        ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'extra_snack'] as const
      ).map(slotLabel),
    ).toEqual(['Sáng', 'Phụ sáng', 'Trưa', 'Xế', 'Tối', 'Phụ tối']);
  });

  it('tells snacks from main meals', () => {
    expect(isSnackSlot('afternoon_snack')).toBe(true);
    expect(isSnackSlot('dinner')).toBe(false);
  });

  it('summarises the day, counting slots still without a dish', () => {
    expect(daySummary(['breakfast', 'lunch', 'afternoon_snack', 'dinner'])).toBe(
      '3 bữa chính · 1 bữa phụ',
    );
    expect(daySummary(['breakfast', 'lunch'])).toBe('2 bữa chính');
    expect(daySummary([])).toBe('');
  });
});

describe('formatQty', () => {
  it('uses the Vietnamese decimal comma', () => {
    expect(formatQty(20, 'g')).toBe('20 g');
    expect(formatQty(5, 'ml')).toBe('5 ml');
    expect(formatQty(0.5, 'g')).toBe('0,5 g');
  });
});

describe('avoidSummary', () => {
  it('keeps the chip short: two names, then a count', () => {
    expect(avoidSummary(['Trứng'])).toBe('Trứng');
    expect(avoidSummary(['Trứng', 'Cá'])).toBe('Trứng, Cá');
    expect(avoidSummary(['Trứng', 'Cá', 'Mướp đắng', 'Tôm'])).toBe('Trứng, Cá +2');
  });
});

describe('firstTryNames', () => {
  it('lists the foods in lower case, as part of a sentence', () => {
    expect(firstTryNames(['Rau ngót', 'Cá hồi'])).toBe('rau ngót, cá hồi');
  });
});
