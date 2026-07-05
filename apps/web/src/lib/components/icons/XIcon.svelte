<script lang="ts">
	interface Props {
		size?: number;
		class?: string;
	}

	let { size = 12, class: klass = "" }: Props = $props();
</script>

<!-- Symmetric viewBox so the cross is perfectly centered, unlike the "×" glyph
     which sits slightly high inside a button. Inherits color via currentColor. -->
<svg
	width={size}
	height={size}
	viewBox="0 0 12 12"
	fill="none"
	class={klass}
	aria-hidden="true"
>
	<path
		d="M2.5 2.5 9.5 9.5M9.5 2.5 2.5 9.5"
		stroke="currentColor"
		stroke-width="1.8"
		stroke-linecap="round"
	/>
</svg>
