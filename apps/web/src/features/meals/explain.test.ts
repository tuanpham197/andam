import { eatenTag, exclusionParts, proteinTag, reasonText, repeatNote } from './explain';

describe('reasonText (engine codes → Vietnamese)', () => {
  const base = { protein: 'beef' as const, otherMains: [], fasterByMin: 0 };

  it.each([
    ['NOT_USED_7D', 'Chưa dùng trong 7 ngày qua'],
    ['LIKED', 'Bé từng ăn hết hoặc rất thích món này'],
    ['FOUR_GROUPS', 'Đủ 4 nhóm chất'],
    ['LEAST_USED_PROTEIN', 'Nguồn đạm bé ít ăn trong tuần'],
    ['NEW_INGREDIENT', 'Có thực phẩm mới để bé làm quen'],
  ] as const)('%s', (code, text) => {
    expect(reasonText(code, base)).toBe(text);
  });

  it('FASTER says by how much', () => {
    expect(reasonText('FASTER', { ...base, fasterByMin: 10 })).toBe('Nhanh hơn 10 phút');
  });

  it('DIFFERENT_PROTEIN names the other main meals, like the design', () => {
    expect(
      reasonText('DIFFERENT_PROTEIN', {
        ...base,
        otherMains: [{ slot: 'dinner', protein: 'chicken' }],
      }),
    ).toBe('Đạm bò — khác nguồn đạm bữa tối (gà)');
    expect(
      reasonText('DIFFERENT_PROTEIN', {
        ...base,
        protein: 'pork',
        otherMains: [
          { slot: 'breakfast', protein: 'fish' },
          { slot: 'dinner', protein: 'chicken' },
        ],
      }),
    ).toBe('Đạm heo — khác nguồn đạm bữa sáng (cá) và bữa tối (gà)');
  });

  it('DIFFERENT_PROTEIN when no other main meal has a protein', () => {
    expect(reasonText('DIFFERENT_PROTEIN', base)).toBe('Đạm bò — chưa có trong các bữa khác');
  });

  it('DIFFERENT_PROTEIN for a dish without a main protein falls back to a plain sentence', () => {
    expect(reasonText('DIFFERENT_PROTEIN', { ...base, protein: null })).toBe(
      'Đạm khác — chưa có trong các bữa khác',
    );
  });
});

describe('exclusionParts', () => {
  const counts = { allergen: 3, avoid: 0, paused: 1, age: 2, refused: 1, sick_new: 0 };

  it('reads like the design, in the safety order, skipping zero counts', () => {
    expect(exclusionParts(counts, ['Trứng'])).toEqual([
      '3 chứa trứng (cần tránh)',
      '1 có thực phẩm đang tạm dừng',
      '2 chưa hợp độ tuổi',
      '1 bé từng từ chối',
    ]);
  });

  it('adds "món" after the count for the library', () => {
    expect(exclusionParts({ ...counts, paused: 0, refused: 0 }, ['Trứng', 'Cá'], 'món')).toEqual([
      '3 món chứa trứng, cá (cần tránh)',
      '2 món chưa hợp độ tuổi',
    ]);
  });

  it('covers the remaining reasons, and allergens without a named list', () => {
    expect(
      exclusionParts({ allergen: 1, avoid: 2, paused: 0, age: 0, refused: 0, sick_new: 1 }, []),
    ).toEqual([
      '1 chứa chất gây dị ứng (cần tránh)',
      '2 có thực phẩm bé không ăn',
      '1 có thực phẩm mới khi bé đang mệt',
    ]);
  });
});

describe('repeatNote (BR-21)', () => {
  it('explains a past or upcoming repeat, or says nothing', () => {
    expect(repeatNote(-4)).toBe(
      'Đã dùng 4 ngày trước — hệ thống nới cửa sổ chống lặp từ 7 xuống 3 ngày vì kho món còn ít.',
    );
    expect(repeatNote(5)).toBe(
      'Đã có trong thực đơn 5 ngày tới — hệ thống nới cửa sổ chống lặp từ 7 xuống 3 ngày vì kho món còn ít.',
    );
    expect(repeatNote(null)).toBeNull();
  });
});

describe('proteinTag', () => {
  it('names the protein of a main dish, or says snack', () => {
    expect(proteinTag('main', 'fish')).toBe('Đạm · Cá');
    expect(proteinTag('main', null)).toBe('Món chính');
    expect(proteinTag('snack', null)).toBe('Bữa phụ');
  });
});

describe('eatenTag (FR-049)', () => {
  it.each([
    [0, 'breakfast', 'Ăn sáng nay'],
    [0, 'lunch', 'Ăn trưa nay'],
    [0, 'dinner', 'Ăn tối nay'],
    [0, 'afternoon_snack', 'Ăn hôm nay'],
    [1, 'lunch', 'Ăn hôm qua'],
    [2, 'lunch', 'Ăn 2 ngày trước'],
  ] as const)('%i day(s) ago at %s → %s', (daysAgo, slot, text) => {
    expect(eatenTag({ daysAgo, slot })).toBe(text);
  });
});
