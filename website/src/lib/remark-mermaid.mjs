import { renderMermaidSVG, THEMES } from "beautiful-mermaid";

const lightTheme = THEMES["github-light"];
const darkTheme = THEMES["github-dark"];

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/\n/g, "&#10;");
}

function walk(node, parent, index, transform) {
  transform(node, parent, index);
  if (node && Array.isArray(node.children)) {
    for (let i = 0; i < node.children.length; i++) {
      walk(node.children[i], node, i, transform);
    }
  }
}

function renderDiagram(source) {
  const svg = renderMermaidSVG(source, {
    bg: "var(--cg-mermaid-bg)",
    fg: "var(--cg-mermaid-fg)",
    line: "var(--cg-mermaid-line)",
    accent: "var(--cg-mermaid-accent)",
    muted: "var(--cg-mermaid-muted)",
    surface: "var(--cg-mermaid-surface)",
    border: "var(--cg-mermaid-border)",
    font: "Inter",
    padding: 32,
    transparent: true,
  });

  return [
    `<figure class="cg-mermaid-frame" style="--cg-mermaid-light-bg:${lightTheme.bg};--cg-mermaid-light-fg:${lightTheme.fg};--cg-mermaid-light-line:${lightTheme.line};--cg-mermaid-light-accent:${lightTheme.accent};--cg-mermaid-light-muted:${lightTheme.muted};--cg-mermaid-dark-bg:${darkTheme.bg};--cg-mermaid-dark-fg:${darkTheme.fg};--cg-mermaid-dark-line:${darkTheme.line};--cg-mermaid-dark-accent:${darkTheme.accent};--cg-mermaid-dark-muted:${darkTheme.muted};" data-mermaid-src="${escapeAttr(source)}">`,
    '<div class="cg-mermaid-toolbar" aria-label="Diagram controls">',
    '<span class="cg-mermaid-title">diagram</span>',
    '<button type="button" class="cg-icon-button" data-mermaid-action="zoom-out" aria-label="Zoom out"><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button>',
    '<button type="button" class="cg-icon-button" data-mermaid-action="reset" aria-label="Reset diagram view"><svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/></svg></button>',
    '<button type="button" class="cg-icon-button" data-mermaid-action="zoom-in" aria-label="Zoom in"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>',
    '<button type="button" class="cg-icon-button" data-mermaid-action="fullscreen" aria-label="Open diagram fullscreen"><svg viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5"/></svg></button>',
    "</div>",
    '<div class="cg-mermaid-viewport" tabindex="0">',
    '<div class="cg-mermaid-canvas">',
    svg,
    "</div>",
    "</div>",
    '<figcaption class="sr-only">Mermaid diagram rendered with beautiful-mermaid.</figcaption>',
    "</figure>",
  ].join("");
}

export default function remarkMermaid() {
  return (tree) => {
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

    for (let i = hits.length - 1; i >= 0; i--) {
      const { parent, index, value } = hits[i];
      try {
        parent.children[index] = { type: "html", value: renderDiagram(value) };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        parent.children[index] = {
          type: "html",
          value: `<div class="cg-mermaid-error"><strong>Diagram failed to render.</strong><pre>${escapeHtml(value)}</pre><p>${escapeHtml(message)}</p></div>`,
        };
      }
    }
  };
}
