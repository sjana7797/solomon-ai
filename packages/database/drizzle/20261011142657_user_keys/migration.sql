CREATE TABLE "user_keys" (
	"user_id" uuid PRIMARY KEY,
	"version" integer DEFAULT 1 NOT NULL,
	"passphrase_wrapped" text NOT NULL,
	"passphrase_salt" text NOT NULL,
	"passphrase_kdf" jsonb NOT NULL,
	"recovery_wrapped" text NOT NULL,
	"recovery_salt" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_keys" ADD CONSTRAINT "user_keys_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;