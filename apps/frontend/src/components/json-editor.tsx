"use client";

import { json } from "@codemirror/lang-json";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { cn } from "../lib/utils";
import { useTheme } from "../providers/theme-provider";

const baseTheme = EditorView.theme({
  "&": { borderRadius: "calc(var(--radius) - 2px)" },
  ".cm-scroller": { fontFamily: "var(--font-mono, monospace)", fontSize: "0.8125rem" },
  ".cm-content": { padding: "0.5rem" },
  "&.cm-focused": { outline: "none" },
});

export function JsonEditor({
  className,
  minHeight = "160px",
  onChange,
  placeholder,
  readOnly = false,
  value,
}: {
  className?: string;
  minHeight?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  value: string;
}) {
  const { appliedTheme } = useTheme();

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border focus-within:ring-[3px] focus-within:ring-ring/50",
        className,
      )}
    >
      <CodeMirror
        editable={!readOnly}
        extensions={[json(), baseTheme, EditorView.lineWrapping]}
        {...(onChange ? { onChange } : {})}
        {...(placeholder ? { placeholder } : {})}
        style={{ minHeight }}
        theme={appliedTheme === "dark" ? githubDark : githubLight}
        value={value}
      />
    </div>
  );
}
