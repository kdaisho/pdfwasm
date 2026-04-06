ALTER TABLE "pdf_documents" RENAME COLUMN "file_path" TO "storage_key";--> statement-breakpoint
ALTER TABLE "pdf_documents" ALTER COLUMN "storage_key" SET DATA TYPE varchar(255);
