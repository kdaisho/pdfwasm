import type { Handle } from "@sveltejs/kit";
import { SESSION_COOKIE_NAME } from "@pdfwasm/shared/constants";

export const handle: Handle = async ({ event, resolve }) => {
	const sessionToken = event.cookies.get(SESSION_COOKIE_NAME);

	if (sessionToken) {
		try {
			const apiUrl = import.meta.env.VITE_API_URL;
			const res = await fetch(`${apiUrl}/auth/me`, {
				headers: { Cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` },
			});
			if (res.ok) {
				const body = await res.json();
				event.locals.user = body.user;
			} else {
				event.locals.user = null;
			}
		} catch {
			event.locals.user = null;
		}
	} else {
		event.locals.user = null;
	}

	return resolve(event);
};
