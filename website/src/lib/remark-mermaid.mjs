/**
 * remark-mermaid
 *
 * Turn fenced markdown ``` ```mermaid ``` blocks into a raw HTML <div> the
 * client-side enhancer can pick up. Running this in the markdown pipeline
 * means Shiki never tries to highlight "mermaid" as a language — the block
 * leaves the markdown phase as already-rendered HTML.
 *
 * The emitted markup is:
 *
 *   <div class="cg-mermaid" data-mermaid-src="...escaped..."></div>
 *
 * which our HandbookLayout client script finds and renders via mermaid@10.
 *
 * No dependency on `unist-util-visit` — we walk the tree by hand, which is
 * tiny and avoids pulling another import.
 */

function escapeAttr(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

function walk(node, parent, index, transform) {
  transform(node, parent, index);
  if (node && Array.isArray(node.children)) {
    for (let i = 0; i < node.children.length; i++) {
      walk(node.children[i], node, i, transform);
    }
  }
}

export default function remarkMermaid() {
  return (tree) => {
    // First pass: collect mermaid code nodes with their location.
    const hits = [];
    walk(tree, null, 0, (node, parent, index) => {
      if (
        node &&
        node.type === "code" &&
        typeof node.lang === "string" &&
        node.lang.toLowerCase() === "mermaid" &&
        parent &&
        Array.isArray(parent.children) &&
        typeof index === "number"
      ) {
        hits.push({ parent, index, value: node.value || "" });
      }
    });

    // Replace in reverse so earlier indexes stay valid.
    for (let i = hits.length - 1; i >= 0; i--) {
      const { parent, index, value } = hits[i];
      const html = `<div class="cg-mermaid" data-mermaid-src="${escapeAttr(value)}"></div>`;
      parent.children[index] = { type: "html", value: html };
    }
  };
}
