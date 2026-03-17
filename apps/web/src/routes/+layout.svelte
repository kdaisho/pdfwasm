<script lang="ts">
	import "../app.css";
	import { untrack } from "svelte";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { Navigation } from "@skeletonlabs/skeleton-svelte";
	import { getAuth } from "$lib/stores/auth.svelte.js";
	import { sidebarStore } from "$lib/stores/sidebar.svelte.js";

	let { data, children } = $props();

	const auth = getAuth();
	// untrack: we intentionally read the initial server value once, not reactively
	auth.initialize(untrack(() => data.user));
</script>

<div class="flex h-screen">
	<Navigation layout="sidebar">
		<Navigation.Header>
			<div class="p-4">
				<h1 class="text-lg font-bold">PDF Viewer</h1>
			</div>
		</Navigation.Header>
		<Navigation.Content>
			{#if sidebarStore.component}
				{@const SidebarComp = sidebarStore.component}
				<SidebarComp {...sidebarStore.props} />
			{/if}
		</Navigation.Content>
		<Navigation.Footer>
			<div class="p-4 border-t border-surface-200">
				{#if auth.isAuthenticated}
					<p class="text-sm text-surface-500 truncate mb-2">
						{auth.user?.email}
					</p>
					<button
						class="btn preset-filled text-sm w-full"
						onclick={async () => {
							await auth.logout();
							goto(resolve("/"));
						}}
					>
						Log Out
					</button>
				{:else}
					<div class="flex flex-col gap-2">
						<a
							href={resolve("/login")}
							class="btn preset-outlined text-sm w-full"
						>
							Log In
						</a>
						<a
							href={resolve("/signup")}
							class="btn preset-filled text-sm w-full"
						>
							Sign Up
						</a>
					</div>
				{/if}
			</div>
		</Navigation.Footer>
	</Navigation>
	<main class="flex-1 overflow-hidden">
		{@render children()}
	</main>
</div>
