import { brand } from "@cloudgrid/brand";
import { createContext, type ReactNode, useContext, useEffect, useMemo } from "react";
import type { BrandColorTokens, BrandContextValue, ProductBrand } from "../brand/brand-contract";

const BrandContext = createContext<BrandContextValue | null>(null);

const cssVariableNames = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  cardForeground: "--card-foreground",
  popover: "--popover",
  popoverForeground: "--popover-foreground",
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  secondary: "--secondary",
  secondaryForeground: "--secondary-foreground",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  destructive: "--destructive",
  border: "--border",
  input: "--input",
  ring: "--ring",
  chart1: "--chart-1",
  chart2: "--chart-2",
  chart3: "--chart-3",
  chart4: "--chart-4",
  chart5: "--chart-5",
  info: "--info",
  success: "--success",
  warning: "--warning",
  error: "--error",
  trace: "--trace",
  sidebar: "--sidebar",
  sidebarForeground: "--sidebar-foreground",
  sidebarPrimary: "--sidebar-primary",
  sidebarPrimaryForeground: "--sidebar-primary-foreground",
  sidebarAccent: "--sidebar-accent",
  sidebarAccentForeground: "--sidebar-accent-foreground",
  sidebarBorder: "--sidebar-border",
  sidebarRing: "--sidebar-ring",
} satisfies Record<keyof BrandColorTokens, `--${string}`>;

function serializeColorTokens(selector: string, tokens: BrandColorTokens) {
  const declarations = Object.entries(cssVariableNames)
    .map(([tokenName, variableName]) => {
      const value = tokens[tokenName as keyof BrandColorTokens];
      return `  ${variableName}: ${value};`;
    })
    .join("\n");

  return `${selector} {\n${declarations}\n}`;
}

function serializeBrandTheme(productBrand: ProductBrand) {
  return [
    ":root {",
    `  --radius: ${productBrand.theme.radius.base};`,
    `  --brand-font-sans: ${productBrand.theme.typography.sans};`,
    `  --brand-font-mono: ${productBrand.theme.typography.mono};`,
    "}",
    serializeColorTokens(":root", productBrand.theme.color.light),
    serializeColorTokens(".dark", productBrand.theme.color.dark),
  ].join("\n\n");
}

function applyBrandTheme(productBrand: ProductBrand) {
  const styleId = "cloudgrid-brand-theme";
  let style = document.getElementById(styleId) as HTMLStyleElement | null;

  if (!style) {
    style = document.createElement("style");
    style.id = styleId;
    document.head.append(style);
  }

  style.textContent = serializeBrandTheme(productBrand);
  document.documentElement.dataset.brand = productBrand.id;
  document.title = productBrand.pageTitle();
}

export function BrandProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    applyBrandTheme(brand);
  }, []);

  const value = useMemo<BrandContextValue>(
    () => ({
      brand,
      productName: brand.productName,
      renderMark: (className) => {
        const BrandMark = brand.mark;
        return <BrandMark aria-hidden {...(className ? { className } : {})} />;
      },
      shortName: brand.shortName,
    }),
    [],
  );

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

function defaultBrandContext(): BrandContextValue {
  return {
    brand,
    productName: brand.productName,
    renderMark: (className) => {
      const BrandMark = brand.mark;
      return <BrandMark aria-hidden {...(className ? { className } : {})} />;
    },
    shortName: brand.shortName,
  };
}

export function useBrand() {
  const value = useContext(BrandContext);

  return value ?? defaultBrandContext();
}
