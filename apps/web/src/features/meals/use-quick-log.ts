import { useLogMeal } from '@appandam/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { invalidateChildData } from '../child/invalidate';

export const QUICK_AMOUNTS = ['all', 'half', 'none'] as const;
export type QuickAmount = (typeof QUICK_AMOUNTS)[number];

/**
 * FR-144: one tap logs how much the child ate, now, without a liking or a reaction (BR-95).
 * The day reloads so the card moves on to the next meal.
 */
export function useQuickLog(childId: string) {
  const queryClient = useQueryClient();
  const [done, setDone] = useState<{ mealId: string; amount: QuickAmount } | null>(null);
  const mutation = useLogMeal({
    mutation: {
      onSuccess: (_data, { mealId, data }) => {
        setDone({ mealId, amount: data.amount as QuickAmount });
        return invalidateChildData(queryClient, childId);
      },
    },
  });
  return {
    log: (mealId: string, amount: QuickAmount) => {
      setDone(null);
      mutation.mutate({ mealId, data: { loggedAt: new Date().toISOString(), amount } });
    },
    isPending: mutation.isPending,
    error: mutation.error,
    done,
  };
}
