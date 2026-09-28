<script lang="ts">
	import { onMount, untrack } from "svelte";
	import { Dialog, Portal } from "@skeletonlabs/skeleton-svelte";
	import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
	import { getAuth } from "$lib/stores/auth.svelte.js";
	import { toaster } from "$lib/stores/toaster";
	import {
		deletePasskey,
		passkeyRegistrationError,
		registerPasskey,
		renamePasskey,
		type PasskeySummary,
	} from "$lib/services/passkey";
	import { formatDate } from "$lib/utils/format";

	let { data } = $props();

	const auth = getAuth();

	// data.passkeys is the load snapshot; keep a local copy so edits update the
	// list. The page remounts on every navigation, so seeding once is intended.
	let passkeys = $state<PasskeySummary[]>(untrack(() => data.passkeys));
	let error = $state<string | null>(null);

	// Resolved on the client only, so SSR and hydration render the same markup
	let supported = $state(false);
	let adding = $state(false);

	let renamingId = $state<string | null>(null);
	let draftName = $state("");
	let saving = $state(false);

	// Kept after the dialog closes so its text doesn't vanish mid-animation
	let deleteTarget = $state<PasskeySummary | null>(null);
	let deleteOpen = $state(false);
	let deleting = $state(false);

	onMount(() => {
		supported = browserSupportsWebAuthn();
	});

	async function addPasskey() {
		error = null;
		adding = true;
		try {
			passkeys = [...passkeys, await registerPasskey()];
			toaster.success({ title: "Passkey created" });
		} catch (err) {
			error = passkeyRegistrationError(err);
		} finally {
			adding = false;
		}
	}

	function startRename(passkey: PasskeySummary) {
		error = null;
		renamingId = passkey.id;
		draftName = passkey.name;
	}

	async function saveRename(e: SubmitEvent) {
		e.preventDefault();
		if (!renamingId) return;
		error = null;
		saving = true;
		try {
			const updated = await renamePasskey(renamingId, draftName);
			passkeys = passkeys.map((p) => (p.id === updated.id ? updated : p));
			renamingId = null;
		} catch (err) {
			error = err instanceof Error ? err.message : "Rename failed";
		} finally {
			saving = false;
		}
	}

	function askDelete(passkey: PasskeySummary) {
		error = null;
		deleteTarget = passkey;
		deleteOpen = true;
	}

	async function confirmDelete() {
		if (!deleteTarget) return;
		const { id } = deleteTarget;
		deleting = true;
		try {
			await deletePasskey(id);
			passkeys = passkeys.filter((p) => p.id !== id);
		} catch (err) {
			error = err instanceof Error ? err.message : "Delete failed";
		} finally {
			deleting = false;
			deleteOpen = false;
		}
	}
</script>

<div class="px-[34px] pb-16 pt-[30px]">
	<div class="mb-6">
		<h1 class="text-[21px] font-bold tracking-tight text-surface-900">
			Account
		</h1>
		<p class="mt-1 text-[13.5px] text-surface-500">{auth.user?.email}</p>
	</div>

	<section class="card preset-outlined-surface-200 max-w-2xl rounded-xl p-6">
		<div class="mb-4 flex items-start justify-between gap-4">
			<div>
				<h2 class="text-lg font-semibold">Passkeys</h2>
				<p class="text-sm text-surface-500">
					Sign in with your fingerprint, face, or screen lock. You can
					always sign in with an email code instead.
				</p>
			</div>
			{#if supported && !data.loadError}
				<button
					type="button"
					class="btn btn-sm preset-filled-primary-500 shrink-0"
					disabled={adding}
					onclick={addPasskey}
				>
					{adding ? "Waiting for passkey…" : "Add a passkey"}
				</button>
			{/if}
		</div>

		{#if error}
			<div class="text-error-500 text-sm mb-4 p-3 bg-error-50 rounded-lg">
				{error}
			</div>
		{/if}

		{#if data.loadError}
			<p class="text-sm text-error-500">{data.loadError}</p>
		{:else if passkeys.length === 0}
			<p
				class="rounded-lg border border-dashed border-surface-300 py-8 text-center text-sm text-surface-500"
			>
				No passkeys yet. You'll sign in with an email code until you add
				one.
			</p>
		{:else}
			<ul class="divide-y divide-surface-200">
				{#each passkeys as passkey (passkey.id)}
					<li class="flex items-center gap-4 py-3">
						{#if renamingId === passkey.id}
							<form
								onsubmit={saveRename}
								class="flex flex-1 items-center gap-2"
							>
								<input
									class="input flex-1"
									bind:value={draftName}
									maxlength="64"
									required
									aria-label="Passkey name"
								/>
								<button
									type="submit"
									class="btn btn-sm preset-filled-primary-500"
									disabled={saving || !draftName.trim()}
								>
									{saving ? "Saving…" : "Save"}
								</button>
								<button
									type="button"
									class="btn btn-sm preset-tonal-surface"
									disabled={saving}
									onclick={() => (renamingId = null)}
								>
									Cancel
								</button>
							</form>
						{:else}
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<span class="truncate font-medium"
										>{passkey.name}</span
									>
									{#if passkey.backedUp}
										<span
											class="badge preset-tonal-success"
											title="Saved to your password manager and available on your other devices"
											>Synced</span
										>
									{:else}
										<span
											class="badge preset-tonal-surface"
											title="Only on the device or security key that created it"
											>Not synced</span
										>
									{/if}
								</div>
								<p class="text-xs text-surface-500">
									Created {formatDate(passkey.createdAt)} · Last
									used {passkey.lastUsedAt
										? formatDate(passkey.lastUsedAt)
										: "never"}
								</p>
							</div>
							<button
								type="button"
								class="btn btn-sm preset-tonal-surface"
								onclick={() => startRename(passkey)}
							>
								Rename
							</button>
							<button
								type="button"
								class="btn btn-sm preset-tonal-error"
								onclick={() => askDelete(passkey)}
							>
								Delete
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<Dialog
	open={deleteOpen}
	onOpenChange={(details) => {
		if (!deleting) deleteOpen = details.open;
	}}
	closeOnInteractOutside={!deleting}
	closeOnEscape={!deleting}
>
	<Portal>
		<Dialog.Backdrop class="bg-black/50 fixed inset-0 z-50" />
		<Dialog.Positioner
			class="fixed inset-0 flex items-center justify-center z-50"
		>
			<Dialog.Content
				class="card preset-outlined-surface-200 p-6 w-full max-w-sm bg-surface-50-950 rounded-xl space-y-4"
			>
				<Dialog.Title class="text-lg font-bold"
					>Delete passkey?</Dialog.Title
				>
				<Dialog.Description class="text-sm text-surface-500">
					You won't be able to sign in with
					<strong>{deleteTarget?.name}</strong> anymore. You can still sign
					in with an email code.
				</Dialog.Description>
				<div class="flex justify-end gap-2">
					<Dialog.CloseTrigger
						class="btn preset-tonal-surface"
						disabled={deleting}>Cancel</Dialog.CloseTrigger
					>
					<button
						type="button"
						class="btn preset-filled-error-500"
						disabled={deleting}
						onclick={confirmDelete}
					>
						{deleting ? "Deleting…" : "Delete"}
					</button>
				</div>
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
