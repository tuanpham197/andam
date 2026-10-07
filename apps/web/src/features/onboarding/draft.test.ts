import { act, renderHook } from '@testing-library/react';
import { EMPTY_DRAFT, clearDraft, loadDraft, useOnboardingDraft } from './draft';

beforeEach(() => sessionStorage.clear());

describe('onboarding draft (TC-UI-018)', () => {
  it('starts empty', () => {
    expect(loadDraft()).toEqual(EMPTY_DRAFT);
  });

  it('keeps what was typed across remounts and reloads', () => {
    const first = renderHook(() => useOnboardingDraft());
    act(() => first.result.current.update({ name: 'Na', avoidAllergens: ['egg'] }));
    first.unmount();

    const second = renderHook(() => useOnboardingDraft());
    expect(second.result.current.draft).toMatchObject({ name: 'Na', avoidAllergens: ['egg'] });
    expect(loadDraft().name).toBe('Na');
  });

  it('is forgotten once the profile is created', () => {
    const { result } = renderHook(() => useOnboardingDraft());
    act(() => result.current.update({ name: 'Na' }));
    clearDraft();
    expect(loadDraft()).toEqual(EMPTY_DRAFT);
  });

  it('survives a corrupted or foreign value in storage', () => {
    sessionStorage.setItem('onboarding-draft', '{not json');
    expect(loadDraft()).toEqual(EMPTY_DRAFT);
    sessionStorage.setItem('onboarding-draft', '42');
    expect(loadDraft()).toEqual(EMPTY_DRAFT);
  });

  it('keeps working when storage is unavailable (private mode)', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const { result } = renderHook(() => useOnboardingDraft());
    act(() => result.current.update({ name: 'Na' }));
    expect(result.current.draft.name).toBe('Na');
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
