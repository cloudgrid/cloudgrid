export interface HandbookNavItem {
  label: string;
  href: string;
  description?: string;
  children?: HandbookNavItem[];
}

export const handbookNav: HandbookNavItem[] = [
  {
    label: "Overview",
    href: "/handbook",
    description: "Read the product boundary, runtime choices, and first path.",
    children: [
      { label: "What CloudGrid is", href: "/handbook/overview/what-is-cloudgrid" },
      { label: "Runtime modes", href: "/handbook/overview/runtime-modes" },
      { label: "Product tour", href: "/handbook/overview/product-tour" },
    ],
  },
  {
    label: "Getting started",
    href: "/handbook/getting-started",
    description: "Start from released images or from source, then send data.",
    children: [
      { label: "Install AI skills", href: "/handbook/getting-started/install-skills" },
      { label: "Release Compose", href: "/handbook/getting-started/docker-compose-release" },
      { label: "Local quickstart", href: "/handbook/getting-started/local-quickstart" },
      { label: "Send telemetry", href: "/handbook/getting-started/send-telemetry" },
      { label: "Verify the repository", href: "/handbook/getting-started/verify-the-repo" },
    ],
  },
  {
    label: "Concepts",
    href: "/handbook/concepts",
    description: "Companies, projects, signals, live traces, metrics, and lifecycle.",
    children: [
      {
        label: "Companies, projects, and access",
        href: "/handbook/concepts/companies-projects-access",
      },
      { label: "Telemetry signals", href: "/handbook/concepts/telemetry-signals" },
      { label: "Live traces", href: "/handbook/concepts/live-traces" },
      { label: "Metrics and dashboards", href: "/handbook/concepts/metrics-dashboards" },
      { label: "Retention and alerts", href: "/handbook/concepts/retention-alerts" },
    ],
  },
  {
    label: "Guides",
    href: "/handbook/guides",
    description: "Task guides for ingestion, investigation, dashboards, and AI Chat.",
    children: [
      { label: "Ingest OTLP", href: "/handbook/guides/ingest-otlp" },
      { label: "Project API keys", href: "/handbook/guides/project-api-keys" },
      { label: "Trace investigation", href: "/handbook/guides/trace-investigation" },
      { label: "Logs", href: "/handbook/guides/logs" },
      { label: "Metrics", href: "/handbook/guides/metrics" },
      { label: "Dashboards", href: "/handbook/guides/dashboards" },
      { label: "AI Chat", href: "/handbook/guides/ai-chat" },
      { label: "AI Evaluation legacy guide", href: "/handbook/guides/ai-eval" },
    ],
  },
  {
    label: "Evaluations",
    href: "/handbook/evaluations",
    description: "Build datasets, run evaluations, compare candidates, and optimize targets.",
    children: [
      { label: "Overview", href: "/handbook/evaluations" },
      { label: "Datasets", href: "/handbook/evaluations/datasets" },
      { label: "Evaluations", href: "/handbook/evaluations/evaluations" },
      { label: "Optimizations", href: "/handbook/evaluations/optimizations" },
    ],
  },
  {
    label: "Configuration",
    href: "/handbook/configuration",
    description: "Local mode, deployed mode, SSO, SMTP, storage, and runtime values.",
    children: [
      {
        label: "Local mode",
        href: "/handbook/configuration/local",
        children: [
          { label: "Setup script", href: "/handbook/configuration/local/setup-script" },
          {
            label: "Project-token routing",
            href: "/handbook/configuration/local/project-token-routing",
          },
          { label: "Self-observability", href: "/handbook/configuration/local/self-observability" },
        ],
      },
      {
        label: "Deployed mode",
        href: "/handbook/configuration/deployed",
        children: [
          { label: "Deployment choices", href: "/handbook/deployment" },
          { label: "Kubernetes", href: "/handbook/configuration/deployed/kubernetes" },
          { label: "Helm install", href: "/handbook/configuration/deployed/helm-install" },
          {
            label: "External dependencies",
            href: "/handbook/configuration/deployed/external-dependencies",
          },
          {
            label: "Image customization",
            href: "/handbook/configuration/deployed/image-customization",
          },
          {
            label: "Private registry",
            href: "/handbook/configuration/deployed/private-registry",
          },
          { label: "Invitations", href: "/handbook/configuration/deployed/invitations" },
          { label: "Invitation email", href: "/handbook/configuration/deployed/invitation-email" },
          { label: "Provider secrets", href: "/handbook/configuration/deployed/provider-secrets" },
          {
            label: "Self-observability",
            href: "/handbook/configuration/deployed/self-observability",
          },
        ],
      },
      {
        label: "SSO providers",
        href: "/handbook/configuration/deployed/sso",
        children: [
          { label: "GitHub", href: "/handbook/configuration/deployed/sso/github" },
          { label: "Google", href: "/handbook/configuration/deployed/sso/google" },
          { label: "Azure Entra ID", href: "/handbook/configuration/deployed/sso/azure" },
        ],
      },
      { label: "Runtime environment", href: "/handbook/configuration/runtime-environment" },
      { label: "SurrealDB storage", href: "/handbook/configuration/storage-surrealdb" },
    ],
  },
  {
    label: "Operations",
    href: "/handbook/operations",
    description: "Start, stop, monitor, troubleshoot, and assess production readiness.",
    children: [
      { label: "Start, stop, and reset", href: "/handbook/operations/start-stop-reset" },
      { label: "Health and readiness", href: "/handbook/operations/health-readiness" },
      { label: "Message bridge", href: "/handbook/operations/message-bridge" },
      { label: "Retention", href: "/handbook/operations/retention" },
      { label: "Alerting", href: "/handbook/operations/alerting" },
      { label: "Troubleshooting", href: "/handbook/operations/troubleshooting" },
      { label: "Production readiness", href: "/handbook/operations/production-readiness" },
      { label: "Release verification", href: "/handbook/operations/release-verification" },
      { label: "Upgrade and rollback", href: "/handbook/operations/upgrade-rollback" },
      { label: "Sizing and scaling", href: "/handbook/operations/sizing" },
    ],
  },
  {
    label: "Architecture",
    href: "/handbook/architecture",
    description: "Service ownership, bridge flows, tenancy, and security boundaries.",
    children: [
      { label: "Services", href: "/handbook/architecture/services" },
      { label: "Service boundaries", href: "/handbook/architecture/service-boundaries" },
      { label: "Message bridge", href: "/handbook/architecture/message-bridge" },
      { label: "Ingest flow", href: "/handbook/architecture/ingest-flow" },
      { label: "Read flow", href: "/handbook/architecture/read-flow" },
      { label: "Live trace flow", href: "/handbook/architecture/live-trace-flow" },
      { label: "Tenancy and security", href: "/handbook/architecture/tenancy-security" },
      {
        label: "Extension boundaries",
        href: "/handbook/adapters",
        children: [
          { label: "Storage adapter", href: "/handbook/adapters/storage" },
          { label: "Bridge adapter", href: "/handbook/adapters/bridge" },
          { label: "Auth provider adapter", href: "/handbook/adapters/auth" },
          { label: "Harness adapter", href: "/handbook/adapters/harness" },
          { label: "Public API clients", href: "/handbook/adapters/public-api-clients" },
        ],
      },
    ],
  },
  {
    label: "Reference",
    href: "/handbook/reference",
    description: "Commands, environment variables, ports, routes, contracts, and errors.",
    children: [
      { label: "Commands", href: "/handbook/reference/commands" },
      { label: "Environment variables", href: "/handbook/reference/environment-variables" },
      { label: "Ports", href: "/handbook/reference/ports" },
      { label: "Routes", href: "/handbook/reference/routes" },
      { label: "Contracts", href: "/handbook/reference/contracts" },
      { label: "Errors", href: "/handbook/reference/errors" },
    ],
  },
];

export const handbookTopNav = [
  handbookNav[0],
  handbookNav[1],
  handbookNav[5],
  handbookNav[6],
  handbookNav[8],
];
