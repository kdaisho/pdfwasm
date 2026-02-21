/// <reference types="svelte" />
/// <reference types="vite/client" />

declare module '*.svelte' {
  import type { Component } from 'svelte';
  const component: Component;
  export default component;
}

declare module '@hyzyla/pdfium/pdfium.wasm?url' {
  const url: string;
  export default url;
}
