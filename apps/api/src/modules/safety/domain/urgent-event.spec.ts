import type { SafetyMeal } from './model.js';
import { UrgentEvent, notYetPaused, urgentSuspectIds } from './urgent-event.js';

const OPENED = new Date('2026-09-24T05:00:00Z');

const event = () =>
  UrgentEvent.open({ id: 'e-1', childId: 'c-1', mealId: 'm-1', openedAt: OPENED, actorId: 'u-1' });

describe('UrgentEvent (UC-10)', () => {
  it('opens without a medical contact yet', () => {
    expect(event()).toMatchObject({
      id: 'e-1',
      childId: 'c-1',
      mealId: 'm-1',
      openedAt: OPENED,
      contactedMedicalAt: null,
      actorId: 'u-1',
    });
  });

  it('TC-URG-004 keeps the first "đã liên hệ y tế" time', () => {
    const e = event();
    e.markContactedMedical(new Date('2026-09-24T05:03:00Z'));
    e.markContactedMedical(new Date('2026-09-24T05:09:00Z'));
    expect(e.contactedMedicalAt).toEqual(new Date('2026-09-24T05:03:00Z'));
  });

  it('restores a stored event as a copy', () => {
    const state = {
      id: 'e-2',
      childId: 'c-1',
      mealId: null,
      openedAt: OPENED,
      contactedMedicalAt: OPENED,
      actorId: null,
    };
    const restored = UrgentEvent.restore(state);
    restored.markContactedMedical(new Date());
    expect(restored.contactedMedicalAt).toEqual(OPENED);
    expect(restored.mealId).toBeNull();
  });
});

describe('urgentSuspectIds (BR-41)', () => {
  const meal: SafetyMeal = {
    id: 'm-1',
    childId: 'c-1',
    ingredients: [
      { id: 'ing_gao', allergenTags: [] },
      { id: 'ing_ca_hoi', allergenTags: ['fish'] },
      { id: 'ing_rau_ngot', allergenTags: [] },
    ],
    firstTryIds: ['ing_rau_ngot', 'ing_ca_hoi'],
  };

  it('TC-URG-001 pauses the first tries and the allergens, each once', () => {
    expect(urgentSuspectIds(meal)).toEqual(['ing_rau_ngot', 'ing_ca_hoi']);
  });

  it('pauses the allergens even when the child had eaten everything before', () => {
    expect(urgentSuspectIds({ ...meal, firstTryIds: [] })).toEqual(['ing_ca_hoi']);
  });

  it('TC-URG-002 pauses nothing without a meal', () => {
    expect(urgentSuspectIds(null)).toEqual([]);
  });
});

describe('notYetPaused', () => {
  it('TC-URG-003 skips foods already paused and repeated ids', () => {
    expect(notYetPaused(['a', 'b', 'a', 'c'], new Set(['b']))).toEqual(['a', 'c']);
  });
});
