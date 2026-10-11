CREATE TYPE "document_kind" AS ENUM('web', 'upload');--> statement-breakpoint
CREATE TYPE "document_status" AS ENUM('processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"document_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"content_enc" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"tsv" tsvector NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"kind" "document_kind" NOT NULL,
	"owner_id" uuid,
	"url" text,
	"title_enc" text NOT NULL,
	"mime_type" text,
	"size_bytes" integer,
	"status" "document_status" DEFAULT 'processing'::"document_status" NOT NULL,
	"error" text,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"dek_wrapped" text NOT NULL,
	"dek_key_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "chunks_document_idx" ON "chunks" ("document_id","ordinal");--> statement-breakpoint
CREATE INDEX "chunks_embedding_hnsw_idx" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "chunks_tsv_idx" ON "chunks" USING gin ("tsv");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_web_url_idx" ON "documents" ("url") WHERE "kind" = 'web';--> statement-breakpoint
CREATE INDEX "documents_owner_idx" ON "documents" ("owner_id","created_at");--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_document_id_documents_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE;