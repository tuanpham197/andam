-- P8a: a quick log only says how much the child ate; the 1–5 check still holds when set (BR-95).
ALTER TABLE "meal_logs" ALTER COLUMN "liking" DROP NOT NULL;
