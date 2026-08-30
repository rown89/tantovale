LOCK TABLE "chat_rooms" IN ACCESS EXCLUSIVE MODE;--> statement-breakpoint
WITH "canonical_rooms" AS (
	SELECT
		"item_id",
		"buyer_id",
		MIN("id") AS "canonical_id"
	FROM "chat_rooms"
	GROUP BY "item_id", "buyer_id"
)
UPDATE "chat_messages" AS "message"
SET "chat_room_id" = "canonical_rooms"."canonical_id"
FROM "chat_rooms" AS "room"
INNER JOIN "canonical_rooms"
	ON "canonical_rooms"."item_id" = "room"."item_id"
	AND "canonical_rooms"."buyer_id" = "room"."buyer_id"
WHERE "message"."chat_room_id" = "room"."id"
	AND "room"."id" <> "canonical_rooms"."canonical_id";--> statement-breakpoint
WITH "reconciled_rooms" AS (
	SELECT
		"item_id",
		"buyer_id",
		MIN("id") AS "canonical_id",
		MIN("created_at") AS "created_at",
		MAX("updated_at") AS "updated_at"
	FROM "chat_rooms"
	GROUP BY "item_id", "buyer_id"
)
UPDATE "chat_rooms" AS "canonical_room"
SET
	"created_at" = "reconciled_rooms"."created_at",
	"updated_at" = "reconciled_rooms"."updated_at"
FROM "reconciled_rooms"
WHERE "canonical_room"."id" = "reconciled_rooms"."canonical_id";--> statement-breakpoint
DELETE FROM "chat_rooms" AS "duplicate"
USING "chat_rooms" AS "canonical"
WHERE "duplicate"."item_id" = "canonical"."item_id"
	AND "duplicate"."buyer_id" = "canonical"."buyer_id"
	AND "duplicate"."id" > "canonical"."id";--> statement-breakpoint
DROP INDEX "chat_rooms_item_buyer_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "chat_rooms_item_buyer_idx" ON "chat_rooms" ("item_id","buyer_id");
