CREATE TYPE "public"."condition" AS ENUM('new', 'used', 'damaged');--> statement-breakpoint
CREATE TYPE "public"."delivery_method" AS ENUM('shipping', 'pickup');--> statement-breakpoint
CREATE TYPE "public"."profile_type" AS ENUM('private', 'professional');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('available', 'sold');--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "refresh_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "profiles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"profile_type" "profile_type" NOT NULL,
	"user_id" integer NOT NULL,
	"fullname" varchar(255) NOT NULL,
	"vat_number" varchar(255) NOT NULL,
	"birthday" date,
	"sex" "sex",
	"phone_verified" boolean DEFAULT false,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "birthday_check1" CHECK ("profiles"."profile_type" != 'private' OR "profiles"."birthday" IS NOT NULL),
	CONSTRAINT "sex_check1" CHECK ("profiles"."profile_type" != 'private' OR "profiles"."sex" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subcategories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subcategories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"category_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" serial PRIMARY KEY NOT NULL,
	"region_code" text NOT NULL,
	"region_name" text NOT NULL,
	CONSTRAINT "regions_region_code_unique" UNIQUE("region_code")
);
--> statement-breakpoint
CREATE TABLE "provinces" (
	"id" serial PRIMARY KEY NOT NULL,
	"province_code" text NOT NULL,
	"province_name" text NOT NULL,
	"region_code" text NOT NULL,
	CONSTRAINT "provinces_province_code_unique" UNIQUE("province_code")
);
--> statement-breakpoint
CREATE TABLE "municipalities" (
	"id" serial PRIMARY KEY NOT NULL,
	"municipality_name" text NOT NULL,
	"cap" text NOT NULL,
	"province_code" text NOT NULL,
	"region_code" text NOT NULL,
	"flag_capital" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "items" RENAME COLUMN "content" TO "description";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "created_at" TO "createdAt";--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "price" numeric(10, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "condition" "condition" DEFAULT 'used' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "status" "status" DEFAULT 'available' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "delivery_method" "delivery_method" DEFAULT 'pickup' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "subcategory_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "provinces" ADD CONSTRAINT "provinces_region_code_regions_region_code_fk" FOREIGN KEY ("region_code") REFERENCES "public"."regions"("region_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "municipalities" ADD CONSTRAINT "municipalities_province_code_provinces_province_code_fk" FOREIGN KEY ("province_code") REFERENCES "public"."provinces"("province_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "municipalities" ADD CONSTRAINT "municipalities_region_code_regions_region_code_fk" FOREIGN KEY ("region_code") REFERENCES "public"."regions"("region_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "user_id_idx" ON "items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "title_idx" ON "items" USING btree ("title");--> statement-breakpoint
CREATE INDEX "subcategory_id_idx" ON "items" USING btree ("subcategory_id");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "firstname";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "lastname";