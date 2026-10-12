import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { crc32 } from "node:zlib";
import { readdir, rm } from "node:fs/promises";

// Uploads are written to disk, so point storage at a throwaway directory
// before the route module reads PDF_STORAGE_PATH.
const storageDir = await vi.hoisted(async () => {
	const { mkdtemp } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const dir = await mkdtemp(join(tmpdir(), "pdfwasm-uploads-"));
	process.env.PDF_STORAGE_PATH = dir;
	return dir;
});

vi.mock("../db/index.js", () => import("../test/pglite.js"));

import { db } from "../db/index.js";
import { pdfDocuments, users } from "../db/schema.js";
import { createSession } from "../lib/session.js";
import { MAX_FILE_SIZE, SESSION_COOKIE_NAME } from "../constants.js";
import pdfRoutes from "./pdf.js";

const app = new Hono().route("/api/pdfs", pdfRoutes);

let cookie = "";
let userId = "";

/**
 * Minimal zip writer (stored entries, no compression), so EPUB fixtures can
 * be built without pulling a zip library into the API package. Entries are
 * written in the order given; an EPUB's `mimetype` must come first.
 */
function zip(entries: Record<string, string>): Uint8Array {
	const encoder = new TextEncoder();
	const locals: Buffer[] = [];
	const centrals: Buffer[] = [];
	let offset = 0;
	for (const [path, content] of Object.entries(entries)) {
		const name = encoder.encode(path);
		const data = encoder.encode(content);
		const crc = crc32(data);

		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4); // version needed
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(data.length, 18); // compressed size
		local.writeUInt32LE(data.length, 22); // uncompressed size
		local.writeUInt16LE(name.length, 26);
		const localEntry = Buffer.concat([local, name, data]);

		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4); // version made by
		central.writeUInt16LE(20, 6); // version needed
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(data.length, 20);
		central.writeUInt32LE(data.length, 24);
		central.writeUInt16LE(name.length, 28);
		central.writeUInt32LE(offset, 42); // local header offset
		centrals.push(Buffer.concat([central, name]));

		locals.push(localEntry);
		offset += localEntry.length;
	}
	const directory = Buffer.concat(centrals);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(centrals.length, 8);
	end.writeUInt16LE(centrals.length, 10);
	end.writeUInt32LE(directory.length, 12);
	end.writeUInt32LE(offset, 16);
	return new Uint8Array(Buffer.concat([...locals, directory, end]));
}

const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
	<rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

function epub(mimetype = "application/epub+zip"): Uint8Array {
	return zip({
		mimetype,
		"META-INF/container.xml": CONTAINER,
		"content.opf": "<package/>",
	});
}

const PDF = new TextEncoder().encode(
	"%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n",
);

function upload(bytes: Uint8Array, filename: string, type = "") {
	const form = new FormData();
	form.append("file", new File([bytes], filename, { type }));
	return app.request("/api/pdfs/upload", {
		method: "POST",
		body: form,
		headers: { Cookie: cookie },
	});
}

function get(path: string) {
	return app.request(`/api/pdfs${path}`, { headers: { Cookie: cookie } });
}

beforeEach(async () => {
	await db.delete(users); // cascades to sessions and documents
	const [user] = await db
		.insert(users)
		.values({ email: "reader@example.com" })
		.returning();
	userId = user.id;
	cookie = `${SESSION_COOKIE_NAME}=${await createSession(user.id)}`;
});

afterAll(async () => {
	await rm(storageDir, { recursive: true, force: true });
});

describe("upload", () => {
	it("stores a PDF and reports its type", async () => {
		const res = await upload(PDF, "report.pdf", "application/pdf");

		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body).toMatchObject({
			filename: "report.pdf",
			fileSize: PDF.length,
			documentType: "pdf",
		});
		const [row] = await db.select().from(pdfDocuments);
		expect(row.documentType).toBe("pdf");
		expect(row.storageKey).toMatch(/\.pdf$/);
	});

	it("stores an EPUB identified by its mimetype entry", async () => {
		const bytes = epub();
		// No extension or MIME hint: the content alone identifies it.
		const res = await upload(bytes, "book", "");

		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body).toMatchObject({ filename: "book", documentType: "epub" });
		const [row] = await db.select().from(pdfDocuments);
		expect(row.documentType).toBe("epub");
		expect(row.storageKey).toMatch(/\.epub$/);
		expect(await readdir(storageDir)).toContain(row.storageKey);
	});

	it("rejects a zip that isn't an EPUB, even when named .epub", async () => {
		const res = await upload(
			zip({ "notes.txt": "hello" }),
			"fake.epub",
			"application/epub+zip",
		);

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({
			error: "File is not a valid PDF or EPUB",
		});
		expect(await db.select().from(pdfDocuments)).toEqual([]);
	});

	it("rejects a zip whose mimetype names another format", async () => {
		const res = await upload(
			epub("application/vnd.oasis.opendocument.text"),
			"letter.epub",
		);

		expect(res.status).toBe(400);
		expect(await db.select().from(pdfDocuments)).toEqual([]);
	});

	it("applies the size limit to EPUBs", async () => {
		const bytes = zip({
			mimetype: "application/epub+zip",
			"OEBPS/big.txt": "x".repeat(MAX_FILE_SIZE),
		});

		const res = await upload(bytes, "huge.epub");

		expect(res.status).toBe(400);
		expect((await res.json()).error).toMatch(/too large/i);
		expect(await db.select().from(pdfDocuments)).toEqual([]);
	});
});

describe("list", () => {
	it("returns each document's type, defaulting to PDF", async () => {
		// Inserted without a type, like rows that predate EPUB support.
		await db.insert(pdfDocuments).values({
			userId,
			filename: "old.pdf",
			storageKey: "old.pdf",
			fileSize: 1,
		});
		await upload(epub(), "novel.epub");

		const res = await get("/list");

		expect(res.status).toBe(200);
		const { documents } = await res.json();
		expect(
			documents.map((d: { filename: string; documentType: string }) => [
				d.filename,
				d.documentType,
			]),
		).toEqual([
			["old.pdf", "pdf"],
			["novel.epub", "epub"],
		]);
	});
});

describe("download", () => {
	it("serves an EPUB with the EPUB content type", async () => {
		const bytes = epub();
		const { id } = await (await upload(bytes, "novel.epub")).json();

		const res = await get(`/download/${id}`);

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("application/epub+zip");
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
	});

	it("serves a PDF with the PDF content type", async () => {
		const { id } = await (await upload(PDF, "report.pdf")).json();

		const res = await get(`/download/${id}`);

		expect(res.headers.get("Content-Type")).toBe("application/pdf");
	});
});
