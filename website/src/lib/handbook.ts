import { getCollection, type CollectionEntry } from "astro:content";

/**
 * Find a handbook entry by slug, tolerating Astro's glob-loader id quirks:
 *   - `index.md` files may be exposed as either `<folder>/index` or just `<folder>`.
 *   - The root `index.md` may be exposed as `index` or as an empty string.
 *
 * Pass the slug you want (e.g. `"architecture"` for the architecture overview,
 * or `""` for the root). The helper returns the matching entry regardless of
 * which convention the loader uses.
 */
export async function findHandbookEntry(
  slug: string,
): Promise<CollectionEntry<"handbook"> | undefined> {
  const all = await getCollection("handbook");
  const target = slug.replace(/^\/+|\/+$/g, "");
  const candidates = new Set<string>();
  if (target === "") {
    candidates.add("");
    candidates.add("index");
  } else {
    candidates.add(target);
    candidates.add(`${target}/index`);
  }
  return all.find((entry) => candidates.has(entry.id));
}
