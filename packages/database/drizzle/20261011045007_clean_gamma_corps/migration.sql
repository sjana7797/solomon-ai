ALTER TABLE "messages" ADD COLUMN "reasoning_enc" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "thinking" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "reasoning_ms" integer;