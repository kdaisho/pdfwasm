<script lang="ts">
	import "../app.css";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { getAuth } from "$lib/stores/auth.svelte.js";

	let { children } = $props();

	const auth = getAuth();

	onMount(() => {
		auth.initAuth();
	});
</script>

{#if !auth.initialized}
	<div
		class="flex items-center justify-center h-screen text-lg text-surface-500"
	>
		Loading…
	</div>
{:else}
	<nav
		class="flex items-center justify-between px-4 py-2 border-b border-surface-200"
	>
		{#if auth.isAuthenticated}
			<span class="text-sm text-surface-500">{auth.user?.email}</span>
			<button
				class="btn preset-filled text-sm"
				onclick={async () => {
					await auth.logout();
					goto(resolve("/"));
				}}
			>
				Log Out
			</button>
		{:else}
			<span></span>
			<div class="flex items-center gap-2">
				<a href={resolve("/login")} class="btn preset-outlined text-sm"
					>Log In</a
				>
				<a href={resolve("/signup")} class="btn preset-filled text-sm"
					>Sign Up</a
				>
			</div>
		{/if}
	</nav>
	{@render children()}
{/if}
