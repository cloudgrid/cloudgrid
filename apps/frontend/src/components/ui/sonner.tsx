import { Toaster as SonnerToaster } from "sonner";
import { useTheme } from "../../providers/theme-provider";

export function Toaster() {
  const { appliedTheme } = useTheme();

  return (
    <SonnerToaster
      closeButton
      richColors
      theme={appliedTheme}
      toastOptions={{
        classNames: {
          toast: "border bg-background text-foreground",
          description: "text-muted-foreground",
        },
      }}
    />
  );
}
