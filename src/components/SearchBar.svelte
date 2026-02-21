<script lang="ts">
  interface Props {
    inputElement?: HTMLInputElement;
    query: string;
    onchange: (q: string) => void;
    matchCount: number;
    currentMatchIndex: number;
    onnext: () => void;
    onprev: () => void;
    caseSensitive: boolean;
    wholeWord: boolean;
    ontogglecasesensitive: () => void;
    ontogglewholeword: () => void;
  }

  let {
    inputElement = $bindable(),
    query,
    onchange,
    matchCount,
    currentMatchIndex,
    onnext,
    onprev,
    caseSensitive,
    wholeWord,
    ontogglecasesensitive,
    ontogglewholeword,
  }: Props = $props();

  let hasMatches = $derived(matchCount > 0);
</script>

<div class="container">
  <input
    bind:this={inputElement}
    type="text"
    value={query}
    oninput={(e) => onchange((e.target as HTMLInputElement).value)}
    placeholder="Search in document…"
    class="input"
  />
  <button
    onclick={ontogglecasesensitive}
    title="Case sensitive (⌘⌥C)"
    class="toggle"
    class:active={caseSensitive}
  >
    Aa
  </button>
  <button
    onclick={ontogglewholeword}
    title="Whole word (⌘⌥W)"
    class="toggle"
    class:active={wholeWord}
  >
    W
  </button>
  {#if query}
    <span class="count">
      {matchCount === 0 ? 'No matches' : `${currentMatchIndex + 1} of ${matchCount}`}
    </span>
    <div class="nav-group">
      <button
        onclick={onprev}
        disabled={!hasMatches}
        title="Previous match (⌘⇧G)"
        class="nav"
        class:disabled={!hasMatches}
      >
        ↑
      </button>
      <button
        onclick={onnext}
        disabled={!hasMatches}
        title="Next match (⌘G)"
        class="nav"
        class:disabled={!hasMatches}
      >
        ↓
      </button>
    </div>
  {/if}
</div>

<style>
  .container {
    position: sticky;
    top: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 10px 16px;
    background: #fff;
    border-bottom: 1px solid #ddd;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
  }
  .input {
    flex: 1;
    max-width: 400px;
    padding: 6px 10px;
    font-size: 14px;
    border: 1px solid #ccc;
    border-radius: 4px;
    outline: none;
    margin-right: 4px;
  }
  .toggle {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    border-radius: 4px;
    border: 1px solid transparent;
    cursor: pointer;
    background: transparent;
    color: #555;
  }
  .toggle.active {
    background: #0066cc;
    color: #fff;
  }
  .count {
    font-size: 13px;
    color: #666;
    white-space: nowrap;
    margin-left: 4px;
    min-width: 80px;
  }
  .nav-group {
    display: flex;
    gap: 2px;
  }
  .nav {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    border-radius: 4px;
    border: 1px solid transparent;
    cursor: pointer;
    background: transparent;
    color: #555;
  }
  .nav.disabled {
    cursor: default;
    color: #bbb;
  }
</style>
