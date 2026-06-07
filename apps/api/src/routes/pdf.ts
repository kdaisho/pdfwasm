import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { mkdir, unlink, writeFile, stat, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { db } from "../db/index.js";
import { pdfDocuments, userPreferences } from "../db/schema.js";
import { authMiddleware } from "../middleware/auth.js";
import {
	MAX_FILE_SIZE,
	PDF_STORAGE_PATH,
	MAX_SUGGEST_PAGES,
} from "../constants.js";
import { suggestSplitPoints } from "../lib/suggestSplits.js";
import type { AuthEnv } from "../types.js";

const pdf = new Hono<AuthEnv>();

pdf.use("/*", authMiddleware);

function sanitizeFilename(raw: string): string {
	const base = basename(raw);
	// Strip control characters and problematic characters for Content-Disposition
	const cleaned = base.replace(/[^\w.\-() ]/g, "_");
	return cleaned || "document.pdf";
}

pdf.post("/upload", async (c) => {
	const userId = c.get("userId");
	const body = await c.req.parseBody();
	const file = body["file"];

	if (!file || !(file instanceof File)) {
		return c.json({ error: "No PDF file provided" }, 400);
	}

	const arrayBuffer = await file.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);

	if (buffer.length > MAX_FILE_SIZE) {
		return c.json(
			{
				error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)} MB`,
			},
			400,
		);
	}

	const type = await fileTypeFromBuffer(buffer);
	if (!type || type.mime !== "application/pdf") {
		return c.json({ error: "File is not a valid PDF" }, 400);
	}

	await mkdir(PDF_STORAGE_PATH, { recursive: true });

	const storageKey = `${randomUUID()}.pdf`;

	await writeFile(join(PDF_STORAGE_PATH, storageKey), buffer);

	const safeFilename = sanitizeFilename(file.name);

	const [doc] = await db
		.insert(pdfDocuments)
		.values({
			userId,
			filename: safeFilename,
			storageKey,
			fileSize: buffer.length,
		})
		.returning();

	return c.json(
		{
			id: doc.id,
			filename: doc.filename,
			fileSize: doc.fileSize,
			uploadedAt: doc.uploadedAt,
		},
		201,
	);
});

pdf.get("/list", async (c) => {
	const userId = c.get("userId");

	const docs = await db
		.select({
			id: pdfDocuments.id,
			filename: pdfDocuments.filename,
			fileSize: pdfDocuments.fileSize,
			pageCount: pdfDocuments.pageCount,
			uploadedAt: pdfDocuments.uploadedAt,
		})
		.from(pdfDocuments)
		.where(eq(pdfDocuments.userId, userId))
		.orderBy(pdfDocuments.uploadedAt);

	return c.json({ documents: docs });
});

pdf.get("/download/:id", async (c) => {
	const userId = c.get("userId");
	const docId = c.req.param("id");

	const [doc] = await db
		.select()
		.from(pdfDocuments)
		.where(and(eq(pdfDocuments.id, docId), eq(pdfDocuments.userId, userId)))
		.limit(1);

	if (!doc) {
		return c.json({ error: "Document not found" }, 404);
	}

	const fullPath = join(PDF_STORAGE_PATH, doc.storageKey);
	const fileStats = await stat(fullPath).catch(() => null);
	if (!fileStats) {
		return c.json({ error: "File not found on disk" }, 404);
	}

	const fileBuffer = await readFile(fullPath);

	return c.body(fileBuffer, 200, {
		"Content-Type": "application/pdf",
		"Content-Disposition": `attachment; filename="${doc.filename}"`,
		"Content-Length": fileStats.size.toString(),
	});
});

pdf.put("/last", async (c) => {
	const userId = c.get("userId");
	const { pdfId } = await c.req.json();

	if (pdfId) {
		// Verify the PDF belongs to this user
		const [doc] = await db
			.select({ id: pdfDocuments.id })
			.from(pdfDocuments)
			.where(
				and(
					eq(pdfDocuments.id, pdfId),
					eq(pdfDocuments.userId, userId),
				),
			)
			.limit(1);

		if (!doc) {
			return c.json({ error: "Document not found" }, 404);
		}
	}

	await db
		.insert(userPreferences)
		.values({ userId, lastPdfId: pdfId || null })
		.onConflictDoUpdate({
			target: userPreferences.userId,
			set: { lastPdfId: pdfId || null },
		});

	return c.json({ ok: true });
});

pdf.delete("/:id", async (c) => {
	const userId = c.get("userId");
	const docId = c.req.param("id");

	const [doc] = await db
		.select()
		.from(pdfDocuments)
		.where(and(eq(pdfDocuments.id, docId), eq(pdfDocuments.userId, userId)))
		.limit(1);

	if (!doc) {
		return c.json({ error: "Document not found" }, 404);
	}

	await unlink(join(PDF_STORAGE_PATH, doc.storageKey)).catch(() => {});

	await db.delete(pdfDocuments).where(eq(pdfDocuments.id, docId));

	return c.json({ success: true });
});

pdf.post("/suggest-splits", async (c) => {
	if (!process.env.ANTHROPIC_API_KEY) {
		return c.json(
			{ error: "AI suggestions are not configured on the server" },
			503,
		);
	}

	const body = await c.req.json().catch(() => null);
	const rawPages = body?.pages;
	if (!Array.isArray(rawPages)) {
		return c.json({ error: "Invalid request: pages[] required" }, 400);
	}
	if (rawPages.length > MAX_SUGGEST_PAGES) {
		return c.json(
			{ error: `Too many pages (max ${MAX_SUGGEST_PAGES})` },
			413,
		);
	}

	const pages = rawPages
		.filter(
			(p) =>
				p && Number.isInteger(p.position) && typeof p.text === "string",
		)
		.map((p) => ({
			position: p.position as number,
			text: p.text as string,
		}));

	// Nothing to segment, or no text to reason over.
	if (pages.length < 2 || pages.every((p) => p.text.trim() === "")) {
		return c.json({ splitAfter: [] });
	}

	try {
		const splitAfter = await suggestSplitPoints(pages);
		return c.json({ splitAfter });
	} catch (err) {
		console.error("suggest-splits failed:", err);
		return c.json({ error: "Suggestion failed" }, 502);
	}
});

export default pdf;
