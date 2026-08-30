LOCK TABLE "chat_rooms" IN ACCESS EXCLUSIVE MODE;--> statement-breakpoint
DELETE FROM "chat_rooms" AS "duplicate"
USING "chat_rooms" AS "canonical"
WHERE "duplicate"."item_id" = "canonical"."item_id"
	AND "duplicate"."buyer_id" = "canonical"."buyer_id"
	AND "duplicate"."id" > "canonical"."id";--> statement-breakpoint
DROP INDEX "chat_rooms_item_buyer_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "chat_rooms_item_buyer_idx" ON "chat_rooms" ("item_id","buyer_id");
