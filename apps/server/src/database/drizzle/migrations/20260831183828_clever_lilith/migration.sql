CREATE TABLE "shipping_label_purchases" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "shipping_label_purchases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"order_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"purchase_attempt_id" uuid NOT NULL,
	"shippo_rate_id" text NOT NULL,
	"state" text DEFAULT 'creating' NOT NULL,
	"provider_transaction_id" text,
	"label_url" text,
	"provider_status" text,
	"tracking_number" text,
	"tracking_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_label_purchases_state_check" CHECK ("state" IN ('creating', 'reconciliation_required', 'purchased')),
	CONSTRAINT "shipping_label_purchases_purchased_graph_check" CHECK ("state" <> 'purchased' OR (
				"provider_transaction_id" IS NOT NULL
				AND "label_url" IS NOT NULL
				AND "provider_status" = 'SUCCESS'
			))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_label_purchases_order_id_idx" ON "shipping_label_purchases" ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_label_purchases_attempt_id_idx" ON "shipping_label_purchases" ("purchase_attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_label_purchases_provider_transaction_id_idx" ON "shipping_label_purchases" ("provider_transaction_id") WHERE "provider_transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "shipping_label_purchases_state_idx" ON "shipping_label_purchases" ("state");--> statement-breakpoint
ALTER TABLE "shipping_label_purchases" ADD CONSTRAINT "shipping_label_purchases_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "shipping_label_purchases" ADD CONSTRAINT "shipping_label_purchases_item_id_items_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;