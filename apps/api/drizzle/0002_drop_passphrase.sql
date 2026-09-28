ALTER TABLE "email_verifications" DROP COLUMN "verified_at";--> statement-breakpoint
ALTER TABLE "email_verifications" DROP COLUMN "verified_token";--> statement-breakpoint
ALTER TABLE "email_verifications" DROP COLUMN "passphrase_hash";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "passphrase_hash";