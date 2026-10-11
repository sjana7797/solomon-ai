CREATE TABLE "generated_images" (
	"id" uuid PRIMARY KEY,
	"owner_id" uuid NOT NULL,
	"chat_id" uuid,
	"message_id" uuid,
	"model" text NOT NULL,
	"prompt_enc" text NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"seed" integer,
	"data_enc" bytea NOT NULL,
	"dek_wrapped" text NOT NULL,
	"dek_key_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "generated_images_owner_idx" ON "generated_images" ("owner_id","created_at");