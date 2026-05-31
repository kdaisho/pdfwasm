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

<div class="flex h-screen bg-[#fafaf9]">
	<Navigation layout="sidebar">
		<Navigation.Header>
			<div class="px-4 pt-5 pb-3">
				<div class="flex items-center gap-2">
					<div
						class="w-[30px] h-[30px] rounded-lg flex items-center justify-center"
						style="background: linear-gradient(135deg, #6366f1, #818cf8)"
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 14 14"
							fill="none"
							aria-hidden="true"
						>
							<rect
								x="2"
								y="1"
								width="8"
								height="11"
								rx="1.5"
								stroke="white"
								stroke-width="1.5"
							/>
							<path
								d="M5 5h4M5 7.5h3"
								stroke="rgba(255,255,255,0.7)"
								stroke-width="1.2"
								stroke-linecap="round"
							/>
						</svg>
					</div>
					<span
						class="font-bold text-[13px] tracking-tight text-[#1c1917]"
						>PDF Viewer</span
					>
				</div>
			</div>
			<div class="mx-4 h-px bg-[#e7e5e4]"></div>
		</Navigation.Header>
		<Navigation.Content>
			{#if sidebarStore.component}
				{@const SidebarComp = sidebarStore.component}
				<SidebarComp {...sidebarStore.props} />
			{/if}
		</Navigation.Content>
		<Navigation.Footer>
			<div class="p-4 border-t border-[#e7e5e4]">
				{#if auth.isAuthenticated}
					<p class="text-[11px] text-[#a8a29e] truncate mb-2">
						{auth.user?.email}
					</p>
					<button
						class="w-full py-[7px] rounded-lg border border-[#e7e5e4] bg-white text-[#78716c] text-[12px] font-medium hover:bg-[#f5f5f4] transition-colors"
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
							class="w-full py-[7px] rounded-lg border border-[#e7e5e4] bg-white text-[#78716c] text-[12px] font-medium text-center hover:bg-[#f5f5f4] transition-colors"
						>
							Log In
						</a>
						<a
							href={resolve("/signup")}
							class="w-full py-[7px] rounded-lg border-none text-white text-[12px] font-medium text-center"
							style="background: linear-gradient(135deg, #6366f1, #818cf8)"
						>
							Sign Up
						</a>
					</div>
				{/if}
			</div>
		</Navigation.Footer>
	</Navigation>
	<main class="flex-1 overflow-y-auto bg-[#fafaf9]">
		{@render children()}
	</main>
</div>
