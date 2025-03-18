ALTER TABLE "subcategory_filters" RENAME COLUMN "isOptionalField" TO "on_item_create_required";--> statement-breakpoint
ALTER TABLE "subcategory_filters" RENAME COLUMN "isEditableField" TO "on_item_update_editable";--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "delivery_method" SET DEFAULT 'shipping';--> statement-breakpoint
ALTER TABLE "filter_values" ALTER COLUMN "value" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subcategory_filters" ADD COLUMN "is_searchable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "subcategory_filters" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "subcategory_filters" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "items_images" ADD COLUMN "order_position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "items_images" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "filter_values" ADD COLUMN "boolean_value" boolean;--> statement-breakpoint
ALTER TABLE "filter_values" ADD COLUMN "numeric_value" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_filter_per_subcategory" ON "subcategory_filters" USING btree ("filter_id","subcategory_id");--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN "condition";--> statement-breakpoint
ALTER TABLE "public"."filters" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."filter_types_enum";--> statement-breakpoint
CREATE TYPE "public"."filter_types_enum" AS ENUM('select', 'select_multi', 'boolean', 'checkbox', 'radio', 'number');--> statement-breakpoint
ALTER TABLE "public"."filters" ALTER COLUMN "type" SET DATA TYPE "public"."filter_types_enum" USING "type"::"public"."filter_types_enum";