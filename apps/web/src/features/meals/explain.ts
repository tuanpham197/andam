import type {
  DayProteinDto,
  ExclusionCountsDto,
  LastEatenDto,
  MealDishDtoMainProtein,
  SwapCandidateDtoReasonsItem,
} from '@appandam/api-client';
import { vi } from '../../strings/vi';
import { slotLabel } from './format';

const lower = (text: string) => text.toLocaleLowerCase('vi');
const t = vi.swap;

/** Why the engine picked a dish, in the parent's words (design S02, docs §7.7 step 6). */
export function reasonText(
  code: SwapCandidateDtoReasonsItem,
  context: { protein: MealDishDtoMainProtein; otherMains: DayProteinDto[]; fasterByMin: number },
): string {
  if (code === 'FASTER') return t.fasterBy(context.fasterByMin);
  if (code !== 'DIFFERENT_PROTEIN') return t.codes[code];
  const protein = context.protein ? lower(vi.proteins[context.protein]) : 'khác';
  if (context.otherMains.length === 0) return t.differentProteinAlone(protein);
  const others = context.otherMains
    .map((m) => t.proteinOther(lower(slotLabel(m.slot)), lower(vi.proteins[m.protein])))
    .join(' và ');
  return t.differentProtein(protein, others);
}

const ORDER = ['allergen', 'avoid', 'paused', 'age', 'refused', 'sick_new'] as const;

/** "3 chứa trứng (cần tránh)", "2 chưa hợp độ tuổi"… — FR-043 and FR-050. */
export function exclusionParts(
  counts: ExclusionCountsDto,
  avoidedAllergens: string[],
  noun?: string,
): string[] {
  const p = vi.exclusionParts;
  const allergens =
    avoidedAllergens.length > 0 ? avoidedAllergens.map(lower).join(', ') : p.allergensFallback;
  return ORDER.filter((reason) => counts[reason] > 0).map((reason) => {
    const n = noun ? `${counts[reason]} ${noun}` : String(counts[reason]);
    return reason === 'allergen' ? p.allergen(n, allergens) : p[reason](n);
  });
}

/** BR-21: a candidate repeated within the week is only offered because the window shrank. */
export function repeatNote(repeatInDays: number | null): string | null {
  if (repeatInDays === null) return null;
  const when = repeatInDays < 0 ? t.repeatPast(-repeatInDays) : t.repeatAhead(repeatInDays);
  return `${when} — ${t.relaxed}`;
}

export function proteinTag(mealType: 'main' | 'snack', protein: MealDishDtoMainProtein): string {
  if (mealType === 'snack') return vi.library.snack;
  return protein ? `${vi.foodGroups.protein} · ${vi.proteins[protein]}` : vi.library.main;
}

export function eatenTag(eaten: LastEatenDto): string {
  const l = vi.library;
  if (eaten.daysAgo === 1) return l.eatenYesterday;
  if (eaten.daysAgo > 1) return l.eatenDaysAgo(eaten.daysAgo);
  const today = l.eatenToday as Record<string, string>;
  return today[eaten.slot] ?? l.eatenToday.other;
}
