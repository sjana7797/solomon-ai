ALTER TABLE "messages" ADD COLUMN "web_search" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sources_enc" text;