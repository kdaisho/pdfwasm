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
	passphraseHash: varchar("passphrase_hash", { length: 255 }).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const emailVerifications = pgTable("email_verifications", {
	id: uuid("id").defaultRandom().primaryKey(),
	email: varchar("email", { length: 255 }).notNull(),
	otpHash: varchar("otp_hash", { length: 255 }).notNull(),
	type: varchar("type", { length: 20 }).notNull(), // 'signup' | 'password_reset'
	attempts: integer("attempts").default(0).notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	verifiedAt: timestamp("verified_at"),
	verifiedToken: uuid("verified_token"),
	passphraseHash: varchar("passphrase_hash", { length: 255 }),
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

export const userPreferences = pgTable("user_preferences", {
	userId: uuid("user_id")
		.primaryKey()
		.references(() => users.id, { onDelete: "cascade" }),
	lastPdfId: uuid("last_pdf_id").references(() => pdfDocuments.id, {
		onDelete: "set null",
	}),
});
