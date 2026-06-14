<script lang="ts">
	interface Props {
		/** Current 0-based step index. */
		step: number;
		/** Step titles, one per step. */
		titles: string[];
	}

	let { step, titles }: Props = $props();
</script>

<!--
	Each step is an equal-width (flex-1) column: [connector | circle | connector].
	Connectors fill the gap on either side of the circle and meet the neighbouring
	column's connector at the midpoint between circles, giving one continuous line
	that's vertically centered on the circles. The titles sit centered below.
-->
<div class="mb-8 flex items-start">
	{#each titles as title, index (title)}
		<div class="flex flex-1 flex-col items-center">
			<div class="flex w-full items-center">
				<div
					class="h-0.5 flex-1 rounded-full transition-colors {index ===
					0
						? 'invisible'
						: step >= index
							? 'bg-primary-500'
							: 'bg-surface-300'}"
				></div>
				<div
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold leading-none transition-colors {step >
					index
						? 'preset-filled-primary-500'
						: step === index
							? 'preset-outlined-primary-500'
							: 'preset-outlined-surface-500'}"
				>
					{#if step > index}
						<svg
							width="14"
							height="14"
							viewBox="0 0 14 14"
							fill="none"
							aria-hidden="true"
						>
							<path
								d="M3 7.5l2.5 2.5L11 4.5"
								stroke="currentColor"
								stroke-width="1.75"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					{:else}
						<span class="pt-0.5">
							{index + 1}
						</span>
					{/if}
				</div>
				<div
					class="h-0.5 flex-1 rounded-full transition-colors {index ===
					titles.length - 1
						? 'invisible'
						: step > index
							? 'bg-primary-500'
							: 'bg-surface-300'}"
				></div>
			</div>
			<span
				class="mt-2 text-center text-xs leading-tight text-surface-500"
				>{title}</span
			>
		</div>
	{/each}
</div>
