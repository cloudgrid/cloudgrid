// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  output: "static",
  site: "https://cloudgrid.dev",
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    // Shiki with both light + dark themes. Astro emits CSS variables on every
    // token; global.css then toggles which variable wins based on the manual
    // theme class on <html>. See src/styles/global.css → "Shiki dual-theme".
    shikiConfig: {
      themes: {
        light: "github-light",
        dark: "github-dark-dimmed",
      },
      // Make GenAI keywords pop a bit; harmless if the language is unknown.
      langs: [],
      wrap: false,
    },
    // Adds an `id` slug to every heading so the right-rail TOC can link to it.
    syntaxHighlight: "shiki",
    gfm: true,
  },
});
