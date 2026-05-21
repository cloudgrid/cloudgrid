import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

const services = [
  {
    name: "cloudgrid-bff",
    key: "bff",
    dockerfile: "deploy/docker/cloudgrid-bff.Dockerfile",
    ports: ["3000"],
    mayHaveFrontend: true,
  },
  {
    name: "cloudgrid-otlp-collector",
    key: "otlpCollector",
    dockerfile: "deploy/docker/cloudgrid-otlp-collector.Dockerfile",
    ports: ["4318", "4317"],
  },
  {
    name: "cloudgrid-storage-read",
    key: "storageRead",
    dockerfile: "deploy/docker/cloudgrid-storage-read.Dockerfile",
    ports: ["8081"],
    requiresSurrealDB: true,
    requiresSurrealBuildTag: true,
  },
  {
    name: "cloudgrid-storage-write",
    key: "storageWrite",
    dockerfile: "deploy/docker/cloudgrid-storage-write.Dockerfile",
    ports: ["8082"],
    requiresSurrealDB: true,
    requiresSurrealBuildTag: true,
  },
  {
    name: "cloudgrid-control-plane",
    key: "controlPlane",
    dockerfile: "deploy/docker/cloudgrid-control-plane.Dockerfile",
    ports: ["8084"],
    requiresSurrealDB: true,
  },
  {
    name: "cloudgrid-ai-eval-runner",
    key: "aiEvalRunner",
    dockerfile: "deploy/docker/cloudgrid-ai-eval-runner.Dockerfile",
    ports: ["8085"],
  },
  {
    name: "cloudgrid-alert-evaluator",
    key: "alertEvaluator",
    dockerfile: "deploy/docker/cloudgrid-alert-evaluator.Dockerfile",
    ports: ["8086"],
  },
  {
    name: "cloudgrid-storage-maintenance",
    key: "storageMaintenance",
    dockerfile: "deploy/docker/cloudgrid-storage-maintenance.Dockerfile",
    ports: ["8087"],
    requiresSurrealDB: true,
  },
];

const goBinaryServices = services.filter((service) => service.name !== "cloudgrid-bff");
const releaseVersion = "1.0.0-beta";

const forbiddenDockerfilePatterns = [
  { pattern: /\bCOPY\s+\.env\b/i, message: "must not copy .env" },
  { pattern: /\bADD\s+\.env\b/i, message: "must not add .env" },
  { pattern: /CLOUDGRID_SURREALDB_PASSWORD\s*=/i, message: "must not bake SurrealDB passwords" },
  { pattern: /CLOUDGRID_SESSION_SECRET\s*=/i, message: "must not bake session secrets" },
];

