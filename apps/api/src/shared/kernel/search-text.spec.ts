import { toSearchText } from './search-text.js';

describe('toSearchText (TC-ING-001/002)', () => {
  it.each([
    ['Cà rốt', 'ca rot'],
    ['CÀ RỐT', 'ca rot'],
    ['Cà rốt'.normalize('NFD'), 'ca rot'],
    ['Đậu Hà Lan', 'dau ha lan'],
    ['đđĐĐ', 'dddd'],
    ['  Rau   ngót\t', 'rau ngot'],
    ['Cháo cá hồi – rau ngót', 'chao ca hoi – rau ngot'],
    ['Bơ', 'bo'],
    ['', ''],
  ])('%j → %j', (input, expected) => {
    expect(toSearchText(input)).toBe(expected);
  });

  it('removes zero-width characters that sneak in from copy/paste', () => {
    expect(toSearchText('ca\u200Brot')).toBe('carot');
  });
});
