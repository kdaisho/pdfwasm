import { redirect } from "@sveltejs/kit";
import { resolve } from "$app/paths";
import { listPasskeys, type PasskeySummary } from "$lib/services/passkey";
import type { PageLoad } from "./$types";

export const ssr = false;

export const load: PageLoad = async ({ parent }) => {
	const { user } = await parent();
	if (!user) redirect(307, resolve("/login"));

	try {
		const passkeys = await listPasskeys();
		return { passkeys, loadError: null as string | null };
	} catch (err) {
		return {
			passkeys: [] as PasskeySummary[],
			loadError:
				err instanceof Error
					? err.message
					: "Failed to load your passkeys",
		};
	}
};
