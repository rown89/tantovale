ALTER TABLE "item_images" RENAME TO "items_images";--> statement-breakpoint
ALTER TABLE "item_filters_values" RENAME TO "items_filters_values";--> statement-breakpoint
ALTER TABLE "items_images" DROP CONSTRAINT "item_images_item_id_items_id_fk";
--> statement-breakpoint
ALTER TABLE "items_filters_values" DROP CONSTRAINT "item_filters_values_item_id_items_id_fk";
--> statement-breakpoint
ALTER TABLE "items_filters_values" DROP CONSTRAINT "item_filters_values_filter_value_id_filter_values_id_fk";
--> statement-breakpoint
ALTER TABLE "items_images" ADD CONSTRAINT "items_images_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "items_filters_values" ADD CONSTRAINT "items_filters_values_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "items_filters_values" ADD CONSTRAINT "items_filters_values_filter_value_id_filter_values_id_fk" FOREIGN KEY ("filter_value_id") REFERENCES "public"."filter_values"("id") ON DELETE cascade ON UPDATE cascade;