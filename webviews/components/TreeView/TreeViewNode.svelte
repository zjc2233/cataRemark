<script context="module">
  /**
   * Computes the depth of a tree leaf node relative to <ul role="tree" />
   * @param {HTMLLIElement} node
   * @returns {number} depth
   */
  export function computeTreeLeafDepth(node) {
    let depth = 0;

    if (node == null) return depth;

    let parentNode = node.parentNode;

    while (parentNode != null && parentNode.getAttribute("role") !== "tree") {
      parentNode = parentNode.parentNode;
      if (parentNode.tagName === "LI") depth++;
    }

    return depth;
  }

  /**
   * Finds the nearest parent tree node
   * @param {HTMLElement} node
   * @returns {null | HTMLElement}
   */
  function findParentTreeNode(node) {
    if (node.classList.contains("bx--tree-parent-node")) return node;
    if (node.classList.contains("bx--tree")) return null;
    return findParentTreeNode(node.parentNode);
  }
</script>

<script>
  /**
   * @typedef {string | number} TreeNodeId
   */

  export let leaf = false;

  /** @type {TreeNodeId} */
  export let resourcePath = "";
  export let title = "";
  export let remark = "";
  export let isFile = false;
  export let isDir = false;
  export let relativePath = "";
  export let deep = 0;
  export let disabled = false;

  /**
   * Specify the icon to render
   * @type {typeof import("svelte").SvelteComponent}
   */
  export let icon = undefined;

  import { afterUpdate, getContext } from "svelte";

  let ref = null;
  let refLabel = null;
  let prevActiveId = undefined;

  const { activeNodeId, selectedNodeIds, clickNode, selectNode, focusNode } =
    getContext("TreeView");
  const offset = () =>
    computeTreeLeafDepth(refLabel) + (leaf && icon ? 2 : 2.5);

  afterUpdate(() => {
    if (resourcePath === $activeNodeId && prevActiveId !== $activeNodeId) {
      if (!$selectedNodeIds.includes(resourcePath)) selectNode(node);
    }

    prevActiveId = $activeNodeId;
  });

  $: node = { resourcePath, title, expanded: false, leaf, remark, isFile, isDir, relativePath, deep };
  $: if (refLabel) {
    refLabel.style.marginLeft = `-${offset()}rem`;
    refLabel.style.paddingLeft = `${offset()}rem`;
  }
</script>

<li
  bind:this="{ref}"
  role="treeitem"
  resourcePath="{resourcePath}"
  tabindex="{disabled ? undefined : -1}"
  aria-current="{resourcePath === $activeNodeId || undefined}"
  aria-selected="{disabled ? undefined : $selectedNodeIds.includes(resourcePath)}"
  aria-disabled="{disabled}"
  class:bx--tree-node="{true}"
  class:bx--tree-leaf-node="{true}"
  class:bx--tree-node--active="{resourcePath === $activeNodeId}"
  class:bx--tree-node--selected="{$selectedNodeIds.includes(resourcePath)}"
  class:bx--tree-node--disabled="{disabled}"
  class:bx--tree-node--with-icon="{icon}"
  on:click|stopPropagation="{() => {
    if (disabled) return;
    clickNode(node);
  }}"
  on:keydown="{(e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Enter') {
      e.stopPropagation();
    }

    if (e.key === 'ArrowLeft') {
      const parentNode = findParentTreeNode(ref.parentNode);
      if (parentNode) parentNode.focus();
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (disabled) return;
      clickNode(node);
    }
  }}"
  on:focus="{() => {
    focusNode(node);
  }}"
>
  <div bind:this="{refLabel}" class:bx--tree-node__label="{true}">
    <svelte:component this="{icon}" class="bx--tree-node__icon" />
    {title}
    {#if ![null, undefined, ''].includes(remark)}
      <svg t="1656661433646" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1522" width="16" height="16"><path d="M625.728 57.472c19.264 0 34.688 6.848 48.128 20.16l208.96 207.04c14.272 13.12 21.568 29.568 21.568 49.28v504.576c0 71.808-56.256 127.744-128.576 127.744H252.16c-72.128 0-128.576-55.68-128.576-127.744V184.704c0-71.68 56.256-127.232 128.576-127.232z m-34.304 76.8H252.16c-30.144 0-51.776 21.376-51.776 50.432v653.824c0 29.44 21.888 50.944 51.776 50.944h523.648c30.016 0 51.84-21.632 51.84-50.944l-0.128-464.512H687.488A96 96 0 0 1 591.936 287.36l-0.448-9.216V134.208zM665.6 704a38.4 38.4 0 0 1 0 76.8H294.4a38.4 38.4 0 0 1 0-76.8h371.2z m0-192a38.4 38.4 0 0 1 0 76.8H294.4a38.4 38.4 0 0 1 0-76.8h371.2z m-192-192a38.4 38.4 0 1 1 0 76.8H294.4a38.4 38.4 0 1 1 0-76.8h179.2z m181.824-152.512v110.592a32 32 0 0 0 26.24 31.488l5.76 0.512h111.872L655.424 167.424z" p-id="1523" fill="#8a8a8a"></path></svg>
    {/if}
    {remark}
  </div>
</li>

<style>
  .icon{
    color: #fff;
  }
</style>
