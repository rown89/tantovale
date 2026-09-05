CREATE TYPE "address_status_enum" AS ENUM('active', 'inactive', 'deleted');--> statement-breakpoint
CREATE TYPE "chat_message_type_enum" AS ENUM('text', 'proposal', 'system', 'buy_now');--> statement-breakpoint
CREATE TYPE "transaction_currency_enum" AS ENUM('usd', 'eur', 'gbp', 'cad', 'aud', 'jpy', 'cny', 'inr', 'brl', 'ars', 'clp', 'cop', 'mxn', 'pen', 'pyg', 'uyu', 'vef', 'vnd', 'zar');--> statement-breakpoint
CREATE TYPE "entity_trustap_transaction_type_enum" AS ENUM('created', 'joined', 'paid', 'rejected', 'cancelled', 'tracked', 'cancelled_with_payment', 'delivered', 'payment_refunded', 'complained', 'complaint_period_ended', 'funds_released');--> statement-breakpoint
CREATE TYPE "item_images_size_enum" AS ENUM('original', 'small', 'medium', 'thumbnail');--> statement-breakpoint
CREATE TYPE "status_enum" AS ENUM('available', 'sold', 'pending', 'archived');--> statement-breakpoint
CREATE TYPE "proposal_status_enum" AS ENUM('pending', 'accepted', 'rejected', 'expired', 'buyer_aborted');--> statement-breakpoint
CREATE TYPE "profile_types_enum" AS ENUM('private', 'private_pro', 'shop', 'shop_pro');--> statement-breakpoint
CREATE TYPE "sex_enum" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "addresses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"profile_id" integer,
	"label" text DEFAULT 'Home' NOT NULL,
	"street_address" text NOT NULL,
	"civic_number" text NOT NULL,
	"city_id" integer NOT NULL,
	"province_id" integer NOT NULL,
	"postal_code" integer NOT NULL,
	"country_code" varchar(50) DEFAULT 'IT' NOT NULL,
	"status" "address_status_enum" DEFAULT 'active'::"address_status_enum" NOT NULL,
	"phone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"menu_order" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "chat_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"chat_room_id" integer NOT NULL,
	"sender_id" integer NOT NULL,
	"message" text NOT NULL,
	"message_type" "chat_message_type_enum" DEFAULT 'text'::"chat_message_type_enum" NOT NULL,
	"order_proposal_id" integer,
	"metadata" jsonb,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_rooms" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "chat_rooms_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_id" integer NOT NULL,
	"buyer_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" integer PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"state_id" integer NOT NULL,
	"state_code" varchar(10) NOT NULL,
	"country_id" integer NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"latitude" numeric(10,8) NOT NULL,
	"longitude" numeric(11,8) NOT NULL,
	"flag" smallint DEFAULT 1 NOT NULL,
	"wikiDataId" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"id" integer PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"iso3" varchar(3) NOT NULL,
	"iso2" varchar(2) NOT NULL,
	"numeric_code" varchar(15),
	"phonecode" varchar(15) NOT NULL,
	"capital" varchar(255),
	"currency" varchar(10),
	"currency_name" varchar(255),
	"currency_symbol" varchar(10),
	"tld" varchar(10),
	"native" varchar(255),
	"region" varchar(255),
	"region_id" integer,
	"subregion" varchar(255),
	"subregion_id" integer,
	"nationality" varchar(255),
	"timezones" json,
	"translations" json,
	"latitude" numeric(10,8),
	"longitude" numeric(11,8),
	"emoji" varchar(5),
	"emoji_u" varchar(25)
);
--> statement-breakpoint
CREATE TABLE "entity_trustap_transactions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "entity_trustap_transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entity_id" integer,
	"seller_id" text,
	"buyer_id" text,
	"transaction_id" integer NOT NULL,
	"transaction_type" varchar(255) DEFAULT 'online_payment' NOT NULL,
	"status" "entity_trustap_transaction_type_enum" NOT NULL,
	"price" integer NOT NULL,
	"charge" integer NOT NULL,
	"charge_seller" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'eur' NOT NULL,
	"entity_title" text NOT NULL,
	"claimed_by_seller" boolean DEFAULT false NOT NULL,
	"claimed_by_buyer" boolean DEFAULT false NOT NULL,
	"complaint_period_deadline" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items_images" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "items_images_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_id" integer NOT NULL,
	"url" text NOT NULL,
	"order_position" integer DEFAULT 0 NOT NULL,
	"size" "item_images_size_enum" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items_properties_values" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "items_properties_values_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_id" integer NOT NULL,
	"property_value_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"profile_id" integer NOT NULL,
	"subcategory_id" integer NOT NULL,
	"address_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "status_enum" DEFAULT 'available'::"status_enum" NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"easy_pay" boolean DEFAULT false NOT NULL,
	"item_weight" integer,
	"item_length" integer,
	"item_width" integer,
	"item_height" integer,
	"custom_shipping_price" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "orders_proposals" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "orders_proposals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_id" integer,
	"profile_id" integer,
	"original_price" integer NOT NULL,
	"proposal_price" integer NOT NULL,
	"payment_provider_charge" integer NOT NULL,
	"platform_charge" integer NOT NULL,
	"shipping_label_id" text NOT NULL,
	"status" "proposal_status_enum" DEFAULT 'pending'::"proposal_status_enum" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_id" integer,
	"payment_provider_charge" integer NOT NULL,
	"platform_charge" integer NOT NULL,
	"shipping_label_id" text NOT NULL,
	"shipping_price" integer NOT NULL,
	"buyer_id" integer,
	"seller_id" integer,
	"buyer_address" integer,
	"seller_address" integer,
	"payment_transaction_id" integer,
	"status" text DEFAULT 'payment_pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "password_reset_tokens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "profiles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"profile_type" "profile_types_enum" DEFAULT 'private'::"profile_types_enum" NOT NULL,
	"user_id" integer NOT NULL UNIQUE,
	"name" varchar(50) NOT NULL,
	"surname" varchar(50) NOT NULL,
	"vat_number" varchar(50),
	"birthday" date,
	"gender" "sex_enum" NOT NULL,
	"privacy_policy" boolean DEFAULT false NOT NULL,
	"marketing_policy" boolean DEFAULT false NOT NULL,
	"payment_provider_id" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_values" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "property_values_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"property_id" integer NOT NULL,
	"name" text NOT NULL,
	"value" text,
	"boolean_value" boolean,
	"numeric_value" integer,
	"icon" text,
	"meta" text
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "properties_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"type" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"username" text NOT NULL,
	"token" text NOT NULL UNIQUE,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" integer PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"translations" json NOT NULL,
	"wiki_data_id" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shippings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "shippings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_id" integer,
	"order_id" integer,
	"tracking_number" text,
	"tracking_url" text,
	"tracking_status" text,
	"tracking_status_description" text,
	"tracking_status_updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "states" (
	"id" integer PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"country_id" integer NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"state_code" varchar(10),
	"type" varchar(50),
	"latitude" numeric(10,8),
	"longitude" numeric(11,8)
);
--> statement-breakpoint
CREATE TABLE "subcategories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subcategories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"category_id" integer NOT NULL,
	"parent_id" integer DEFAULT NULL,
	"easy_pay" boolean,
	"menu_order" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subcategory_properties" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subcategory_properties_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"property_id" integer NOT NULL,
	"subcategory_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"on_item_create_required" boolean DEFAULT false NOT NULL,
	"on_item_update_editable" boolean DEFAULT true NOT NULL,
	"is_searchable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_regions" (
	"id" integer PRIMARY KEY,
	"name" text NOT NULL,
	"region_id" integer NOT NULL,
	"translations" json NOT NULL,
	"wiki_data_id" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_items_favorites" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_items_favorites_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"profile_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"username" varchar(50) NOT NULL UNIQUE,
	"email" varchar(255) NOT NULL UNIQUE,
	"phone" varchar(30),
	"password" varchar(255) NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"is_banned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "addresses_one_active_profile_idx" ON "addresses" ("profile_id") WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX "chat_rooms_item_buyer_idx" ON "chat_rooms" ("item_id","buyer_id");--> statement-breakpoint
CREATE INDEX "cities_name_idx" ON "cities" ("name");--> statement-breakpoint
CREATE INDEX "item_id_idx" ON "items_images" ("item_id");--> statement-breakpoint
CREATE INDEX "profile_id_idx" ON "items" ("profile_id");--> statement-breakpoint
CREATE INDEX "address_id_idx" ON "items" ("address_id");--> statement-breakpoint
CREATE INDEX "title_idx" ON "items" ("title");--> statement-breakpoint
CREATE INDEX "subcategory_id_idx" ON "items" ("subcategory_id");--> statement-breakpoint
CREATE INDEX "easy_pay_idx" ON "items" ("easy_pay");--> statement-breakpoint
CREATE INDEX "published_idx" ON "items" ("published");--> statement-breakpoint
CREATE INDEX "status_idx" ON "items" ("status");--> statement-breakpoint
CREATE INDEX "orders_proposals_status_idx" ON "orders_proposals" ("status");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" ("status");--> statement-breakpoint
CREATE INDEX "profiles_name_surname_idx" ON "profiles" ("name","surname");--> statement-breakpoint
CREATE INDEX "value_id_idx" ON "property_values" ("value");--> statement-breakpoint
CREATE UNIQUE INDEX "property_values_property_id_value_unique" ON "property_values" ("property_id","value");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_property_per_subcategory" ON "subcategory_properties" ("property_id","subcategory_id");--> statement-breakpoint
CREATE INDEX "profiles_favorites_profile_id_idx" ON "user_items_favorites" ("profile_id");--> statement-breakpoint
CREATE INDEX "profiles_favorites_item_id_idx" ON "user_items_favorites" ("item_id");--> statement-breakpoint
CREATE INDEX "profiles_favorites_unique_profile_item_idx" ON "user_items_favorites" ("profile_id","item_id");--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_profile_id_profiles_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id");--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_city_id_cities_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_province_id_cities_id_fkey" FOREIGN KEY ("province_id") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chat_room_id_chat_rooms_id_fkey" FOREIGN KEY ("chat_room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_profiles_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_order_proposal_id_orders_proposals_id_fkey" FOREIGN KEY ("order_proposal_id") REFERENCES "orders_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_item_id_items_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_buyer_id_profiles_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_state_id_states_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_country_id_countries_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "countries" ADD CONSTRAINT "countries_region_id_regions_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "countries" ADD CONSTRAINT "countries_subregion_id_sub_regions_id_fkey" FOREIGN KEY ("subregion_id") REFERENCES "sub_regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "entity_trustap_transactions" ADD CONSTRAINT "entity_trustap_transactions_entity_id_items_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "items_images" ADD CONSTRAINT "items_images_item_id_items_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "items_properties_values" ADD CONSTRAINT "items_properties_values_item_id_items_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "items_properties_values" ADD CONSTRAINT "items_properties_values_RgSTAebJsvzg_fkey" FOREIGN KEY ("property_value_id") REFERENCES "property_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_profile_id_profiles_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_subcategory_id_subcategories_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "subcategories"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_address_id_addresses_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "orders_proposals" ADD CONSTRAINT "orders_proposals_item_id_items_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "orders_proposals" ADD CONSTRAINT "orders_proposals_profile_id_profiles_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_item_id_items_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_profiles_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_id_profiles_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_address_addresses_id_fkey" FOREIGN KEY ("buyer_address") REFERENCES "addresses"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_address_addresses_id_fkey" FOREIGN KEY ("seller_address") REFERENCES "addresses"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "property_values" ADD CONSTRAINT "property_values_property_id_properties_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_username_users_username_fkey" FOREIGN KEY ("username") REFERENCES "users"("username") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "shippings" ADD CONSTRAINT "shippings_item_id_items_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "shippings" ADD CONSTRAINT "shippings_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "states" ADD CONSTRAINT "states_country_id_countries_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_parent_id_subcategories_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "subcategories"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "subcategory_properties" ADD CONSTRAINT "subcategory_properties_property_id_properties_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "subcategory_properties" ADD CONSTRAINT "subcategory_properties_subcategory_id_subcategories_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "subcategories"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "sub_regions" ADD CONSTRAINT "sub_regions_region_id_regions_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "user_items_favorites" ADD CONSTRAINT "user_items_favorites_profile_id_profiles_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "user_items_favorites" ADD CONSTRAINT "user_items_favorites_item_id_items_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;