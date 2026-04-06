import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { mkdir, unlink, writeFile, stat, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { db } from "../db/index.js";
import { pdfDocuments, userPreferences } from "../db/schema.js";
import { authMiddleware } from "../middleware/auth.js";
import { MAX_FILE_SIZE, PDF_STORAGE_PATH } from "../constants.js";
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

	const fileId = randomUUID();
	const filePath = join(PDF_STORAGE_PATH, `${fileId}.pdf`);

	await writeFile(filePath, buffer);

	const safeFilename = sanitizeFilename(file.name);

	const [doc] = await db
		.insert(pdfDocuments)
		.values({
			userId,
			filename: safeFilename,
			filePath,
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

	const fileStats = await stat(doc.filePath).catch(() => null);
	if (!fileStats) {
		return c.json({ error: "File not found on disk" }, 404);
	}

	const fileBuffer = await readFile(doc.filePath);

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

	await unlink(doc.filePath).catch(() => {});

	await db.delete(pdfDocuments).where(eq(pdfDocuments.id, docId));

	return c.json({ success: true });
});

export default pdf;
