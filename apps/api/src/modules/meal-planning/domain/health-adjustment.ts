import type { HealthState, PlanDish, PlanningContext, Texture } from './model.js';

/** How the menu changes with the child's health (BR-50..53). */
export interface HealthAdjustment {
  /** Snacks added on top of the stage's lower bound (smaller, more frequent meals). */
  extraSnacks: 0 | 1;
  /** Share of the stage portion served at each meal. */
  portionPercent: 100 | 85 | 70;
  /** Texture levels below the stage texture (BR-15 order). */
  softerTexture: 0 | 1;
  /** No first tries (BR-07); the hard filter excludes them as `sick_new`. */
  pauseNewFoods: boolean;
}

export const HEALTH_ADJUSTMENTS: Record<HealthState, HealthAdjustment> = {
  normal: { extraSnacks: 0, portionPercent: 100, softerTexture: 0, pauseNewFoods: false },
  sick: { extraSnacks: 1, portionPercent: 70, softerTexture: 1, pauseNewFoods: true },
  recovering: { extraSnacks: 0, portionPercent: 85, softerTexture: 0, pauseNewFoods: true },
};

/** BR-15, from the softest texture up. */
export const TEXTURE_ORDER: readonly Texture[] = [
  'puree_smooth',
  'mashed',
  'lumpy',
  'minced_soft',
  'family',
];

/** One level softer per step; the softest texture stays as it is (TC-HLT-002). */
export function softenTexture(texture: Texture, steps: number): Texture {
  return TEXTURE_ORDER[Math.max(0, TEXTURE_ORDER.indexOf(texture) - steps)]!;
}

const ROUND_TO_ML = 10;

/**
 * "Khoảng 125 ml" at 70% → "Khoảng 90 ml": millilitres are scaled and rounded to 10 ml
 * (TC-HLT-001). Portions given in spoons stay as written, with a note (TC-HLT-004).
 */
export function scalePortion(portionText: string, percent: number): string {
  if (percent === 100) return portionText;
  if (!/\bml\b/.test(portionText)) return `${portionText} · ít hơn bình thường`;
  return portionText.replace(/\d+/g, (amount) => {
    const scaled = Math.round((Number(amount) * percent) / 100 / ROUND_TO_ML) * ROUND_TO_ML;
    return String(Math.max(ROUND_TO_ML, scaled));
  });
}

/** Texture and portion the child gets for a dish, at their stage and in their current health. */
export function servingFor(
  dish: PlanDish,
  ctx: Pick<PlanningContext, 'stage' | 'health'>,
): { texture: Texture; portionText: string } {
  const variant = dish.variants.find((v) => v.stage === ctx.stage)!;
  const adjustment = HEALTH_ADJUSTMENTS[ctx.health];
  return {
    texture: softenTexture(variant.texture, adjustment.softerTexture),
    portionText: scalePortion(variant.portionText, adjustment.portionPercent),
  };
}
