<script>
  /**
   * @typedef {string | number} TreeNodeId
   * @typedef {{ resourcePath: TreeNodeId; title: string; disabled?: boolean; expanded?: boolean; }} TreeNode
   */

  /** @type {Array<TreeNode & { children?: TreeNode[] }>} */
  export let children = [];
  export let expanded = false;
  export let root = false;

  /** @type {string | number} */
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
  import CaretDown from "../icons/CaretDown.svelte";
  import TreeViewNode, { computeTreeLeafDepth } from "./TreeViewNode.svelte";

  let ref = null;
  let refLabel = null;
  let prevActiveId = undefined;

  const {
    activeNodeId,
    selectedNodeIds,
    expandedNodeIds,
    clickNode,
    selectNode,
    expandNode,
    focusNode,
    toggleNode,
  } = getContext("TreeView");

  const offset = () => {
    const depth = computeTreeLeafDepth(refLabel);

    if (parent) return depth + 1;
    if (icon) return depth + 2;
    return depth + 2.5;
  };

  afterUpdate(() => {
    if (resourcePath === $activeNodeId && prevActiveId !== $activeNodeId) {
      if (!$selectedNodeIds.includes(resourcePath)) selectNode(node);
    }

    prevActiveId = $activeNodeId;
  });

  $: parent = Array.isArray(children);
  $: node = { resourcePath, title, expanded, leaf: !parent, remark, isFile, isDir, relativePath, deep };
  $: if (refLabel) {
    refLabel.style.marginLeft = `-${offset()}rem`;
    refLabel.style.paddingLeft = `${offset()}rem`;
  }
  $: expanded = $expandedNodeIds.includes(resourcePath);
</script>

{#if root}
  {#each children as child (child.resourcePath)}
    {#if Array.isArray(child.children)}
      <svelte:self {...child} />
    {:else}
      <TreeViewNode leaf {...child} />
    {/if}
  {/each}
{:else}
  <li
    bind:this="{ref}"
    role="treeitem"
    resourcePath="{resourcePath}"
    tabindex="{disabled ? undefined : -1}"
    aria-current="{resourcePath === $activeNodeId || undefined}"
    aria-selected="{disabled ? undefined : $selectedNodeIds.includes(resourcePath)}"
    aria-disabled="{disabled}"
    class:bx--tree-node="{true}"
    class:bx--tree-parent-node="{true}"
    class:bx--tree-node--active="{resourcePath === $activeNodeId}"
    class:bx--tree-node--selected="{$selectedNodeIds.includes(resourcePath)}"
    class:bx--tree-node--disabled="{disabled}"
    class:bx--tree-node--with-icon="{icon}"
    aria-expanded="{expanded}"
    on:click|stopPropagation="{() => {
      if (disabled) return;
      clickNode(node);
    }}"
    on:keydown="{(e) => {
      if (
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'Enter'
      ) {
        e.stopPropagation();
      }

      if (parent && e.key === 'ArrowLeft') {
        expanded = false;
        expandNode(node, false);
        toggleNode(node);
      }

      if (parent && e.key === 'ArrowRight') {
        if (expanded) {
          ref.lastChild.firstElementChild?.focus();
        } else {
          expanded = true;
          expandNode(node, true);
          toggleNode(node);
        }
      }

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (disabled) return;
        expanded = !expanded;
        toggleNode(node);
        clickNode(node);
        expandNode(node, expanded);
        ref.focus();
      }
    }}"
    on:focus="{() => {
      focusNode(node);
    }}"
  >
    <div class:bx--tree-node__label="{true}" bind:this="{refLabel}">
      <span
        class:bx--tree-parent-node__toggle="{true}"
        disabled="{disabled}"
        on:click="{() => {
          if (disabled) return;
          expanded = !expanded;
          expandNode(node, expanded);
          toggleNode(node);
        }}"
      >
        <CaretDown
          class="bx--tree-parent-node__toggle-icon {expanded &&
            'bx--tree-parent-node__toggle-icon--expanded'}"
        />
      </span>
      <span class:bx--tree-node__label__details="{true}">
        <svelte:component this="{icon}" class="bx--tree-node__icon" />
        {title}
        {#if ![null, undefined, ''].includes(remark)}
          <svg t="1656661433646" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1522" width="16" height="16"><path d="M625.728 57.472c19.264 0 34.688 6.848 48.128 20.16l208.96 207.04c14.272 13.12 21.568 29.568 21.568 49.28v504.576c0 71.808-56.256 127.744-128.576 127.744H252.16c-72.128 0-128.576-55.68-128.576-127.744V184.704c0-71.68 56.256-127.232 128.576-127.232z m-34.304 76.8H252.16c-30.144 0-51.776 21.376-51.776 50.432v653.824c0 29.44 21.888 50.944 51.776 50.944h523.648c30.016 0 51.84-21.632 51.84-50.944l-0.128-464.512H687.488A96 96 0 0 1 591.936 287.36l-0.448-9.216V134.208zM665.6 704a38.4 38.4 0 0 1 0 76.8H294.4a38.4 38.4 0 0 1 0-76.8h371.2z m0-192a38.4 38.4 0 0 1 0 76.8H294.4a38.4 38.4 0 0 1 0-76.8h371.2z m-192-192a38.4 38.4 0 1 1 0 76.8H294.4a38.4 38.4 0 1 1 0-76.8h179.2z m181.824-152.512v110.592a32 32 0 0 0 26.24 31.488l5.76 0.512h111.872L655.424 167.424z" p-id="1523" fill="#8a8a8a"></path></svg>
        {/if}
        {remark}
      </span>
    </div>
    {#if expanded}
      <ul role="group" class:bx--tree-node__children="{true}">
        {#each children as child (child.resourcePath)}
          {#if Array.isArray(child.children)}
            <svelte:self {...child} />
          {:else}
            <TreeViewNode leaf {...child} />
          {/if}
        {/each}
      </ul>
    {/if}
  </li>
{/if}
