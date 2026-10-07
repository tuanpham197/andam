import type { AgeDto, StageDto } from '@appandam/api-client';
import { vi } from '../../strings/vi';

export function formatAge(age: AgeDto): string {
  const parts = [
    age.months > 0 && `${age.months} tháng`,
    age.days > 0 && `${age.days} ngày`,
  ].filter(Boolean);
  const text = parts.length > 0 ? parts.join(' ') : vi.child.newborn;
  return age.corrected ? `${text} (${vi.child.corrected})` : text;
}

/** "6–7 tháng" — ageToMonths is exclusive, except the last stage which ends at 24. */
export function stageRange(stage: StageDto): string {
  const last = stage.ageToMonths >= 24 ? stage.ageToMonths : stage.ageToMonths - 1;
  return `${stage.ageFromMonths}–${last === 11 ? 12 : last} tháng`;
}

export function textureLabel(texture: string): string {
  return (vi.textures as Record<string, string>)[texture] ?? texture;
}
