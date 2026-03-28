<script lang="ts">
	import { templates } from "$lib/registry";
	import { page } from "$app/state";

	let { children } = $props();
</script>

<div style="display: flex; height: 100vh; font-family: system-ui, sans-serif;">
	<nav
		style="width: 240px; border-right: 1px solid #e5e5e5; padding: 16px; overflow-y: auto; background: #fafafa;"
	>
		<h2 style="margin: 0 0 16px; font-size: 14px; text-transform: uppercase; color: #888;">
			Email Templates
		</h2>

		{#each Object.entries(templates) as [slug, entry]}
			<div style="margin-bottom: 16px;">
				<div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">{entry.label}</div>
				{#each Object.keys(entry.variants) as variant}
					{@const href = `/${slug}/${variant}`}
					{@const active = page.url.pathname === href}
					<a
						{href}
						style="display: block; padding: 4px 8px; border-radius: 4px; text-decoration: none; font-size: 13px; color: {active
							? '#fff'
							: '#333'}; background: {active ? '#333' : 'transparent'};"
					>
						{variant}
					</a>
				{/each}
			</div>
		{/each}
	</nav>

	<main style="flex: 1; overflow: auto;">
		{@render children()}
	</main>
</div>
