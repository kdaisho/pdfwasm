<script lang="ts">
	interface Props {
		size?: number;
		class?: string;
	}

	let { size = 14, class: klass = "" }: Props = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 16 16"
	fill="none"
	class={klass}
	aria-hidden="true"
>
	<!-- Sheet feeding in at the top, printer body, printed sheet at the front. -->
	<path
		d="M4.5 6V2.5h7V6"
		stroke="currentColor"
		stroke-width="1.4"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
	<path
		d="M4.5 11.5H3A1.5 1.5 0 0 1 1.5 10V7.5A1.5 1.5 0 0 1 3 6h10a1.5 1.5 0 0 1 1.5 1.5V10a1.5 1.5 0 0 1-1.5 1.5h-1.5"
		stroke="currentColor"
		stroke-width="1.4"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
	<path
		d="M4.5 9.5h7v4h-7z"
		stroke="currentColor"
		stroke-width="1.4"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
</svg>
