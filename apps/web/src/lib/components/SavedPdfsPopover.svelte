<script lang="ts">
	import { Popover } from "@skeletonlabs/skeleton-svelte";
	import {
		listPdfs,
		deletePdf,
		type PdfDocumentMeta,
	} from "$lib/services/pdf-api";

	interface Props {
		onSelect: (id: string, filename: string) => void;
	}

	let { onSelect }: Props = $props();

	let open = $state(false);
	let pdfs: PdfDocumentMeta[] = $state([]);
	let loading = $state(false);
	let error: string | null = $state(null);

	async function fetchList() {
		loading = true;
		error = null;
		try {
			pdfs = await listPdfs();
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : "Failed to load";
		} finally {
			loading = false;
		}
	}

	async function handleDelete(e: MouseEvent, id: string) {
		e.stopPropagation();
		try {
			await deletePdf(id);
			pdfs = pdfs.filter((p) => p.id !== id);
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : "Delete failed";
		}
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString();
	}
</script>

<Popover
	{open}
	positioning={{ placement: "bottom-end" }}
	onOpenChange={(details) => {
		open = details.open;
		if (details.open) fetchList();
	}}
>
	<Popover.Trigger>
		<button class="btn preset-outlined text-sm">My PDFs</button>
	</Popover.Trigger>
	<Popover.Positioner class="z-50">
		<Popover.Content
			class="card bg-surface-100-900 p-3 shadow-lg w-72 min-h-12 max-h-80 overflow-y-auto"
		>
			{#if loading}
				<p class="text-sm text-surface-500 text-center py-4">
					Loading…
				</p>
			{:else if error}
				<p class="text-sm text-error-500 text-center py-4">
					{error}
				</p>
			{:else if pdfs.length === 0}
				<p class="text-sm text-surface-500 text-center py-4">
					No saved PDFs
				</p>
			{:else}
				<ul class="space-y-1">
					{#each pdfs as pdf (pdf.id)}
						<li>
							<div
								class="w-full text-left px-2 py-1.5 rounded hover:bg-surface-200-800 flex items-center gap-2 group cursor-pointer"
								role="button"
								tabindex="0"
								onclick={() => {
									open = false;
									onSelect(pdf.id, pdf.filename);
								}}
								onkeydown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										open = false;
										onSelect(pdf.id, pdf.filename);
									}
								}}
							>
								<div class="flex-1 min-w-0">
									<div class="text-sm font-medium truncate">
										{pdf.filename}
									</div>
									<div class="text-xs text-surface-500">
										{formatSize(pdf.fileSize)} &middot; {formatDate(
											pdf.uploadedAt,
										)}
									</div>
								</div>
								<button
									class="text-xs text-surface-400 hover:text-error-500 opacity-0 group-hover:opacity-100 transition-opacity px-1"
									onclick={(e) => handleDelete(e, pdf.id)}
									title="Delete"
								>
									✕
								</button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</Popover.Content>
	</Popover.Positioner>
</Popover>
