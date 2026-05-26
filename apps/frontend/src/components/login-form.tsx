import {
  Activity,
  AlertCircle,
  Building2,
  CircleUserRound,
  Cloud,
  ShieldCheck,
} from "lucide-react";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useBrand } from "@/providers/brand-provider";

type ProviderId = "github" | "google" | "azure";

interface LoginProviderOption {
  id: ProviderId;
  label: string;
  href: string;
}

interface LoginFormProps extends React.ComponentProps<"section"> {
  providers: LoginProviderOption[];
  showError?: boolean;
}

const providerIcons = {
  github: CircleUserRound,
  google: Cloud,
  azure: Building2,
} satisfies Record<ProviderId, typeof CircleUserRound>;

export function LoginForm({ className, providers, showError = false, ...props }: LoginFormProps) {
  const { productName } = useBrand();

  return (
    <section
      data-login-block="login-02"
      className={cn("flex flex-col gap-5", className)}
      {...props}
    >
      <FieldGroup>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">{t("auth.login.title", { productName })}</h1>
          <p className="text-sm text-muted-foreground">{t("auth.login.description")}</p>
        </div>

        {showError ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden />
            <AlertTitle>{t("auth.login.errorTitle")}</AlertTitle>
            <AlertDescription>{t("auth.login.errorDescription", { productName })}</AlertDescription>
          </Alert>
        ) : null}

        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">{t("auth.login.providerGroup")}</legend>
          {providers.map((provider) => {
            const Icon = providerIcons[provider.id];
            return (
              <Button asChild className="w-full justify-start" key={provider.id} variant="outline">
                <a href={provider.href}>
                  <Icon data-icon="inline-start" />
                  {provider.label}
                </a>
              </Button>
            );
          })}
        </fieldset>

        <div className="flex items-start gap-3 border-t pt-4 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5" aria-hidden />
          <p>{t("auth.login.sessionHint")}</p>
        </div>
      </FieldGroup>
    </section>
  );
}

export function LoginProductPreview() {
  const { productName, renderMark } = useBrand();

  return (
    <aside
      aria-label={t("auth.login.previewLabel", { productName })}
      className="relative hidden overflow-hidden border-l bg-muted lg:block"
    >
      <div className="absolute inset-0 flex items-start justify-start p-8 xl:items-center xl:justify-center">
        <div className="w-full max-w-xs rounded-lg border bg-background xl:max-w-md">
          <div className="flex h-12 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2 font-medium">
              <div className="flex size-6 items-center justify-center rounded-md border bg-primary text-primary-foreground">
                {renderMark("size-3.5")}
              </div>
              {productName}
            </div>
            <div className="hidden rounded-md border px-2 py-1 font-mono text-xs text-muted-foreground xl:block">
              {t("auth.login.previewProject")}
            </div>
          </div>
          <div className="grid grid-cols-[96px_minmax(0,1fr)] xl:grid-cols-[112px_minmax(0,1fr)]">
            <div className="border-r p-3">
              {[t("nav.traces"), t("nav.logs"), t("nav.metrics"), t("nav.dashboards")].map(
                (item) => (
                  <div
                    className="flex h-8 items-center rounded-md px-2 text-sm text-muted-foreground first:bg-muted first:text-foreground"
                    key={item}
                  >
                    {item}
                  </div>
                ),
              )}
            </div>
            <div className="min-w-0 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium">{t("auth.login.previewTitle")}</p>
                  <p className="text-sm text-muted-foreground">{t("auth.login.previewSubtitle")}</p>
                </div>
                <div className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-success">
                  <Activity className="size-3" aria-hidden />
                  {t("auth.login.previewLive")}
                </div>
              </div>
              <div className="mt-4 overflow-hidden rounded-md border">
                {[
                  ["checkout-api", "POST /orders", "164 ms"],
                  ["agent-worker", "tool.call search", "82 ms"],
                  ["billing-api", "GET /invoice", "238 ms"],
                ].map(([service, operation, duration]) => (
                  <div
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b px-3 py-1.5 text-sm last:border-b-0"
                    key={operation}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{service}</span>
                      <span className="block truncate text-muted-foreground">{operation}</span>
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{duration}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 hidden items-center gap-2 text-sm text-muted-foreground xl:flex">
                <ShieldCheck aria-hidden />
                {t("auth.login.previewFooter")}
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
