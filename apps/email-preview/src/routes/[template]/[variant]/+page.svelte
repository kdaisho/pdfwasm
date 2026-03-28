<script lang="ts">
	import { invalidateAll } from "$app/navigation";

	let { data } = $props();

	if (import.meta.hot) {
		import.meta.hot.on("vite:afterUpdate", () => {
			invalidateAll();
		});
	}
</script>

<div style="padding: 16px;">
	<h1 style="margin: 0 0 16px; font-size: 18px; font-family: system-ui, sans-serif;">
		{data.label} — {data.variant}
	</h1>

	<iframe
		srcdoc={data.html}
		title="Email preview"
		style="border: 1px solid #e5e5e5; border-radius: 8px; width: 100%; max-width: 640px; height: 80vh;"
	></iframe>
</div>