export async function validateReleaseArtifacts(root = process.cwd()) {
  const errors = [];
  const read = async (relativePath) => readFile(path.join(root, relativePath), "utf8");

  for (const service of services) {
    const dockerfile = await readText(read, service.dockerfile, errors);
    if (!dockerfile) continue;
    const fromCount = (dockerfile.match(/^FROM\s+/gim) ?? []).length;
    if (fromCount < 2) {
      errors.push(`${service.dockerfile}: must be multi-stage`);
    }
    if (
      !/^USER\s+\$\{?CLOUDGRID_IMAGE_UID\}?/im.test(dockerfile) &&
      !/^USER\s+\d+(:\d+)?/im.test(dockerfile)
    ) {
      errors.push(`${service.dockerfile}: must run as a numeric non-root user`);
    }
    for (const exposed of dockerfile.matchAll(/^EXPOSE\s+(.+)$/gim)) {
      const ports = exposed[1].split(/\s+/).map((port) => port.replace(/\/tcp$/, ""));
      for (const port of ports) {
        if (!service.ports.includes(port)) {
          errors.push(`${service.dockerfile}: exposes unowned port ${port}`);
        }
      }
    }
    for (const port of service.ports) {
      if (!new RegExp(`^EXPOSE\\s+.*\\b${port}\\b`, "im").test(dockerfile)) {
        errors.push(`${service.dockerfile}: does not expose owned port ${port}`);
      }
    }
    for (const forbidden of forbiddenDockerfilePatterns) {
      if (forbidden.pattern.test(dockerfile)) {
        errors.push(`${service.dockerfile}: ${forbidden.message}`);
      }
    }
    if (!service.mayHaveFrontend && /apps\/frontend|apps\/backend\/public/i.test(dockerfile)) {
      errors.push(`${service.dockerfile}: only the BFF image may contain frontend assets`);
    }
    if (service.requiresSurrealBuildTag && !/-tags[= ]surrealdb/.test(dockerfile)) {
      errors.push(`${service.dockerfile}: must preserve the Go surrealdb build tag`);
    }
  }

  const chart = await readYaml(read, "charts/cloudgrid/Chart.yaml", errors);
  const values = await readYaml(read, "charts/cloudgrid/values.yaml", errors);
  const compose = await readYaml(read, "deploy/compose/cloudgrid.compose.yaml", errors);
  const composeEnv = await readText(read, "deploy/compose/cloudgrid.env.example", errors);
  const natsConfig = await readText(read, "deploy/compose/nats.conf", errors);
  const composeScript = await readText(read, "deploy/compose/cloudgrid-local.sh", errors);
  const rootPackage = await readJson(read, "package.json", errors);
  if (rootPackage?.version !== releaseVersion) {
    errors.push(`package.json: version must be ${releaseVersion}`);
  }
  if (chart?.name !== "cloudgrid") {
    errors.push("charts/cloudgrid/Chart.yaml: chart name must be cloudgrid");
  }
  if (chart?.version !== releaseVersion || chart?.appVersion !== releaseVersion) {
    errors.push(`charts/cloudgrid/Chart.yaml: version and appVersion must be ${releaseVersion}`);
  }
  if (values) {
    if (values.global?.imageRegistry !== "ghcr.io/cloudgrid-dev") {
      errors.push("charts/cloudgrid/values.yaml: global.imageRegistry must match documented shape");
    }
    for (const service of services) {
      const serviceValues = values[service.key];
      if (!serviceValues) {
        errors.push(`charts/cloudgrid/values.yaml: missing ${service.key} values`);
        continue;
      }
      if (!serviceValues.image || !("digest" in serviceValues.image)) {
        errors.push(
          `charts/cloudgrid/values.yaml: ${service.key}.image.digest support is required`,
        );
      }
      if (service.requiresSurrealDB && !serviceValues.surrealdbSecret) {
        errors.push(
          `charts/cloudgrid/values.yaml: ${service.key} must declare SurrealDB secret use`,
        );
      }
      if (!service.requiresSurrealDB && serviceValues.surrealdbSecret) {
        errors.push(
          `charts/cloudgrid/values.yaml: ${service.key} must not receive SurrealDB credentials`,
        );
      }
    }
    if (values.nats?.service?.type && values.nats.service.type !== "ClusterIP") {
      errors.push("charts/cloudgrid/values.yaml: bundled NATS must be private ClusterIP");
    }
    if ((values.nats?.bundled?.maxPayloadBytes ?? 0) < 4 * 1024 * 1024) {
      errors.push(
        "charts/cloudgrid/values.yaml: bundled NATS maxPayloadBytes must cover the default OTLP request limit",
      );
    }
    if (values.surrealdb?.service?.type && values.surrealdb.service.type !== "ClusterIP") {
      errors.push("charts/cloudgrid/values.yaml: bundled SurrealDB must be private ClusterIP");
    }
  }

  if (compose) {
    for (const service of services) {
      const serviceName = service.name.replace(/^cloudgrid-/, "");
      const composeService =
        compose.services?.[serviceName] ??
        compose.services?.[service.key] ??
        compose.services?.[service.name] ??
        compose.services?.[service.name.replace("cloudgrid-", "")];
      if (!composeService) {
        errors.push(`deploy/compose/cloudgrid.compose.yaml: missing ${service.name} service`);
        continue;
      }
      if (!String(composeService.image ?? "").includes(service.name)) {
        errors.push(
          `deploy/compose/cloudgrid.compose.yaml: ${service.name} must use published image`,
        );
      }
    }
    for (const dependency of ["nats", "surrealdb"]) {
      const ports = compose.services?.[dependency]?.ports ?? [];
      if (!ports.every((port) => String(port).startsWith("127.0.0.1:"))) {
        errors.push(
          `deploy/compose/cloudgrid.compose.yaml: ${dependency} ports must bind to localhost only`,
        );
      }
    }
    if (
      !String(compose.services?.nats?.environment?.CLOUDGRID_NATS_MAX_PAYLOAD ?? "").includes(
        "8388608",
      )
    ) {
      errors.push("deploy/compose/cloudgrid.compose.yaml: NATS max payload env default required");
    }
    if (
      !String(compose.services?.bff?.environment?.CLOUDGRID_FRONTEND_SERVE_STATIC).includes("true")
    ) {
      errors.push("deploy/compose/cloudgrid.compose.yaml: BFF must serve built frontend assets");
    }
  }
  if (!composeEnv.includes("CLOUDGRID_IMAGE_TAG=v1.0.0-beta")) {
    errors.push("deploy/compose/cloudgrid.env.example: must default to current beta image tag");
  }
  if (!natsConfig.includes("max_payload: $CLOUDGRID_NATS_MAX_PAYLOAD")) {
    errors.push("deploy/compose/nats.conf: must configure max_payload from environment");
  }
  for (const required of [
    "cloudgrid.compose.yaml",
    "cloudgrid.env.example",
    "docker compose",
    "up -d",
    "down -v",
  ]) {
    if (!composeScript.includes(required)) {
      errors.push(`deploy/compose/cloudgrid-local.sh: missing ${required}`);
    }
  }

  const chartFiles = await readDirectoryText(root, "charts/cloudgrid/templates", errors);
  const renderedSource = Object.values(chartFiles).join("\n");
  const ingressSource = chartFiles["ingress.yaml"] ?? "";
  if (!/cloudgrid-bff/.test(ingressSource) || !/kind:\s+Ingress/.test(ingressSource)) {
    errors.push("charts/cloudgrid/templates: BFF ingress support is required");
  }
  if (!/cloudgrid-otlp-collector/.test(ingressSource) || !/kind:\s+Ingress/.test(ingressSource)) {
    errors.push("charts/cloudgrid/templates: collector ingress support is required");
  }
  if (
    /kind:\s+Ingress[\s\S]*(nats|surrealdb|storage-read|storage-write|control-plane|ai-eval-runner)/i.test(
      ingressSource,
    )
  ) {
    errors.push("charts/cloudgrid/templates: only BFF and collector may be ingress candidates");
  }
  if (!/secretKeyRef:[\s\S]*CLOUDGRID_SURREALDB_PASSWORD/.test(renderedSource)) {
    errors.push("charts/cloudgrid/templates: SurrealDB password must come from a secret reference");
  }
  const hardeningSource = `${renderedSource}\n${await readText(read, "charts/cloudgrid/values.yaml", errors)}`;
  if (
    !/readOnlyRootFilesystem:[\s\n]+true/.test(hardeningSource) ||
    !/allowPrivilegeEscalation:[\s\n]+false/.test(hardeningSource)
  ) {
    errors.push("charts/cloudgrid/templates: hardened container security context is required");
  }

  for (const profile of ["local", "small", "enterprise"]) {
    const profileValues = await readYaml(read, `charts/cloudgrid/profiles/${profile}.yaml`, errors);
    if (!profileValues) continue;
    if (profile === "enterprise" && profileValues.surrealdb?.bundled?.enabled !== false) {
      errors.push(
        "charts/cloudgrid/profiles/enterprise.yaml: enterprise profile must not enable bundled SurrealDB",
      );
    }
  }

  const workflow = await readText(read, ".github/workflows/release.yml", errors);
  if (workflow) {
    for (const image of services.map((service) => service.name)) {
      if (!workflow.includes(image)) {
        errors.push(`.github/workflows/release.yml: missing ${image} image build`);
      }
    }
    for (const required of [
      "linux/amd64,linux/arm64",
      "workflow_dispatch",
      "Create release tag",
      "git tag -a",
      "syft",
      "grype",
      "cosign",
      "helm lint",
      "helm template",
      "cloudgrid.compose.yaml",
      "cloudgrid-local.sh",
      "id-token: write",
      "attestations: write",
    ]) {
      if (!workflow.includes(required)) {
        errors.push(`.github/workflows/release.yml: missing ${required}`);
      }
    }
    for (const image of goBinaryServices.map((service) => service.name)) {
      if (!workflow.includes(`${image} ./core/`)) {
        errors.push(`.github/workflows/release.yml: missing ${image} binary archive`);
      }
    }
    for (const required of [
      "linux",
      "darwin",
      "windows",
      "checksums.txt.sig",
      "artifacts/binaries/*.zip",
    ]) {
      if (!workflow.includes(required)) {
        errors.push(
          `.github/workflows/release.yml: missing binary release support for ${required}`,
        );
      }
    }
    if (/\bsecrets\./i.test(workflow)) {
      errors.push(".github/workflows/release.yml: must not assume long-lived registry secrets");
    }
  }

  return { errors };
}

