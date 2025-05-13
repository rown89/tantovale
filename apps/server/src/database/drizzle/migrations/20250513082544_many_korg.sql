CREATE TYPE "public"."property_values_enum" AS ENUM('null', 'shipping', 'pickup', 'new', 'used-like-new', 'used-good', 'used-fair', 'unisex', 'men', 'women', 'leather', 'cotton', 'wool', 'silk', 'linen', 'polyester', 'nylon', 'rayon', 'spandex', 'acrylic', 'viscose', 'denim', 'suede', 'velvet', 'cashmere', 'corduroy', 'tweed', 'flannel', 'canvas', 'hemp', 'bamboo', 'fleece', 'microfiber', 'modal', 'jacquard', 'chiffon', 'taffeta', 'satin', 'gabardine', 'terrycloth', 'seersucker', 'batiste', 'muslin', 'organza', 'tulle', 'black', 'white', 'red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink', 'brown', 'gray', 'beige', 'cyan', 'magenta', 'lime', 'olive', 'navy', 'teal', 'maroon', 'turquoise', 'gold', 'silver', 'bronze', 'ivory', 'mustard', 'coral', 'salmon', 'peach', 'lavender', 'charcoal', 'indigo', 'periwinkle', 'burgundy', 'mint', 'ochre', 'plum', 'rust', 'saffron', 'jade', 'violet', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', '35', '35.5', '36', '36.5', '37', '37.5', '38', '38.5', '39', '39.5', '40', '40.5', '41', '41.5', '42', '42.5', '43', '43.5', '44', '44.5', '45', '45.5', '46', '46.5', '47', '47.5', '48', '48.5', '49', '49.5', '50', '28mm', '30mm', '32mm', '34mm', '36mm', '38mm', '40mm', '41mm', '42mm', '43mm', '44mm', '45mm', '46mm', '47mm', '48mm', '50mm', '52mm', '3.5"', '4.0"', '4.5"', '5.0"', '5.2"', '5.5"', '5.7"', '6.0"', '6.1"', '6.2"', '6.3"', '6.4"', '6.5"', '6.6"', '6.7"', '6.8"', '7.0"', '7.2"', '7.6"', '8.0"', '15"', '17"', '19"', '20"', '21"', '21.5"', '22"', '23"', '23.6"', '24"', '25"', '27"', '28"', '29"', '30"', '32"', '34"', '35"', '37.5"', '38"', '40"', '42"', '43"', '49"', '55"');--> statement-breakpoint
CREATE TYPE "public"."subcategories_enum" AS ENUM('computers', 'desktop_computer', 'phones', 'smartphones_cellulares', 'accessories', 'photography', 'laptops', 'cameras', 'lenses', 'shoes', 'jeans', 'pants', 'toys', 'book_kids', 'cards', 'single_cards', 'uncut_paper_sheet', 'accessories_phones', 'accessories_photography', 'accessories_computers', 'accessories_clothings');--> statement-breakpoint
CREATE TYPE "public"."categories_enum" AS ENUM('electronics', 'clothings', 'kids', 'collectables');--> statement-breakpoint
CREATE TYPE "public"."chat_message_type_enum" AS ENUM('text', 'proposal');--> statement-breakpoint
CREATE TYPE "public"."transaction_currency_enum" AS ENUM('usd', 'eur', 'gbp', 'cad', 'aud', 'jpy', 'cny', 'inr', 'brl', 'ars', 'clp', 'cop', 'mxn', 'pen', 'pyg', 'uyu', 'vef', 'vnd', 'zar');--> statement-breakpoint
CREATE TYPE "public"."delivery_method_enum" AS ENUM('shipping', 'pickup');--> statement-breakpoint
CREATE TYPE "public"."item_images_size_enum" AS ENUM('original', 'small', 'medium', 'thumbnail');--> statement-breakpoint
CREATE TYPE "public"."status_enum" AS ENUM('available', 'sold', 'pending', 'archived');--> statement-breakpoint
CREATE TYPE "public"."order_status_enum" AS ENUM('pending_payment', 'payment_confirmed', 'completed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."proposal_status_enum" AS ENUM('pending', 'accepted', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."profile_types_enum" AS ENUM('private', 'private_pro', 'shop', 'shop_pro');--> statement-breakpoint
CREATE TYPE "public"."properties_enum" AS ENUM('condition', 'delivery_method', 'gender', 'color', 'material_clothing', 'size_clothing', 'size_shoes', 'size_watches', 'size_phone_screen', 'size_monitor_screen');--> statement-breakpoint
CREATE TYPE "public"."property_types_enum" AS ENUM('select', 'select_multi', 'boolean', 'checkbox', 'radio', 'number');--> statement-breakpoint
CREATE TYPE "public"."sex_enum" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"slug" "categories_enum" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "chat_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"chat_room_id" integer NOT NULL,
	"sender_id" integer NOT NULL,
	"message" text NOT NULL,
	"message_type" "chat_message_type_enum" DEFAULT 'text' NOT NULL,
	"order_proposal_id" integer,
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
	"id" integer PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"state_id" integer NOT NULL,
	"state_code" varchar(255) NOT NULL,
	"country_id" integer NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"latitude" numeric(10, 8) NOT NULL,
	"longitude" numeric(11, 8) NOT NULL,
	"flag" smallint DEFAULT 1 NOT NULL,
	"wikiDataId" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"id" integer PRIMARY KEY NOT NULL,
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
	"latitude" numeric(10, 8),
	"longitude" numeric(11, 8),
	"emoji" varchar(5),
	"emoji_u" varchar(25)
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
	"user_id" integer NOT NULL,
	"subcategory_id" integer NOT NULL,
	"city" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "status_enum" DEFAULT 'available' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"shipping_price" integer,
	"is_payable" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "orders_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "orders_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"order_id" integer,
	"item_id" integer,
	"finished_price" integer NOT NULL,
	"order_status" "order_status_enum" DEFAULT 'pending_payment' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders_proposals" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "orders_proposals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_id" integer,
	"user_id" integer,
	"proposal_price" integer NOT NULL,
	"status" "proposal_status_enum" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"buyer_id" integer,
	"seller_id" integer,
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
	"profile_type" "profile_types_enum" DEFAULT 'private' NOT NULL,
	"user_id" integer NOT NULL,
	"fullname" varchar(50) NOT NULL,
	"vat_number" varchar(50),
	"birthday" date,
	"gender" "sex_enum" NOT NULL,
	"city" integer NOT NULL,
	"street_address" text,
	"privacy_policy" boolean DEFAULT false,
	"marketing_policy" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "property_values" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "property_values_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"property_id" integer NOT NULL,
	"name" text NOT NULL,
	"value" "property_values_enum",
	"boolean_value" boolean,
	"numeric_value" integer,
	"icon" text,
	"meta" text
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "properties_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"slug" "properties_enum" NOT NULL,
	"type" "property_types_enum" NOT NULL,
	CONSTRAINT "properties_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"translations" json NOT NULL,
	"wiki_data_id" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shippings_orders" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "shippings_orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"shipping_id" integer,
	"order_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shippings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "shippings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tracking_number" text NOT NULL,
	"tracking_url" text NOT NULL,
	"tracking_status" text NOT NULL,
	"tracking_status_description" text NOT NULL,
	"tracking_status_updated_at" timestamp NOT NULL,
	"shipping_price" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "states" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"country_id" integer NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"state_code" varchar(10),
	"type" varchar(50),
	"latitude" numeric(10, 8),
	"longitude" numeric(11, 8)
);
--> statement-breakpoint
CREATE TABLE "subcategories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subcategories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"slug" "subcategories_enum" NOT NULL,
	"category_id" integer NOT NULL,
	"parent_id" integer DEFAULT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subcategories_slug_unique" UNIQUE("slug")
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
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"region_id" integer NOT NULL,
	"translations" json NOT NULL,
	"wiki_data_id" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_items_favorites" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_items_favorites_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"username" varchar(50) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(30),
	"password" varchar(255) NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"is_banned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chat_room_id_chat_rooms_id_fk" FOREIGN KEY ("chat_room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_order_proposal_id_orders_proposals_id_fk" FOREIGN KEY ("order_proposal_id") REFERENCES "public"."orders_proposals"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "countries" ADD CONSTRAINT "countries_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "countries" ADD CONSTRAINT "countries_subregion_id_sub_regions_id_fk" FOREIGN KEY ("subregion_id") REFERENCES "public"."sub_regions"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "items_images" ADD CONSTRAINT "items_images_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "items_properties_values" ADD CONSTRAINT "items_properties_values_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "items_properties_values" ADD CONSTRAINT "items_properties_values_property_value_id_property_values_id_fk" FOREIGN KEY ("property_value_id") REFERENCES "public"."property_values"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_city_cities_id_fk" FOREIGN KEY ("city") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "orders_items" ADD CONSTRAINT "orders_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "orders_items" ADD CONSTRAINT "orders_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "orders_proposals" ADD CONSTRAINT "orders_proposals_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "orders_proposals" ADD CONSTRAINT "orders_proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_city_cities_id_fk" FOREIGN KEY ("city") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "property_values" ADD CONSTRAINT "property_values_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_username_users_username_fk" FOREIGN KEY ("username") REFERENCES "public"."users"("username") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "shippings_orders" ADD CONSTRAINT "shippings_orders_shipping_id_shippings_id_fk" FOREIGN KEY ("shipping_id") REFERENCES "public"."shippings"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "shippings_orders" ADD CONSTRAINT "shippings_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "states" ADD CONSTRAINT "states_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_parent_id_subcategories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."subcategories"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subcategory_properties" ADD CONSTRAINT "subcategory_properties_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subcategory_properties" ADD CONSTRAINT "subcategory_properties_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "sub_regions" ADD CONSTRAINT "sub_regions_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_items_favorites" ADD CONSTRAINT "user_items_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_items_favorites" ADD CONSTRAINT "user_items_favorites_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "cities_name_idx" ON "cities" USING btree ("name");--> statement-breakpoint
CREATE INDEX "item_id_idx" ON "items_images" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "user_id_idx" ON "items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "city_idx" ON "items" USING btree ("city");--> statement-breakpoint
CREATE INDEX "title_idx" ON "items" USING btree ("title");--> statement-breakpoint
CREATE INDEX "subcategory_id_idx" ON "items" USING btree ("subcategory_id");--> statement-breakpoint
CREATE INDEX "is_payable_idx" ON "items" USING btree ("is_payable");--> statement-breakpoint
CREATE INDEX "published_idx" ON "items" USING btree ("published");--> statement-breakpoint
CREATE INDEX "status_idx" ON "items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "profiles_fullname_idx" ON "profiles" USING btree ("fullname");--> statement-breakpoint
CREATE INDEX "value_id_idx" ON "property_values" USING btree ("value");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_property_per_subcategory" ON "subcategory_properties" USING btree ("property_id","subcategory_id");--> statement-breakpoint
CREATE INDEX "user_favorites_user_id_idx" ON "user_items_favorites" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_favorites_item_id_idx" ON "user_items_favorites" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "user_favorites_unique_user_item_idx" ON "user_items_favorites" USING btree ("user_id","item_id");