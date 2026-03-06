CREATE TABLE IF NOT EXISTS "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"last_pdf_id" uuid
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_last_pdf_id_pdf_documents_id_fk" FOREIGN KEY ("last_pdf_id") REFERENCES "public"."pdf_documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
