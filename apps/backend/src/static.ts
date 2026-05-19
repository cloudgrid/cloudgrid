import { extname, resolve, sep } from "node:path";
import type { Env, Hono } from "hono";
import type { RuntimeConfig } from "./config";

type StaticConfig = Pick<RuntimeConfig, "frontendServeStatic" | "frontendStaticDir">;
type StaticAuth = {
  authenticateRequest(request: Request): Promise<unknown>;
};

export function attachStaticRoutes<E extends Env>(
  app: Hono<E>,
  config: StaticConfig,
  auth?: StaticAuth,
) {
  if (!config.frontendServeStatic) {
    return;
  }

  app.get("/assets/*", (context) => serveStaticPath(context.req.url, config, false));
  app.get("*", async (context) => {
    const pathname = new URL(context.req.url).pathname;
    if (isReservedPath(pathname)) {
      return context.notFound();
    }
    if (auth) {
      try {
        await auth.authenticateRequest(context.req.raw);
      } catch {
        return Response.redirect(loginUrl(context.req.url), 302);
      }
    }
    return serveStaticPath(context.req.url, config, true);
  });
}

async function serveStaticPath(url: string, config: StaticConfig, fallbackToIndex: boolean) {
  const root = resolve(config.frontendStaticDir);
  const pathname = decodeURIComponent(new URL(url).pathname);
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  let filePath = resolve(root, `.${requestedPath}`);

  if (!isInside(root, filePath)) {
    return new Response("Not found", { status: 404 });
  }

  let file = Bun.file(filePath);
  if (!(await file.exists()) && fallbackToIndex) {
    filePath = resolve(root, "index.html");
    file = Bun.file(filePath);
  }
  if (!(await file.exists())) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(file, {
    headers: {
      "content-type": contentType(filePath),
    },
  });
}

function isReservedPath(pathname: string): boolean {
  return (
    pathname === "/graphql" ||
    pathname === "/api/health" ||
    pathname === "/livez" ||
    pathname === "/readyz" ||
    pathname.startsWith("/api/")
  );
}

function loginUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  const login = new URL("/auth/login", url.origin);
  login.searchParams.set("returnTo", `${url.pathname}${url.search}`);
  return login;
}

function isInside(root: string, filePath: string): boolean {
  return filePath === root || filePath.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);
}

function contentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
