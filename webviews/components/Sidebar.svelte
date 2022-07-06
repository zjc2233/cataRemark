<script>
    import { onMount, } from "svelte";
    import { TreeView } from "./TreeView/index";

    let activeId = 0;
    let selectedIds = [];
    let children = []

    onMount(async () => {
        console.log('onMount');
        tsvscode.postMessage({
            type: 'init-tree',
        });
        window.addEventListener("message", async (event) => {
            const message = event.data;
            switch (message.type) {
                case "new-todo":
                    console.log('message', message);
                    children = JSON.parse(message.value)
                    break;
            }
        });
    });
    function sendMessage (type, detail) {
        console.log('focus', detail);
        if (type === 'focus' && detail.isFile) {
            tsvscode.postMessage({
                type: 'open-file',
                value: detail.resourcePath
            });
        }
    }
</script>

<TreeView size="compact" {children}
    bind:activeId bind:selectedIds 
    on:select={({ detail }) => console.log("select", detail)}
    on:toggle={({ detail }) => console.log("toggle", detail)}
    on:focus={({ detail }) => sendMessage("focus", detail)} />

<!-- <div>Active node resourcePath: {activeId}</div>
<div>Selected ids: {JSON.stringify(selectedIds)}</div> -->

<style>
div {
    margin-top: var(--cds-spacing-05);
}
</style>
