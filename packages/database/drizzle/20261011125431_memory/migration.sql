CREATE TABLE "chat_summaries" (
	"chat_id" uuid PRIMARY KEY,
	"summary_enc" text NOT NULL,
	"covered_messages" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" uuid NOT NULL,
	"content_enc" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"embedding" vector(768) NOT NULL,
	"source_chat_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_profiles" (
	"owner_id" uuid PRIMARY KEY,
	"enabled" boolean DEFAULT true NOT NULL,
	"dek_wrapped" text NOT NULL,
	"dek_key_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "memories_owner_idx" ON "memories" ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "memories_embedding_hnsw_idx" ON "memories" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
ALTER TABLE "chat_summaries" ADD CONSTRAINT "chat_summaries_chat_id_chats_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_owner_id_memory_profiles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "memory_profiles"("owner_id") ON DELETE CASCADE;