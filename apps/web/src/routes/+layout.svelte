<script lang="ts">
	import "../app.css";
	import { untrack } from "svelte";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { getAuth } from "$lib/stores/auth.svelte.js";

	let { data, children } = $props();

	const auth = getAuth();
	// untrack: we intentionally read the initial server value once, not reactively
	auth.initialize(untrack(() => data.user));
</script>

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
