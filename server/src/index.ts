import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import authRoutes from "./routes/auth.js";
import pdfRoutes from "./routes/pdf.js";

const app = new Hono();

app.use("*", logger());
app.use(
	"*",
	cors({
		origin: "http://localhost:5173",
		credentials: true,
	}),
);

app.get("/api/health", (c) => c.json({ status: "ok" }));
app.route("/api/auth", authRoutes);
app.route("/api/pdfs", pdfRoutes);

const port = Number(process.env.PORT) || 3001;

serve({ fetch: app.fetch, port }, () => {
	console.info(`Server running on http://localhost:${port}`);
});
