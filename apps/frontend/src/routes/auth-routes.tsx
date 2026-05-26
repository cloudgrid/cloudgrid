import { Loader2 } from "lucide-react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { LoginForm, LoginProductPreview } from "../components/login-form";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Card, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { t } from "../lib/i18n";
import { buildLoginUrl, type LoginProvider, resolveRootRedirect } from "../lib/session-state";
import { useAppSession } from "../providers/app-session-provider";
import { useBrand } from "../providers/brand-provider";

export function AuthGate() {
  const { isLoading, mode, viewer } = useAppSession();
  const location = useLocation();

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        <span className="ml-2 text-sm text-muted-foreground">{t("auth.loading")}</span>
      </main>
    );
  }

  if (mode === "deployed" && !viewer) {
    return <Navigate replace to={`/login?returnTo=${encodeURIComponent(location.pathname)}`} />;
  }

  return <Outlet />;
}

export function RootRedirect() {
  const { mode, viewer } = useAppSession();
  return <Navigate replace to={resolveRootRedirect({ mode, viewer })} />;
}

export function LoginRoute() {
  const { mode, viewer } = useAppSession();
  const { productName, renderMark } = useBrand();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const returnTo = params.get("returnTo") || "/projects";

  if (mode === "local" || viewer) {
    return <Navigate replace to="/projects" />;
  }

  const providers: Array<{ id: LoginProvider; label: string; href: string }> = [
    { id: "github", label: t("auth.login.github"), href: buildLoginUrl(returnTo, "github") },
    { id: "google", label: t("auth.login.google"), href: buildLoginUrl(returnTo, "google") },
    { id: "azure", label: t("auth.login.azure"), href: buildLoginUrl(returnTo, "azure") },
  ];

  return (
    <main className="grid min-h-svh bg-background text-foreground lg:grid-cols-2">
      <div className="flex min-h-svh flex-col gap-6 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <a className="flex items-center gap-2 font-medium" href="/">
            <span className="flex size-6 items-center justify-center rounded-md border bg-primary text-primary-foreground">
              {renderMark("size-3.5")}
            </span>
            {productName}
          </a>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <LoginForm
            className="w-full max-w-sm"
            providers={providers}
            showError={params.has("error")}
          />
        </div>
      </div>
      <LoginProductPreview />
    </main>
  );
}

export function AuthCallbackRoute() {
  const location = useLocation();
  const { productName } = useBrand();
  const params = new URLSearchParams(location.search);
  const hasError = params.has("error");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <section className="w-full max-w-md">
        {hasError ? (
          <Alert variant="destructive">
            <AlertTitle>{t("auth.callback.errorTitle")}</AlertTitle>
            <AlertDescription>{t("auth.callback.errorDescription")}</AlertDescription>
          </Alert>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{t("auth.callback.title")}</CardTitle>
              <CardDescription>{t("auth.callback.description", { productName })}</CardDescription>
            </CardHeader>
          </Card>
        )}
      </section>
    </main>
  );
}
