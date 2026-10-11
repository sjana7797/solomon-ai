CREATE TYPE "message_role" AS ENUM('system', 'user', 'assistant');--> statement-breakpoint
CREATE TYPE "message_status" AS ENUM('done', 'stopped', 'error');--> statement-breakpoint
CREATE TABLE "chats" (
	"id" uuid PRIMARY KEY,
	"owner_id" uuid NOT NULL,
	"title_enc" text NOT NULL,
	"model" text NOT NULL,
	"dek_wrapped" text NOT NULL,
	"dek_key_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY,
	"chat_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"status" "message_status" NOT NULL,
	"content_enc" text NOT NULL,
	"model" text,
	"error" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "chats_owner_updated_idx" ON "chats" ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "messages_chat_created_idx" ON "messages" ("chat_id","created_at");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_chats_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE;