import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

type ThemeChoice = "light" | "dark" | "system";
type AppliedTheme = "light" | "dark";

const storageKey = "cloudgrid.theme";

interface ThemeContextValue {
  theme: ThemeChoice;
  appliedTheme: AppliedTheme;
  setTheme: (theme: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): ThemeChoice {
  if (typeof window === "undefined") {
    return "system";
  }

  const stored = window.localStorage.getItem(storageKey);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function getSystemTheme(): AppliedTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: AppliedTheme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(readStoredTheme);
  const [systemTheme, setSystemTheme] = useState<AppliedTheme>(getSystemTheme);
  const appliedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemTheme(media.matches ? "dark" : "light");

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    applyTheme(appliedTheme);
  }, [appliedTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      appliedTheme,
      setTheme: (nextTheme) => {
        setThemeState(nextTheme);

        if (nextTheme === "system") {
          window.localStorage.removeItem(storageKey);
          return;
        }

        window.localStorage.setItem(storageKey, nextTheme);
      },
    }),
    [theme, appliedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);

  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return value;
}
