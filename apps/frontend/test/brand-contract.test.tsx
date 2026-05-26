import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { brand } from "../src/brand/brand";
import { useBrand } from "../src/providers/brand-provider";

function BrandProbe() {
  const activeBrand = useBrand();

  return (
    <div data-brand={activeBrand.brand.id}>
      <span>{activeBrand.productName}</span>
      {activeBrand.renderMark("size-4")}
    </div>
  );
}

describe("brand contract", () => {
  test("default CloudGrid brand provides complete light and dark semantic tokens", () => {
    const lightTokens = Object.keys(brand.theme.color.light).sort();
    const darkTokens = Object.keys(brand.theme.color.dark).sort();

    expect(darkTokens).toEqual(lightTokens);
    expect(lightTokens).toContain("background");
    expect(lightTokens).toContain("sidebarPrimaryForeground");
    expect(brand.productName).toBe("CloudGrid");
    expect(brand.pageTitle("Traces")).toBe("Traces - CloudGrid");
  });

  test("useBrand exposes default identity for isolated component rendering", () => {
    const markup = renderToStaticMarkup(<BrandProbe />);

    expect(markup).toContain('data-brand="cloudgrid"');
    expect(markup).toContain("CloudGrid");
  });
});
