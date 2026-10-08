import { clearDraft, loadDraft, saveDraft } from './session-draft';

describe('session drafts (TC-LOG-017)', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('keeps a draft for the tab and clears it', () => {
    expect(loadDraft('k')).toBeNull();
    saveDraft('k', { amount: 'half' });
    expect(loadDraft('k')).toEqual({ amount: 'half' });
    clearDraft('k');
    expect(loadDraft('k')).toBeNull();
  });

  it('starts empty from a corrupted draft', () => {
    sessionStorage.setItem('k', '{not json');
    expect(loadDraft('k')).toBeNull();
  });

  it('keeps working when storage is blocked (private mode, full quota)', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);
    expect(() => saveDraft('k', 1)).not.toThrow();
    expect(loadDraft('k')).toBeNull();
    expect(() => clearDraft('k')).not.toThrow();
  });
});