async function readText(read, relativePath, errors) {
  try {
    return await read(relativePath);
  } catch (error) {
    errors.push(`${relativePath}: missing or unreadable (${error.code ?? error.message})`);
    return "";
  }
}

async function readYaml(read, relativePath, errors) {
  const text = await readText(read, relativePath, errors);
  if (!text) return undefined;
  try {
    return YAML.parse(text);
  } catch (error) {
    errors.push(`${relativePath}: invalid YAML (${error.message})`);
    return undefined;
  }
}

async function readJson(read, relativePath, errors) {
  const text = await readText(read, relativePath, errors);
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(`${relativePath}: invalid JSON (${error.message})`);
    return undefined;
  }
}

async function readDirectoryText(root, relativePath, errors) {
  const directory = path.join(root, relativePath);
  try {
    const entries = await readdir(directory);
    const files = {};
    for (const entry of entries) {
      const fullPath = path.join(directory, entry);
      if ((await stat(fullPath)).isFile()) {
        files[entry] = await readFile(fullPath, "utf8");
      }
    }
    return files;
  } catch (error) {
    errors.push(`${relativePath}: missing or unreadable (${error.code ?? error.message})`);
    return {};
  }
}

if (import.meta.main) {
  const result = await validateReleaseArtifacts();
  if (result.errors.length > 0) {
    console.error(result.errors.map((error) => `- ${error}`).join("\n"));
    process.exit(1);
  }
  console.log("Release artifact validation passed.");
}
