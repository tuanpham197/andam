export const REACTION_SAFETY = Symbol('REACTION_SAFETY');

/** The safety module pauses suspected foods (UC-17) inside the logging transaction. */
export interface ReactionSafety {
  /** Returns every suspected food, now paused, with its name. */
  pauseAfterReaction(input: {
    userId: string;
    childId: string;
    ingredientIds: string[];
    logId: string;
    mealId: string;
  }): Promise<{ id: string; name: string }[]>;
}
