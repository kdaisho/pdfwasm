import {
	pgTable,
	uuid,
	varchar,
	text,
	timestamp,
	integer,
	bigint,
	boolean,
	customType,
	index,
} from "drizzle-orm/pg-core";

// postgres-js hands bytea back as a Buffer; normalise to a plain Uint8Array,
// which is what @simplewebauthn/server expects for credential public keys.
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
	dataType() {
		return "bytea";
	},
	fromDriver(value) {
		return new Uint8Array(value);
	},
});

export const users = pgTable("users", {
	id: uuid("id").defaultRandom().primaryKey(),
	email: varchar("email", { length: 255 }).notNull().unique(),
	// WebAuthn user handle: a stable random ID handed to authenticators instead
	// of the DB id or email. Passkey sign-in checks it against the assertion.
	webauthnUserId: uuid("webauthn_user_id").defaultRandom().notNull().unique(),
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
	type: varchar("type", { length: 20 }).notNull(), // 'signup' | 'sign_in'
	attempts: integer("attempts").default(0).notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const pdfDocuments = pgTable("pdf_documents", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	filename: varchar("filename", { length: 255 }).notNull(),
	storageKey: varchar("storage_key", { length: 255 }).notNull(),
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

export const passkeys = pgTable(
	"passkeys",
	{
		// Base64URL credential ID, as returned by @simplewebauthn/server
		id: text("id").primaryKey(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		publicKey: bytea("public_key").notNull(),
		// WebAuthn signature counters are uint32, which overflows Postgres integer
		counter: bigint("counter", { mode: "number" }).default(0).notNull(),
		deviceType: varchar("device_type", { length: 32 }).notNull(), // 'singleDevice' | 'multiDevice'
		backedUp: boolean("backed_up").notNull(),
		transports: text("transports").array(),
		name: varchar("name", { length: 64 }).default("Passkey").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		lastUsedAt: timestamp("last_used_at"),
	},
	(table) => [index("passkeys_user_id_idx").on(table.userId)],
);

// Pending WebAuthn challenges. The row ID lives in a short-lived HttpOnly
// cookie so passkey sign-in can find its challenge before the user is known.
export const webauthnChallenges = pgTable("webauthn_challenges", {
	id: uuid("id").defaultRandom().primaryKey(),
	challenge: varchar("challenge", { length: 255 }).notNull(),
	type: varchar("type", { length: 20 }).notNull(), // 'registration' | 'authentication'
	// Set for registration only: the session user the challenge was issued to
	userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});
