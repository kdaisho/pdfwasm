<script lang="ts">
	import "../app.css";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { getAuth } from "$lib/stores/auth.svelte.js";

	let { children } = $props();

	const auth = getAuth();

	const publicPaths = ["/login", "/signup", "/reset-password"];

	onMount(() => {
		auth.initAuth();
	});

	$effect(() => {
		if (auth.initialized && !auth.isAuthenticated) {
			const path = page.url.pathname;
			if (!publicPaths.includes(path)) {
				goto(resolve("/login"));
			}
		}
	});
</script>

{#if !auth.initialized}
	<div
		class="flex items-center justify-center h-screen text-lg text-surface-500"
	>
		Loading…
	</div>
{:else if auth.isAuthenticated}
	<nav
		class="flex items-center justify-between px-4 py-2 border-b border-surface-200"
	>
		<span class="text-sm text-surface-500">{auth.user?.email}</span>
		<button
			class="btn preset-filled text-sm"
			onclick={async () => {
				await auth.logout();
				goto(resolve("/login"));
			}}
		>
			Log Out
		</button>
	</nav>
	{@render children()}
{:else}
	{@render children()}
{/if}
