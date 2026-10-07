-- CreateEnum
CREATE TYPE "allergen" AS ENUM ('egg', 'cow_milk', 'peanut', 'shellfish', 'fish', 'wheat', 'soy', 'sesame', 'tree_nut');

-- CreateEnum
CREATE TYPE "food_group" AS ENUM ('carb', 'protein', 'fat', 'veg', 'fruit');

-- CreateEnum
CREATE TYPE "protein_source" AS ENUM ('fish', 'chicken', 'beef', 'pork', 'legume', 'egg');

-- CreateEnum
CREATE TYPE "texture" AS ENUM ('puree_smooth', 'mashed', 'lumpy', 'minced_soft', 'family');

-- CreateEnum
CREATE TYPE "meal_type" AS ENUM ('main', 'snack');

-- CreateEnum
CREATE TYPE "meal_slot" AS ENUM ('breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'extra_snack');

-- CreateEnum
CREATE TYPE "meal_status" AS ENUM ('planned', 'prepared', 'eaten', 'refused', 'skipped');

-- CreateEnum
CREATE TYPE "plan_source" AS ENUM ('auto', 'swap', 'manual');

-- CreateEnum
CREATE TYPE "swap_reason" AS ENUM ('missing_ingredient', 'disliked', 'faster', 'other');

-- CreateEnum
CREATE TYPE "eat_amount" AS ENUM ('none', 'few_spoons', 'quarter', 'half', 'almost_all', 'all');

-- CreateEnum
CREATE TYPE "symptom" AS ENUM ('rash', 'vomit', 'diarrhea', 'swelling', 'breathing', 'fussy');

-- CreateEnum
CREATE TYPE "severity" AS ENUM ('unknown', 'mild', 'moderate', 'severe');

-- CreateEnum
CREATE TYPE "health_status" AS ENUM ('normal', 'sick', 'recovering');

-- CreateEnum
CREATE TYPE "health_symptom" AS ENUM ('fever', 'poor_appetite', 'cough', 'diarrhea', 'vomit', 'teething');

-- CreateEnum
CREATE TYPE "avoid_reason" AS ENUM ('not_eat', 'dislike');

-- CreateEnum
CREATE TYPE "prior_reaction" AS ENUM ('never', 'yes', 'unsure');

-- CreateEnum
CREATE TYPE "exposure_status" AS ENUM ('new', 'tried', 'paused');

-- CreateEnum
CREATE TYPE "pause_reason" AS ENUM ('reaction', 'urgent');

-- CreateEnum
CREATE TYPE "content_status" AS ENUM ('draft', 'published');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ NOT NULL,
    "ip" TEXT,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "attempted_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stages" (
    "id" SMALLINT NOT NULL,
    "name" TEXT NOT NULL,
    "age_from_months" SMALLINT NOT NULL,
    "age_to_months" SMALLINT NOT NULL,
    "texture" "texture" NOT NULL,
    "portion_text" TEXT NOT NULL,
    "main_meals" SMALLINT NOT NULL,
    "snacks_min" SMALLINT NOT NULL,
    "snacks_max" SMALLINT NOT NULL,
    "default_schedule" JSONB NOT NULL,

    CONSTRAINT "stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[],
    "search_text" TEXT NOT NULL,
    "food_group" "food_group" NOT NULL,
    "protein_source" "protein_source",
    "allergen_tags" "allergen"[],
    "min_age_months" SMALLINT NOT NULL,
    "choking_risk" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dishes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "image_url" TEXT,
    "meal_type" "meal_type" NOT NULL,
    "prep_min" SMALLINT NOT NULL,
    "cook_min" SMALLINT NOT NULL,
    "tool" TEXT NOT NULL,
    "main_protein" "protein_source",
    "steps" JSONB NOT NULL,
    "safety_notes" TEXT[],
    "content_version" INTEGER NOT NULL,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMPTZ,
    "status" "content_status" NOT NULL,
    "search_text" TEXT NOT NULL,

    CONSTRAINT "dishes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dish_ingredients" (
    "dish_id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "qty" DECIMAL(6,1) NOT NULL,
    "unit" TEXT NOT NULL,
    "is_main" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "dish_ingredients_pkey" PRIMARY KEY ("dish_id","ingredient_id")
);

-- CreateTable
CREATE TABLE "dish_stage_variants" (
    "dish_id" TEXT NOT NULL,
    "stage_id" SMALLINT NOT NULL,
    "texture" "texture" NOT NULL,
    "portion_text" TEXT NOT NULL,
    "portion_ml" SMALLINT,

    CONSTRAINT "dish_stage_variants_pkey" PRIMARY KEY ("dish_id","stage_id")
);

-- CreateTable
CREATE TABLE "children" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "birth_date" DATE NOT NULL,
    "is_premature" BOOLEAN NOT NULL DEFAULT false,
    "weeks_early" SMALLINT NOT NULL DEFAULT 0,
    "stage_override" SMALLINT,
    "prior_reaction" "prior_reaction" NOT NULL,
    "prior_reaction_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_avoid_allergens" (
    "child_id" UUID NOT NULL,
    "allergen" "allergen" NOT NULL,

    CONSTRAINT "child_avoid_allergens_pkey" PRIMARY KEY ("child_id","allergen")
);

-- CreateTable
CREATE TABLE "child_avoid_ingredients" (
    "child_id" UUID NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "reason" "avoid_reason" NOT NULL,

    CONSTRAINT "child_avoid_ingredients_pkey" PRIMARY KEY ("child_id","ingredient_id")
);

-- CreateTable
CREATE TABLE "health_episodes" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "status" "health_status" NOT NULL,
    "symptoms" "health_symptom"[],
    "start_date" DATE NOT NULL,
    "expected_end_date" DATE,
    "ended_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planned_meals" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "slot" "meal_slot" NOT NULL,
    "time" VARCHAR(5) NOT NULL,
    "dish_id" TEXT NOT NULL,
    "stage_id" SMALLINT NOT NULL,
    "texture" "texture" NOT NULL,
    "portion_text" TEXT NOT NULL,
    "status" "meal_status" NOT NULL DEFAULT 'planned',
    "new_ingredient_ids" TEXT[],
    "source" "plan_source" NOT NULL,
    "generated_at" TIMESTAMPTZ NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "planned_meals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swap_events" (
    "id" UUID NOT NULL,
    "meal_id" UUID NOT NULL,
    "from_dish_id" TEXT NOT NULL,
    "to_dish_id" TEXT NOT NULL,
    "reason" "swap_reason" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swap_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_logs" (
    "id" UUID NOT NULL,
    "meal_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "dish_id" TEXT NOT NULL,
    "logged_at" TIMESTAMPTZ NOT NULL,
    "amount" "eat_amount" NOT NULL,
    "liking" SMALLINT NOT NULL,

    CONSTRAINT "meal_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reactions" (
    "id" UUID NOT NULL,
    "log_id" UUID NOT NULL,
    "symptoms" "symptom"[],
    "severity" "severity" NOT NULL,
    "note" VARCHAR(500),

    CONSTRAINT "reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_exposures" (
    "child_id" UUID NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "first_tried_at" TIMESTAMPTZ,
    "last_eaten_at" TIMESTAMPTZ,
    "status" "exposure_status" NOT NULL,

    CONSTRAINT "ingredient_exposures_pkey" PRIMARY KEY ("child_id","ingredient_id")
);

-- CreateTable
CREATE TABLE "paused_ingredients" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "reason" "pause_reason" NOT NULL,
    "source_log_id" UUID,
    "source_urgent_id" UUID,
    "paused_at" TIMESTAMPTZ NOT NULL,
    "resumed_at" TIMESTAMPTZ,

    CONSTRAINT "paused_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "urgent_events" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "meal_id" UUID,
    "opened_at" TIMESTAMPTZ NOT NULL,
    "contacted_medical_at" TIMESTAMPTZ,

    CONSTRAINT "urgent_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "consents_user_id_idx" ON "consents"("user_id");

-- CreateIndex
CREATE INDEX "login_attempts_email_attempted_at_idx" ON "login_attempts"("email", "attempted_at");

-- CreateIndex
CREATE INDEX "children_user_id_idx" ON "children"("user_id");

-- CreateIndex
CREATE INDEX "health_episodes_child_id_start_date_idx" ON "health_episodes"("child_id", "start_date" DESC);

-- CreateIndex
CREATE INDEX "planned_meals_child_id_date_idx" ON "planned_meals"("child_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "planned_meals_child_id_date_slot_key" ON "planned_meals"("child_id", "date", "slot");

-- CreateIndex
CREATE INDEX "swap_events_meal_id_idx" ON "swap_events"("meal_id");

-- CreateIndex
CREATE UNIQUE INDEX "meal_logs_meal_id_key" ON "meal_logs"("meal_id");

-- CreateIndex
CREATE INDEX "meal_logs_child_id_logged_at_idx" ON "meal_logs"("child_id", "logged_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "reactions_log_id_key" ON "reactions"("log_id");

-- CreateIndex
CREATE INDEX "paused_ingredients_child_id_idx" ON "paused_ingredients"("child_id");

-- CreateIndex
CREATE INDEX "urgent_events_child_id_idx" ON "urgent_events"("child_id");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dish_ingredients" ADD CONSTRAINT "dish_ingredients_dish_id_fkey" FOREIGN KEY ("dish_id") REFERENCES "dishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dish_ingredients" ADD CONSTRAINT "dish_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dish_stage_variants" ADD CONSTRAINT "dish_stage_variants_dish_id_fkey" FOREIGN KEY ("dish_id") REFERENCES "dishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dish_stage_variants" ADD CONSTRAINT "dish_stage_variants_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_avoid_allergens" ADD CONSTRAINT "child_avoid_allergens_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_avoid_ingredients" ADD CONSTRAINT "child_avoid_ingredients_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_avoid_ingredients" ADD CONSTRAINT "child_avoid_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_episodes" ADD CONSTRAINT "health_episodes_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_meals" ADD CONSTRAINT "planned_meals_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_meals" ADD CONSTRAINT "planned_meals_dish_id_fkey" FOREIGN KEY ("dish_id") REFERENCES "dishes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_events" ADD CONSTRAINT "swap_events_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "planned_meals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "planned_meals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_log_id_fkey" FOREIGN KEY ("log_id") REFERENCES "meal_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_exposures" ADD CONSTRAINT "ingredient_exposures_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_exposures" ADD CONSTRAINT "ingredient_exposures_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paused_ingredients" ADD CONSTRAINT "paused_ingredients_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paused_ingredients" ADD CONSTRAINT "paused_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paused_ingredients" ADD CONSTRAINT "paused_ingredients_source_log_id_fkey" FOREIGN KEY ("source_log_id") REFERENCES "meal_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paused_ingredients" ADD CONSTRAINT "paused_ingredients_source_urgent_id_fkey" FOREIGN KEY ("source_urgent_id") REFERENCES "urgent_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "urgent_events" ADD CONSTRAINT "urgent_events_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "urgent_events" ADD CONSTRAINT "urgent_events_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "planned_meals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ───────────── Hand-written: constraints Prisma schema cannot express ─────────────

-- TC-AUTH-002: e-mail addresses are unique regardless of case.
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (lower("email"));

-- TC-DB-003: last line of defence when application validation is bypassed.
ALTER TABLE "children"
  ADD CONSTRAINT "children_name_check" CHECK (length(btrim("name")) BETWEEN 1 AND 30),
  ADD CONSTRAINT "children_weeks_early_check" CHECK ("weeks_early" BETWEEN 0 AND 16),
  ADD CONSTRAINT "children_stage_override_check" CHECK ("stage_override" IS NULL OR "stage_override" BETWEEN 1 AND 4);

ALTER TABLE "meal_logs"
  ADD CONSTRAINT "meal_logs_liking_check" CHECK ("liking" BETWEEN 1 AND 5);

ALTER TABLE "planned_meals"
  ADD CONSTRAINT "planned_meals_time_check" CHECK ("time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE "stages"
  ADD CONSTRAINT "stages_age_range_check" CHECK ("age_from_months" < "age_to_months");

ALTER TABLE "health_episodes"
  ADD CONSTRAINT "health_episodes_dates_check" CHECK ("expected_end_date" IS NULL OR "expected_end_date" >= "start_date");

-- BR-42 / TC-LOG-012: at most one active pause per child and ingredient.
CREATE UNIQUE INDEX "paused_ingredients_active_key"
  ON "paused_ingredients" ("child_id", "ingredient_id")
  WHERE "resumed_at" IS NULL;

-- TC-ING-001..005: accent-insensitive fuzzy search over pre-normalised text.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "ingredients_search_text_trgm_idx" ON "ingredients" USING GIN ("search_text" gin_trgm_ops);
CREATE INDEX "dishes_search_text_trgm_idx" ON "dishes" USING GIN ("search_text" gin_trgm_ops);
