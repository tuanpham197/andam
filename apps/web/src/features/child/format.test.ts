import { STAGES } from '../../test/fixtures';
import { formatAge, stageRange, textureLabel } from './format';

describe('formatAge', () => {
  it.each([
    [{ months: 8, days: 12, corrected: false }, '8 tháng 12 ngày'],
    [{ months: 7, days: 22, corrected: true }, '7 tháng 22 ngày (hiệu chỉnh)'],
    [{ months: 6, days: 0, corrected: false }, '6 tháng'],
    [{ months: 0, days: 5, corrected: false }, '5 ngày'],
    [{ months: 0, days: 0, corrected: false }, 'Mới sinh'],
  ])('%j → %s', (age, text) => {
    expect(formatAge(age)).toBe(text);
  });
});

describe('stageRange', () => {
  it.each([
    [0, '6–7 tháng'],
    [1, '8–9 tháng'],
    [2, '10–12 tháng'],
    [3, '12–24 tháng'],
  ])('stage index %i → %s', (i, text) => {
    expect(stageRange(STAGES[i]!)).toBe(text);
  });
});

describe('textureLabel', () => {
  it.each([
    ['puree_smooth', 'Nghiền mịn'],
    ['mashed', 'Nghiền'],
    ['lumpy', 'Lợn cợn'],
    ['minced_soft', 'Cắt nhỏ, mềm'],
    ['family', 'Món gia đình'],
    ['unknown', 'unknown'],
  ])('%s → %s', (texture, label) => {
    expect(textureLabel(texture)).toBe(label);
  });
});
