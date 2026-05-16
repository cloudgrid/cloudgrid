import { describe, expect, test } from "bun:test";
import { createLogger } from "@cloudgrid/runtime";
import { JSONCodec, type NatsConnection } from "nats";
import { NATSTelemetryQueryBridge } from "./bridge";
import type { NormalizedAuthContext } from "./auth";

describe("NATS control-plane bridge", () => {
  test("maps GraphQL control operations to control-plane request/reply subjects", async () => {
    const codec = JSONCodec<unknown>();
    const requested: Array<{ subject: string; payload: unknown }> = [];
    const connection = {
      request: async (subject: string, data: Uint8Array) => {
        const payload = codec.decode(data);
        requested.push({ subject, payload });
        return {
          data: codec.encode({
            requestId: requestId(payload),
            ok: true,
            data: dataForSubject(subject),
          }),
        };
      },
      drain: async () => {},
      isClosed: () => false,
    } as unknown as NatsConnection;
    const bridge = new NATSTelemetryQueryBridge(connection, 2000, createLogger("bff"));
    const authContext: NormalizedAuthContext = {
      mode: "anonymous",
      authMode: "local",
      tenantId: "local",
      companyId: "local",
      projectId: "default",
      scopes: [],
      readAllowed: true,
      checkedAt: "2026-05-11T00:00:00.000Z",
    };

    const hydratedViewer = await bridge.viewer(authContext);
    await bridge.organizations(authContext);
    await bridge.organization("org-1", authContext);
    await bridge.projects({ organizationId: "org-1", status: "active" }, authContext);
    await bridge.project("project-1", authContext);
    await bridge.createProject({ organizationId: "org-1", name: "API", slug: "api" }, authContext);
    await bridge.updateProject("project-1", { name: "API 2", status: "read_only" }, authContext);
    await bridge.selectProject("project-1", authContext);
    await bridge.updateOrganizationMember(
      { organizationId: "org-1", userId: "user-1", role: "admin" },
      authContext,
    );
    await bridge.removeOrganizationMember(
      { organizationId: "org-1", userId: "user-1" },
      authContext,
    );
    await bridge.ingestCredentials("project-1", authContext);
    await bridge.createIngestCredential(
      { projectId: "project-1", title: "Checkout service" },
      authContext,
    );
    await bridge.revokeIngestCredential("credential-1", authContext);

    expect(hydratedViewer?.organizations[0]?.projects[0]?.telemetry).toMatchObject({
      traceCount: 7,
      logCount: 11,
      metricCount: 3,
      serviceCount: 2,
    });
    expect(requested.map((entry) => entry.subject)).toEqual([
      "control.viewer.get",
      "telemetry.projects.overview",
      "control.organizations.list",
      "telemetry.projects.overview",
      "control.organizations.get",
      "telemetry.projects.overview",
      "control.projects.list",
      "telemetry.projects.overview",
      "control.projects.get",
      "telemetry.projects.overview",
      "control.projects.create",
      "telemetry.projects.overview",
      "control.projects.update",
      "telemetry.projects.overview",
      "control.projects.select",
      "telemetry.projects.overview",
      "control.members.update",
      "control.members.remove",
      "control.ingest_credentials.list",
      "control.ingest_credentials.create",
      "control.ingest_credentials.revoke",
    ]);
    expect(requested[0]?.payload).toMatchObject({ authContext });
    expect(requested[1]?.payload).toMatchObject({
      authContext,
      projects: [{ tenantId: "local", companyId: "org-1", projectId: "project-1" }],
    });
    expect(requested[4]?.payload).toMatchObject({ organizationId: "org-1", authContext });
    expect(requested[6]?.payload).toMatchObject({
      organizationId: "org-1",
      status: "active",
      authContext,
    });
    expect(requested[12]?.payload).toMatchObject({
      projectId: "project-1",
      name: "API 2",
      status: "read_only",
      authContext,
    });
    expect(requested[16]?.payload).toMatchObject({
      organizationId: "org-1",
      userId: "user-1",
      authContext,
    });
    expect(requested[19]?.payload).toMatchObject({ title: "Checkout service", authContext });
    expect(requested[20]?.payload).toMatchObject({ credentialId: "credential-1", authContext });
  });
});

function requestId(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "requestId" in payload &&
    typeof payload.requestId === "string"
  ) {
    return payload.requestId;
  }
  return "request-1";
}

function dataForSubject(subject: string): unknown {
  if (subject === "control.viewer.get" || subject === "control.projects.select") {
    return { viewer: viewer() };
  }
  if (subject === "control.organizations.list") {
    return { items: [organization()] };
  }
  if (subject === "control.organizations.get") {
    return { organization: organization() };
  }
  if (subject === "control.projects.list") {
    return { items: [project()] };
  }
  if (
    subject === "control.projects.get" ||
    subject === "control.projects.create" ||
    subject === "control.projects.update"
  ) {
    return { project: project() };
  }
  if (subject === "telemetry.projects.overview") {
    return {
      items: [
        {
          tenantId: "local",
          companyId: "org-1",
          projectId: "project-1",
          telemetry: {
            traceCount: 7,
            logCount: 11,
            metricCount: 3,
            serviceCount: 2,
            lastIngestAt: "2026-05-15T10:00:00.000Z",
          },
        },
      ],
    };
  }
  if (subject === "control.members.update") {
    return { member: { user: { id: "user-1" }, role: "admin" } };
  }
  if (subject === "control.members.remove") {
    return { removed: true };
  }
  if (subject === "control.ingest_credentials.list") {
    return { items: [ingestCredential()] };
  }
  if (subject === "control.ingest_credentials.create") {
    return { credential: ingestCredential(), secret: "cgk_created_secret_1234567890" };
  }
  if (subject === "control.ingest_credentials.revoke") {
    return { credential: { ...ingestCredential(), revokedAt: "2026-05-11T00:00:00.000Z" } };
  }
  throw new Error(`unexpected subject ${subject}`);
}

function viewer() {
  return {
    user: { id: "user-local" },
    organizations: [organization()],
    selectedProject: project(),
  };
}

function organization() {
  return {
    id: "org-1",
    name: "Local",
    slug: "local",
    role: "admin",
    projects: [project()],
  };
}

function project() {
  return {
    id: "project-1",
    organizationId: "org-1",
    name: "Default",
    slug: "default",
    status: "active",
    telemetry: { traceCount: 0, logCount: 0, metricCount: 0, serviceCount: 0 },
  };
}

function ingestCredential() {
  return {
    id: "credential-1",
    projectId: "project-1",
    title: "Checkout service",
    scopes: ["telemetry:ingest:traces", "telemetry:ingest:logs", "telemetry:ingest:metrics"],
    secretPreview: "cgk_...7890",
    createdAt: "2026-05-11T00:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
    createdByUserId: "user-local",
  };
}
