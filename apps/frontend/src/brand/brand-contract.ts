import type { ComponentType, ReactNode } from "react";

export type BrandAppearanceMode = "light" | "dark";

export interface BrandColorTokens {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  border: string;
  input: string;
  ring: string;
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
  info: string;
  success: string;
  warning: string;
  error: string;
  trace: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarPrimary: string;
  sidebarPrimaryForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  sidebarBorder: string;
  sidebarRing: string;
}

export interface BrandTypographyTokens {
  sans: string;
  mono: string;
}

export interface BrandRadiusTokens {
  base: string;
}

export interface BrandTheme {
  radius: BrandRadiusTokens;
  typography: BrandTypographyTokens;
  color: Record<BrandAppearanceMode, BrandColorTokens>;
}

export interface ProductBrand {
  id: string;
  productName: string;
  shortName: string;
  homeUrl?: string;
  mark: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  pageTitle: (pageTitle?: string) => string;
  theme: BrandTheme;
}

export interface BrandContextValue {
  brand: ProductBrand;
  productName: string;
  shortName: string;
  renderMark: (className?: string) => ReactNode;
}
