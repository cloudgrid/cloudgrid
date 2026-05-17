import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * Handbook content collection.
 *
 * All `.md` (and later `.mdx`) files under `src/content/handbook/**` are
 * collected. Folder structure becomes URL nesting: a file at
 * `architecture/services.md` is served at `/handbook/architecture/services`.
 *
 * The schema captures everything the layout needs without forcing every page
 * to fill out a long frontmatter. `order` is optional and used to sort sibling
 * pages in the left sidebar (lower = higher).
 */
const handbook = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/handbook" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    /** Sidebar / section label override; defaults to `title`. */
    sidebar: z.string().optional(),
    /** Sort key inside a folder. Lower number = first. Default 100. */
    order: z.number().optional(),
    /** Optional accent for the eyebrow chip on the rendered page. */
    accent: z
      .enum(["brand", "cyan", "emerald", "amber", "violet", "rose"])
      .optional()
      .default("brand"),
    /** Optional eyebrow override. Defaults to the parent folder name. */
    eyebrow: z.string().optional(),
    /** Hide from the left sidebar nav (still reachable by URL). */
    hidden: z.boolean().optional().default(false),
    /** Last-updated date for the page footer. */
    updated: z.coerce.date().optional(),
  }),
});

export const collections = { handbook };
