// @ts-check
import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import tailwindcss from "@tailwindcss/vite";
import remarkMermaid from "./src/lib/remark-mermaid.mjs";

// https://astro.build/config
export default defineConfig({
  output: "static",
  site: "https://cloudgrid.dev",
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    processor: unified({
      // remark-mermaid converts ```mermaid blocks into <div class="cg-mermaid">
      // so Shiki never tries to highlight them and the client-side renderer
      // can pick them up. Order matters: run before Shiki.
      remarkPlugins: [remarkMermaid],
      gfm: true,
    }),
    // Shiki with both light + dark themes. Astro emits CSS variables on every
    // token; global.css then toggles which variable wins based on the manual
    // theme class on <html>. See src/styles/global.css: "Shiki dual-theme".
    shikiConfig: {
      themes: {
        light: "github-light",
        dark: "github-dark-dimmed",
      },
      langs: [],
      wrap: false,
    },
    syntaxHighlight: "shiki",
  },
});
