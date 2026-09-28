import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

// Passphrase reset is gone: email-code sign-in on /login is the recovery path.
export const GET: RequestHandler = () => redirect(301, "/login");
