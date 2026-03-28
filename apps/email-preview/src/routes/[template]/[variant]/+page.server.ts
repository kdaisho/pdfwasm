import { error } from "@sveltejs/kit";
import { render } from "hibachi";
import { templates } from "$lib/registry";

export function load({ params }) {
	const entry = templates[params.template];
	if (!entry) error(404, "Template not found");

	const props = entry.variants[params.variant];
	if (!props) error(404, "Variant not found");

	const html = render({ template: entry.component, props });

	return {
		html,
		templateSlug: params.template,
		variant: params.variant,
		label: entry.label,
	};
}
