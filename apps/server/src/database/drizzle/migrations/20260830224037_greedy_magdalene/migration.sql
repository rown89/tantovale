LOCK TABLE "user_items_favorites" IN ACCESS EXCLUSIVE MODE;--> statement-breakpoint
DELETE FROM "user_items_favorites" AS "duplicate"
USING "user_items_favorites" AS "canonical"
WHERE "duplicate"."profile_id" = "canonical"."profile_id"
	AND "duplicate"."item_id" = "canonical"."item_id"
	AND "duplicate"."id" > "canonical"."id";--> statement-breakpoint
DROP INDEX IF EXISTS "profiles_favorites_unique_profile_item_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_favorites_unique_profile_item_idx" ON "user_items_favorites" ("profile_id","item_id");
