import {
	pgTable,
	uuid,
	varchar,
	timestamp,
	integer,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
	id: uuid("id").defaultRandom().primaryKey(),
	email: varchar("email", { length: 255 }).notNull().unique(),
	passwordHash: varchar("password_hash", { length: 255 }).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const pdfDocuments = pgTable("pdf_documents", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	filename: varchar("filename", { length: 255 }).notNull(),
	filePath: varchar("file_path", { length: 1024 }).notNull(),
	fileSize: integer("file_size").notNull(),
	pageCount: integer("page_count"),
	uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});
