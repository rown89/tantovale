ALTER TABLE "shipping_label_purchases" ADD COLUMN "refund_state" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_label_purchases" ADD COLUMN "refund_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "shipping_label_purchases" ADD COLUMN "provider_refund_id" text;--> statement-breakpoint
ALTER TABLE "shipping_label_purchases" ADD COLUMN "provider_refund_status" text;--> statement-breakpoint
ALTER TABLE "shipping_label_purchases" ADD COLUMN "refund_requested_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_label_purchases_refund_attempt_id_idx" ON "shipping_label_purchases" ("refund_attempt_id") WHERE "refund_attempt_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_label_purchases_provider_refund_id_idx" ON "shipping_label_purchases" ("provider_refund_id") WHERE "provider_refund_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "shipping_label_purchases_refund_state_idx" ON "shipping_label_purchases" ("refund_state");--> statement-breakpoint
ALTER TABLE "shipping_label_purchases" ADD CONSTRAINT "shipping_label_purchases_refund_state_check" CHECK ("refund_state" IN ('none', 'requesting', 'reconciliation_required', 'pending', 'refunded', 'rejected'));--> statement-breakpoint
ALTER TABLE "shipping_label_purchases" ADD CONSTRAINT "shipping_label_purchases_refund_requires_purchase_check" CHECK ("refund_state" = 'none' OR "state" = 'purchased');--> statement-breakpoint
ALTER TABLE "shipping_label_purchases" ADD CONSTRAINT "shipping_label_purchases_refund_provider_status_check" CHECK ("provider_refund_status" IS NULL OR "provider_refund_status" IN ('QUEUED', 'PENDING', 'SUCCESS', 'ERROR'));--> statement-breakpoint
ALTER TABLE "shipping_label_purchases" ADD CONSTRAINT "shipping_label_purchases_refund_graph_check" CHECK ((
				"refund_state" = 'none'
				AND "refund_attempt_id" IS NULL
				AND "provider_refund_id" IS NULL
				AND "provider_refund_status" IS NULL
				AND "refund_requested_at" IS NULL
			) OR (
				"refund_state" = 'requesting'
				AND "refund_attempt_id" IS NOT NULL
				AND "provider_refund_id" IS NULL
				AND "provider_refund_status" IS NULL
				AND "refund_requested_at" IS NOT NULL
			) OR (
				"refund_state" = 'reconciliation_required'
				AND "refund_attempt_id" IS NOT NULL
				AND "refund_requested_at" IS NOT NULL
				AND (
					("provider_refund_id" IS NULL AND "provider_refund_status" IS NULL)
					OR ("provider_refund_id" IS NOT NULL AND "provider_refund_status" IS NOT NULL)
				)
			) OR (
				"refund_state" = 'pending'
				AND "refund_attempt_id" IS NOT NULL
				AND "provider_refund_id" IS NOT NULL
				AND "provider_refund_status" IN ('QUEUED', 'PENDING')
				AND "refund_requested_at" IS NOT NULL
			) OR (
				"refund_state" = 'refunded'
				AND "refund_attempt_id" IS NOT NULL
				AND "provider_refund_id" IS NOT NULL
				AND "provider_refund_status" = 'SUCCESS'
				AND "refund_requested_at" IS NOT NULL
			) OR (
				"refund_state" = 'rejected'
				AND "refund_attempt_id" IS NOT NULL
				AND "provider_refund_id" IS NOT NULL
				AND "provider_refund_status" = 'ERROR'
				AND "refund_requested_at" IS NOT NULL
			));