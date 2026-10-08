-- P5: actors on child records (BR-78, ready for P5b) and "Món của bạn" (F18, BR-80..87).

-- AlterTable
ALTER TABLE "dishes" ADD COLUMN     "archived_at" TIMESTAMPTZ,
ADD COLUMN     "created_by" UUID,
ADD COLUMN     "owner_child_id" UUID;

-- AlterTable
ALTER TABLE "dish_ingredients" ADD COLUMN     "position" SMALLINT NOT NULL DEFAULT 0,
ALTER COLUMN "qty" DROP NOT NULL,
ALTER COLUMN "unit" DROP NOT NULL;

-- AlterTable
ALTER TABLE "meal_logs" ADD COLUMN     "actor_id" UUID;

-- AlterTable
ALTER TABLE "paused_ingredients" ADD COLUMN     "resumed_by" UUID;

-- AlterTable
ALTER TABLE "urgent_events" ADD COLUMN     "actor_id" UUID;

-- CreateIndex
CREATE INDEX "dishes_owner_child_id_idx" ON "dishes"("owner_child_id");

-- AddForeignKey
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_owner_child_id_fkey" FOREIGN KEY ("owner_child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paused_ingredients" ADD CONSTRAINT "paused_ingredients_resumed_by_fkey" FOREIGN KEY ("resumed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "urgent_events" ADD CONSTRAINT "urgent_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

