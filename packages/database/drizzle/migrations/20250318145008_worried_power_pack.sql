CREATE TABLE "user_favorites" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_favorites_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "user_favorites_user_id_idx" ON "user_favorites" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_favorites_item_id_idx" ON "user_favorites" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "user_favorites_unique_user_item_idx" ON "user_favorites" USING btree ("user_id","item_id");