-- P8a: why the engine chose a dish (BR-93) and why the plan changed a meal by itself (BR-94).
CREATE TYPE "replan_cause" AS ENUM ('profile', 'health', 'food_paused', 'food_resumed', 'dish_changed');

ALTER TABLE "planned_meals"
  ADD COLUMN "reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "replan_cause" "replan_cause";
