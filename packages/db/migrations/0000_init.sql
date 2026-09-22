CREATE TYPE "public"."analysis_source" AS ENUM('browser', 'server');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('pending', 'uploading', 'uploaded', 'analyzing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('pdf', 'docx', 'doc', 'pptx', 'ppt', 'image');--> statement-breakpoint
CREATE TABLE "binding_rate_bands" (
	"price_list_version" integer NOT NULL,
	"binding_type_id" text NOT NULL,
	"min_sheets" integer NOT NULL,
	"max_sheets" integer NOT NULL,
	"price_rials" bigint NOT NULL,
	CONSTRAINT "binding_rate_bands_price_list_version_binding_type_id_min_sheets_pk" PRIMARY KEY("price_list_version","binding_type_id","min_sheets")
);
--> statement-breakpoint
CREATE TABLE "binding_types" (
	"price_list_version" integer NOT NULL,
	"id" text NOT NULL,
	"name_fa" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"max_sheets_per_volume" integer NOT NULL,
	"weight_per_volume_grams" integer NOT NULL,
	CONSTRAINT "binding_types_price_list_version_id_pk" PRIMARY KEY("price_list_version","id")
);
--> statement-breakpoint
CREATE TABLE "document_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"source" "analysis_source" NOT NULL,
	"engine" text NOT NULL,
	"thresholds" jsonb NOT NULL,
	"page_count" integer NOT NULL,
	"sampled" boolean DEFAULT false NOT NULL,
	"sample_stride" integer DEFAULT 1 NOT NULL,
	"elapsed_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_pages" (
	"analysis_id" uuid NOT NULL,
	"n" integer NOT NULL,
	"width_pt" real NOT NULL,
	"height_pt" real NOT NULL,
	"rotation" smallint DEFAULT 0 NOT NULL,
	"color" boolean NOT NULL,
	"blank" boolean DEFAULT false NOT NULL,
	"color_ratio" double precision NOT NULL,
	"colored_ink_ratio" double precision NOT NULL,
	"chroma_p95" double precision NOT NULL,
	"ink_ratio" double precision NOT NULL,
	"paper_cast" jsonb NOT NULL,
	"estimated_dpi" real,
	"min_margin_mm" real,
	"warnings" text[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "document_pages_analysis_id_n_pk" PRIMARY KEY("analysis_id","n")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"file_expires_at" timestamp with time zone,
	"file_deleted_at" timestamp with time zone,
	"original_name" text NOT NULL,
	"source_kind" "source_kind" NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"storage_key" text,
	"status" "document_status" DEFAULT 'pending' NOT NULL,
	"page_count" integer,
	"failure_reason" text
);
--> statement-breakpoint
CREATE TABLE "paper_types" (
	"price_list_version" integer NOT NULL,
	"id" text NOT NULL,
	"name_fa" text NOT NULL,
	"gsm" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"rate_per_sheet_rials" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "paper_types_price_list_version_id_pk" PRIMARY KEY("price_list_version","id")
);
--> statement-breakpoint
CREATE TABLE "price_lists" (
	"version" integer PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"click_rate_color_rials" bigint NOT NULL,
	"click_rate_bw_rials" bigint NOT NULL,
	"settings" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_methods" (
	"price_list_version" integer NOT NULL,
	"id" text NOT NULL,
	"name_fa" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "shipping_methods_price_list_version_id_pk" PRIMARY KEY("price_list_version","id")
);
--> statement-breakpoint
CREATE TABLE "shipping_rates" (
	"price_list_version" integer NOT NULL,
	"method_id" text NOT NULL,
	"zone_id" text NOT NULL,
	"min_weight_grams" integer NOT NULL,
	"max_weight_grams" integer,
	"price_rials" bigint NOT NULL,
	CONSTRAINT "shipping_rates_price_list_version_method_id_zone_id_min_weight_grams_pk" PRIMARY KEY("price_list_version","method_id","zone_id","min_weight_grams")
);
--> statement-breakpoint
ALTER TABLE "binding_rate_bands" ADD CONSTRAINT "binding_rate_bands_binding_type_fk" FOREIGN KEY ("price_list_version","binding_type_id") REFERENCES "public"."binding_types"("price_list_version","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "binding_types" ADD CONSTRAINT "binding_types_price_list_version_price_lists_version_fk" FOREIGN KEY ("price_list_version") REFERENCES "public"."price_lists"("version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_analyses" ADD CONSTRAINT "document_analyses_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_analysis_id_document_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."document_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_types" ADD CONSTRAINT "paper_types_price_list_version_price_lists_version_fk" FOREIGN KEY ("price_list_version") REFERENCES "public"."price_lists"("version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_methods" ADD CONSTRAINT "shipping_methods_price_list_version_price_lists_version_fk" FOREIGN KEY ("price_list_version") REFERENCES "public"."price_lists"("version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_method_fk" FOREIGN KEY ("price_list_version","method_id") REFERENCES "public"."shipping_methods"("price_list_version","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "binding_rate_bands_lookup" ON "binding_rate_bands" USING btree ("price_list_version","binding_type_id");--> statement-breakpoint
CREATE INDEX "document_analyses_document" ON "document_analyses" USING btree ("document_id","source");--> statement-breakpoint
CREATE INDEX "documents_status" ON "documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "documents_file_expiry" ON "documents" USING btree ("file_expires_at");--> statement-breakpoint
CREATE INDEX "shipping_rates_lookup" ON "shipping_rates" USING btree ("price_list_version","method_id","zone_id");