import { redirect } from "@sveltejs/kit";
import { templates } from "$lib/registry";

export function load() {
	const firstTemplate = Object.keys(templates)[0];
	const firstVariant = Object.keys(templates[firstTemplate].variants)[0];
	redirect(302, `/${firstTemplate}/${firstVariant}`);
}
