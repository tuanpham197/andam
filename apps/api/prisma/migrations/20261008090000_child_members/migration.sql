-- P5b: several caregivers per child (F17, BR-70..79).

-- CreateEnum
CREATE TYPE "member_role" AS ENUM ('owner', 'caregiver');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "display_name" VARCHAR(30);

-- AlterTable
ALTER TABLE "health_episodes" ADD COLUMN     "actor_id" UUID;

-- AlterTable
ALTER TABLE "swap_events" ADD COLUMN     "actor_id" UUID;

-- CreateTable
CREATE TABLE "child_members" (
    "child_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "member_role" NOT NULL,
    "invited_by" UUID,
    "joined_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "child_members_pkey" PRIMARY KEY ("child_id","user_id")
);

-- CreateTable
CREATE TABLE "child_invites" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "accepted_by" UUID,
    "accepted_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "child_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "child_members_user_id_idx" ON "child_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "child_invites_token_hash_key" ON "child_invites"("token_hash");

-- CreateIndex
CREATE INDEX "child_invites_child_id_idx" ON "child_invites"("child_id");

-- AddForeignKey
ALTER TABLE "child_members" ADD CONSTRAINT "child_members_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_members" ADD CONSTRAINT "child_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_members" ADD CONSTRAINT "child_members_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_invites" ADD CONSTRAINT "child_invites_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_invites" ADD CONSTRAINT "child_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_invites" ADD CONSTRAINT "child_invites_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_episodes" ADD CONSTRAINT "health_episodes_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_events" ADD CONSTRAINT "swap_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- BR-70: exactly one owner per child.
CREATE UNIQUE INDEX "child_members_one_owner_key" ON "child_members" ("child_id") WHERE "role" = 'owner';

-- Every existing child gets its creator as owner.
INSERT INTO "child_members" ("child_id", "user_id", "role", "joined_at")
SELECT "id", "user_id", 'owner', "created_at" FROM "children";
