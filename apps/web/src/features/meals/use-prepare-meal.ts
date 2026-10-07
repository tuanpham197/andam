import { getGetDayPlanQueryKey, useUpdateMeal, type DayPlanDto } from '@appandam/api-client';
import { useQueryClient } from '@tanstack/react-query';

/**
 * "Đã chuẩn bị xong" (FR-025): the card switches at once; a refusal from the server (meal
 * logged meanwhile on another phone) restores it, and the day is reloaded either way.
 */
export function usePrepareMeal(childId: string, date: string) {
  const queryClient = useQueryClient();
  const queryKey = getGetDayPlanQueryKey(childId, date);

  const mutation = useUpdateMeal<unknown, { previous: DayPlanDto | undefined }>({
    mutation: {
      onMutate: async ({ mealId }) => {
        await queryClient.cancelQueries({ queryKey });
        const previous = queryClient.getQueryData<DayPlanDto>(queryKey);
        queryClient.setQueryData<DayPlanDto>(queryKey, (day) =>
          day
            ? {
                ...day,
                meals: day.meals.map((m) =>
                  m.id === mealId ? { ...m, status: 'prepared' as const } : m,
                ),
              }
            : day,
        );
        return { previous };
      },
      onError: (_error, _variables, context) => {
        queryClient.setQueryData(queryKey, context?.previous);
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey }),
    },
  });

  return {
    prepare: (mealId: string) => mutation.mutate({ mealId, data: { status: 'prepared' } }),
    isPending: mutation.isPending,
    error: mutation.error,
  };
}
