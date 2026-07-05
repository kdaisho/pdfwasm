<script lang="ts">
	interface Props {
		size?: number;
		class?: string;
	}

	let { size = 12, class: klass = "" }: Props = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 12 12"
	fill="none"
	class={klass}
	aria-hidden="true"
>
	<path
		d="M2.5 6.5 5 9l4.5-5.5"
		stroke="currentColor"
		stroke-width="1.8"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
</svg>
