import type { Component } from "svelte";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _component = $state<Component<any> | null>(null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _props = $state<Record<string, any>>({});

export const sidebarStore = {
	get component() {
		return _component;
	},
	get props() {
		return _props;
	},
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	set(comp: Component<any> | null, props: Record<string, any> = {}) {
		_component = comp;
		_props = props;
	},
	clear() {
		_component = null;
		_props = {};
	},
};
