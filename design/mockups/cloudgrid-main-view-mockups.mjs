import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = dirname(fileURLToPath(import.meta.url));

const W = 1440;
const H = 1024;
const top = 56;
const side = 232;
const pad = 16;
const routeX = side;
const routeY = top;
const routeW = W - side;
const routeH = H - top;

const c = {
  bg: "#ffffff",
  fg: "#09090b",
  muted: "#71717a",
  faint: "#a1a1aa",
  line: "#e4e4e7",
  line2: "#f0f0f1",
  soft: "#f4f4f5",
  softer: "#fafafa",
  primary: "#18181b",
  blue: "#2563eb",
  green: "#16a34a",
  amber: "#d97706",
  red: "#dc2626",
  violet: "#7c3aed",
  cyan: "#0891b2",
};

const esc = (v) =>
  String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const t = (x, y, text, cls = "body", attrs = "") =>
  `<text x="${x}" y="${y}" class="${cls}" ${attrs}>${esc(text)}</text>`;

const rect = (x, y, w, h, fill = c.bg, stroke = c.line, r = 6, attrs = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" ${attrs}/>`;

const line = (x1, y1, x2, y2, stroke = c.line, attrs = "") =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" ${attrs}/>`;

const chip = (x, y, label, tone = "neutral", w = Math.max(56, label.length * 7 + 22)) => {
  const tones = {
    neutral: [c.soft, c.line, c.fg],
    ok: ["#f0fdf4", "#bbf7d0", c.green],
    warn: ["#fffbeb", "#fde68a", c.amber],
    err: ["#fef2f2", "#fecaca", c.red],
    info: ["#eff6ff", "#bfdbfe", c.blue],
    trace: ["#f5f3ff", "#ddd6fe", c.violet],
  };
  const [fill, stroke, fg] = tones[tone] ?? tones.neutral;
  return `${rect(x, y, w, 24, fill, stroke, 5)}${t(x + 10, y + 16, label, "label", `fill="${fg}"`)}`;
};

const button = (x, y, label, kind = "secondary", w = Math.max(78, label.length * 7 + 34)) => {
  const primary = kind === "primary";
  return `${rect(x, y, w, 32, primary ? c.primary : c.bg, primary ? c.primary : c.line, 6)}
    ${t(x + 14, y + 21, label, "button", `fill="${primary ? "#fafafa" : c.fg}"`)}`;
};

const svg = (title, body) => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}">
  <style>
    .title{font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-size:21px;font-weight:650;fill:${c.fg};letter-spacing:0}
    .h{font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-size:14px;font-weight:600;fill:${c.fg};letter-spacing:0}
    .body{font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-size:13px;font-weight:400;fill:${c.fg};letter-spacing:0}
    .muted{font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:400;fill:${c.muted};letter-spacing:0}
    .label{font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-size:11px;font-weight:500;fill:${c.muted};letter-spacing:0}
    .button{font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:500;letter-spacing:0}
    .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;font-weight:400;fill:${c.fg};letter-spacing:0}
    .mono-muted{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;font-weight:400;fill:${c.muted};letter-spacing:0}
    .tiny{font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-size:9px;font-weight:500;fill:${c.muted};letter-spacing:0}
  </style>
  <rect width="${W}" height="${H}" fill="${c.bg}"/>
  ${body}
</svg>
`;

const topbar = () => `
  ${rect(0, 0, W, top, c.bg, "none", 0)}
  ${line(0, top, W, top)}
  <rect x="16" y="16" width="24" height="24" rx="5" fill="${c.primary}"/>
  ${t(50, 34, "CloudGrid", "h")}
  ${rect(426, 12, 320, 32, c.bg, c.line, 6)}
  ${t(442, 32, "Personal / checkout-platform", "label", `fill="${c.fg}"`)}
  ${rect(762, 12, 264, 32, c.bg, c.line, 6)}
  ${t(778, 32, "Search commands...", "label")}
  ${button(1182, 12, "Setup", "secondary", 76)}
  ${button(1270, 12, "Docs", "secondary", 64)}
  <circle cx="1388" cy="28" r="15" fill="${c.soft}" stroke="${c.line}"/>
`;

const sidebar = (active = "Traces") => {
  const items = ["AI Chat", "Traces", "Logs", "Metrics", "Dashboards", "Evaluations"];
  return `
    ${rect(0, top, side, H - top, c.softer, "none", 0)}
    ${line(side, top, side, H)}
    ${t(20, 88, "Project", "label")}
    ${t(20, 108, "checkout-platform", "h")}
    ${t(20, 128, "production", "muted")}
    ${line(16, 148, side - 16, 148, c.line2)}
    ${items
      .map((it, i) => {
        const y = 166 + i * 38;
        const on = it === active;
        return `${rect(12, y, side - 24, 30, on ? c.soft : "transparent", on ? c.line : "transparent", 6)}
          <circle cx="28" cy="${y + 15}" r="4" fill="${on ? c.primary : c.faint}"/>
          ${t(42, y + 20, it, "body", `fill="${on ? c.fg : c.muted}"`)}`;
      })
      .join("")}
    ${line(16, H - 76, side - 16, H - 76, c.line2)}
    <circle cx="28" cy="${H - 46}" r="4" fill="${c.faint}"/>
    ${t(42, H - 41, "Project settings", "body", `fill="${c.muted}"`)}
  `;
};

const shell = (active, content) => `${topbar()}${sidebar(active)}${content}`;

const routeHeader = (title, desc, actions = "") => `
  ${t(routeX + pad, routeY + 37, title, "title")}
  ${t(routeX + pad, routeY + 59, desc, "muted")}
  ${actions}
  ${line(routeX, routeY + 80, W, routeY + 80)}
`;

const filterBar = (y, items, chips = []) => `
  ${rect(routeX + pad, y, routeW - pad * 2, 78, c.bg, c.line, 8)}
    ${items.map((item, i) => rect(routeX + pad + 14 + i * 168, y + 12, 150, 30, c.bg, c.line, 6) + t(routeX + pad + 26 + i * 168, y + 32, item, "label")).join("")}
  ${chips.map((item, i) => chip(routeX + pad + 14 + i * 154, y + 48, item, i === 1 ? "err" : "neutral", 142)).join("")}
`;

const traceOverview = () => {
  const y = routeY + 96;
  const rows = [
    ["checkout-api", "POST /checkout", "trc_92ad6f", "12:04:18", "842 ms", "error", "31", "3", "8"],
    ["agent-svc", "agent.run", "trc_a18fc2", "12:04:02", "611 ms", "ok", "18", "0", "5"],
    ["payments", "POST /capture", "trc_c44391", "12:03:44", "1.22 s", "error", "24", "2", "6"],
    ["frontend", "GET /cart", "trc_d091be", "12:03:11", "122 ms", "ok", "9", "0", "3"],
    ["llm-router", "llm.chat", "trc_b82190", "12:02:52", "2.80 s", "warn", "15", "1", "4"],
  ];
  const tableX = routeX + pad + 276;
  const tableY = y + 92;
  return svg(
    "CloudGrid trace overview mockup",
    shell(
      "Traces",
      `
    ${routeHeader("Traces", "Search history or receive traces live in the selected project.", `${button(W - 228, routeY + 24, "History", "primary", 88)}${button(W - 128, routeY + 24, "Live", "secondary", 72)}`)}
    ${filterBar(y, ["Last 30 minutes", "Service", "Status", "Duration", "Search"], ["service=checkout-api", "status=error"])}
    ${rect(routeX + pad, tableY, 252, routeH - 108 - 92, c.bg, c.line, 8)}
    ${t(routeX + pad + 16, tableY + 28, "Facets", "h")}
    ${["Services", "Operations", "Span names", "Attribute keys"].map((g, i) => `${t(routeX + pad + 16, tableY + 64 + i * 110, g, "label")}${[0, 1, 2].map((_, j) => `${rect(routeX + pad + 16, tableY + 78 + i * 110 + j * 25, 220, 20, j === 0 ? c.soft : "transparent", j === 0 ? c.line : "transparent", 4)}${t(routeX + pad + 26, tableY + 93 + i * 110 + j * 25, ["checkout-api", "agent.run", "http.route", "gen_ai.operation"][i] ?? "value", "muted")}${t(routeX + pad + 210, tableY + 93 + i * 110 + j * 25, `${64 - j * 18}`, "mono-muted", `text-anchor="end"`)}`).join("")}`).join("")}
    ${rect(tableX, tableY, W - tableX - pad, routeH - 108 - 92, c.bg, c.line, 8)}
    ${["Service", "Operation", "Trace ID", "Started", "Duration", "Status", "Spans", "Errors", "Logs"].map((h, i) => t(tableX + 18 + [0, 132, 304, 430, 540, 650, 738, 808, 878][i], tableY + 34, h, "label")).join("")}
    ${line(tableX, tableY + 48, W - pad, tableY + 48)}
    ${rows
      .map((r, i) => {
        const ry = tableY + 49 + i * 54;
        const tone = r[5] === "error" ? "err" : r[5] === "warn" ? "warn" : "ok";
        return `${rect(tableX, ry, W - tableX - pad, 54, i === 0 ? "#fafafa" : "transparent", "transparent", 0)}
        ${line(tableX, ry + 54, W - pad, ry + 54, c.line2)}
        <rect x="${tableX + 18}" y="${ry + 20}" width="8" height="8" rx="2" fill="${[c.blue, c.violet, c.amber, c.green, c.cyan][i]}"/>
        ${t(tableX + 34, ry + 34, r[0], "body")}
        ${t(tableX + 150, ry + 34, r[1], "body")}
        ${t(tableX + 322, ry + 34, r[2], "mono")}
        ${t(tableX + 448, ry + 34, r[3], "mono-muted")}
        ${t(tableX + 558, ry + 34, r[4], "mono")}
        ${chip(tableX + 662, ry + 15, r[5], tone, 64)}
        ${t(tableX + 758, ry + 34, r[6], "mono-muted")}
        ${t(tableX + 828, ry + 34, r[7], "mono-muted")}
        ${t(tableX + 896, ry + 34, r[8], "mono-muted")}
        <rect x="${tableX + 558}" y="${ry + 40}" width="${42 + i * 22}" height="3" rx="2" fill="${r[5] === "error" ? c.red : c.faint}" opacity=".6"/>`;
      })
      .join("")}
  `,
    ),
  );
};

const traceDetail = () => {
  const x = routeX + pad;
  const y = routeY + 24;
  const inspectorX = W - 404;
  const workW = inspectorX - x - 12;
  const scale = 0.64;
  const rows = [
    ["checkout-api", "POST /checkout", 8, 818, c.red, "error"],
    ["auth-svc", "auth.verify", 50, 92, c.green, "ok"],
    ["cart-svc", "cart.lookup", 132, 150, c.blue, "ok"],
    ["payment-svc", "payment.capture", 302, 382, c.red, "error"],
    ["llm-router", "fraud.assess", 372, 230, c.violet, "warn"],
    ["storage-read", "query customer risk", 620, 94, c.cyan, "ok"],
  ];
  return svg(
    "CloudGrid trace detail mockup",
    shell(
      "Traces",
      `
    ${t(x, y + 12, "‹", "title")}${t(x + 28, y + 10, "Traces / trc_92ad6f", "muted")}
    ${t(x, y + 48, "POST /checkout", "title")}${t(x, y + 70, "trc_92ad6f · checkout-api · 842 ms · started 12:04:18.421", "mono-muted")}
    ${button(inspectorX - 248, y + 32, "Waterfall", "primary", 100)}${button(inspectorX - 136, y + 32, "Flow", "secondary", 68)}${button(inspectorX - 56, y + 32, "Full", "secondary", 56)}
    ${rect(x, y + 92, workW, 586, c.bg, c.line, 8)}
    ${t(x + 16, y + 120, "Trace waterfall", "h")}${rect(x + 568, y + 101, 220, 28, c.bg, c.line, 6)}${t(x + 580, y + 120, "Search spans", "label")}
    ${[0, 25, 50, 75, 100].map((p, i) => `${line(x + 210 + i * 156, y + 154, x + 210 + i * 156, y + 648, c.line2)}${t(x + 210 + i * 156, y + 146, `${p}%`, "tiny")}`).join("")}
    ${rows
      .map((r, i) => {
        const ry = y + 170 + i * 64;
        return `${line(x, ry + 50, x + workW, ry + 50, c.line2)}
        ${t(x + 16 + (i % 3) * 14, ry + 22, r[0], "muted")}
        ${t(x + 150 + (i % 3) * 14, ry + 22, r[1], "mono")}
        ${chip(x + 150 + (i % 3) * 14, ry + 30, r[5], r[5] === "error" ? "err" : r[5] === "warn" ? "warn" : "ok", 58)}
        <rect x="${x + 210 + r[2] * scale}" y="${ry + 10}" width="${r[3] * scale}" height="18" rx="3" fill="${r[4]}" opacity=".18" stroke="${r[4]}"/>
        ${t(x + 220 + r[2] * scale, ry + 24, `${r[3]} ms`, "mono", `fill="${c.fg}"`)}`;
      })
      .join("")}
    ${rect(x, y + 690, workW, 210, c.bg, c.line, 8)}
    ${t(x + 16, y + 718, "Correlated logs", "h")}${chip(x + 140, y + 701, "selected span", "trace", 104)}${chip(x + 252, y + 701, "whole trace", "neutral", 92)}
    ${["12:04:18.890 ERROR payment.capture declined by provider", "12:04:18.912 WARN fraud.assess high risk score", "12:04:19.018 INFO checkout completed status=partial"].map((r, i) => `${line(x, y + 746 + i * 42, x + workW, y + 746 + i * 42, c.line2)}${t(x + 16, y + 772 + i * 42, r, "mono-muted")}`).join("")}
    ${rect(inspectorX, y + 92, 388, 808, c.bg, c.line, 8)}
    ${t(inspectorX + 16, y + 122, "payment.capture", "h")}${chip(inspectorX + 270, y + 103, "error", "err", 68)}
    ${t(inspectorX + 16, y + 148, "payment-svc · client · 382 ms", "mono-muted")}
    ${line(inspectorX, y + 170, W - pad, y + 170)}
    ${["Attributes", "Events", "Exceptions", "Links"].map((tab, i) => `${rect(inspectorX + 12 + i * 90, y + 184, 82, 28, i === 0 ? c.soft : "transparent", i === 0 ? c.line : "transparent", 5)}${t(inspectorX + 24 + i * 90, y + 203, tab, "label", `fill="${i === 0 ? c.fg : c.muted}"`)}`).join("")}
    ${["http.method  POST", "http.route  /checkout", "payment.provider  stripe", "error.type  ProviderDeclined", "cloud.region  eu-central-1"].map((r, i) => `${line(inspectorX + 16, y + 244 + i * 44, W - pad - 16, y + 244 + i * 44, c.line2)}${t(inspectorX + 24, y + 272 + i * 44, r, "mono")}`).join("")}
  `,
    ),
  );
};

const metrics = () => {
  const x = routeX + pad;
  const y = routeY + 96;
  const listW = 282;
  const inspW = 330;
  const midX = x + listW + 12;
  const inspX = W - pad - inspW;
  const points = [
    72, 66, 60, 70, 82, 78, 88, 76, 92, 98, 90, 104, 112, 106, 118, 130, 122, 138, 126, 144, 150,
    142, 156, 164, 152,
  ];
  const chartStep = (inspX - midX - 150) / (points.length - 1);
  const path = points
    .map((p, i) => `${i ? "L" : "M"} ${midX + 54 + i * chartStep} ${y + 342 - p}`)
    .join(" ");
  return svg(
    "CloudGrid metrics mockup",
    shell(
      "Metrics",
      `
    ${routeHeader("Metrics", "Find project metrics and inspect raw series.", `${button(W - 212, routeY + 24, "Refresh", "secondary", 84)}${button(W - 116, routeY + 24, "Copy URL", "secondary", 88)}`)}
    ${rect(x, y, listW, routeH - 112, c.bg, c.line, 8)}
    ${t(x + 16, y + 28, "Metric list", "h")}${rect(x + 16, y + 44, listW - 32, 30, c.bg, c.line, 6)}${t(x + 28, y + 64, "Search metrics", "label")}
    ${["http.server.duration", "gen_ai.token.count", "process.cpu.usage", "db.client.duration", "queue.depth"].map((m, i) => `${rect(x + 10, y + 86 + i * 68, listW - 20, 58, i === 0 ? c.soft : "transparent", i === 0 ? c.line : "transparent", 6)}${t(x + 22, y + 109 + i * 68, m, "mono")}${t(x + 22, y + 129 + i * 68, ["histogram · ms", "sum · tokens", "gauge · ratio", "histogram · ms", "gauge · items"][i], "label")}`).join("")}
    ${rect(midX, y, inspX - midX - 12, routeH - 112, c.bg, c.line, 8)}
    ${t(midX + 16, y + 28, "http.server.duration", "h")}${chip(midX + 198, y + 10, "histogram", "info", 84)}${chip(midX + 290, y + 10, "p95", "neutral", 54)}
    ${["Aggregation: p95", "Interval: 1m", "Group by: service"].map((v, i) => `${rect(midX + 16 + i * 150, y + 48, 138, 30, c.bg, c.line, 6)}${t(midX + 28 + i * 150, y + 68, v, "label")}`).join("")}
    ${rect(midX + 16, y + 96, inspX - midX - 44, 330, c.softer, c.line, 6)}
    ${[0, 1, 2, 3, 4].map((i) => line(midX + 42, y + 134 + i * 58, inspX - 42, y + 134 + i * 58, c.line2)).join("")}
    <path d="${path}" fill="none" stroke="${c.blue}" stroke-width="2.2"/>
    <path d="${path} L ${midX + 54 + (points.length - 1) * chartStep} ${y + 398} L ${midX + 54} ${y + 398} Z" fill="${c.blue}" opacity=".08"/>
    <circle cx="${midX + 54 + 18 * chartStep}" cy="${y + 342 - points[18]}" r="5" fill="${c.violet}"/>
    ${t(midX + 54 + 18 * chartStep + 12, y + 342 - points[18] - 8, "exemplar trc_92ad", "mono-muted")}
    ${t(midX + 16, y + 466, "Series", "h")}
    ${["checkout-api  p95 842ms  240 points", "agent-svc     p95 611ms  240 points", "payment-svc   p95 1.22s  240 points"].map((r, i) => `${line(midX + 16, y + 486 + i * 38, inspX - 28, y + 486 + i * 38, c.line2)}${t(midX + 28, y + 512 + i * 38, r, "mono-muted")}`).join("")}
    ${rect(inspX, y, inspW, routeH - 112, c.bg, c.line, 8)}
    ${t(inspX + 16, y + 28, "Metric inspector", "h")}
    ${["Descriptor", "Attributes", "Series", "Exemplars"].map((tab, i) => `${rect(inspX + 12 + i * 76, y + 44, 70, 28, i === 0 ? c.soft : "transparent", i === 0 ? c.line : "transparent", 5)}${t(inspX + 22 + i * 76, y + 63, tab, "label", `fill="${i === 0 ? c.fg : c.muted}"`)}`).join("")}
    ${["name  http.server.duration", "unit  ms", "kind  histogram", "temporality  delta", "monotonic  false", "first seen  2026-05-25 09:10"].map((r, i) => `${line(inspX + 16, y + 102 + i * 44, W - pad - 16, y + 102 + i * 44, c.line2)}${t(inspX + 24, y + 130 + i * 44, r, "mono")}`).join("")}
  `,
    ),
  );
};

const logs = () => {
  const x = routeX + pad;
  const y = routeY + 96;
  const inspX = W - 404;
  const rows = [
    [
      "12:04:18.890",
      "ERROR",
      "payment-svc",
      "trc_92ad / spn_41c",
      "provider declined capture request",
    ],
    [
      "12:04:18.711",
      "WARN",
      "tool-router",
      "trc_92ad / spn_22f",
      "web_search rate-limit retry attempt=2",
    ],
    [
      "12:04:18.532",
      "INFO",
      "llm-router",
      "trc_a18f / spn_09a",
      "openai.chat completion 832 tokens",
    ],
    ["12:04:18.421", "INFO", "checkout-api", "trc_92ad / root", "started checkout request"],
    ["12:04:17.920", "DEBUG", "storage-read", "-", "query metric descriptor cache hit"],
  ];
  return svg(
    "CloudGrid logs mockup",
    shell(
      "Logs",
      `
    ${routeHeader("Logs", "Search project logs and pivot to traces.", `${button(W - 212, routeY + 24, "Refresh", "secondary", 84)}${button(W - 116, routeY + 24, "More", "secondary", 72)}`)}
    ${filterBar(y, ["Search logs", "Service", "Severity", "Trace/span", "Time range"], ["severity=error", "trace=trc_92ad"])}
    ${rect(x, y + 92, inspX - x - 12, routeH - 204, c.bg, c.line, 8)}
    ${["Timestamp", "Severity", "Service", "Trace / Span", "Message"].map((h, i) => t(x + 18 + [0, 142, 238, 372, 560][i], y + 126, h, "label")).join("")}
    ${line(x, y + 142, inspX - 12, y + 142)}
    ${rows
      .map((r, i) => {
        const ry = y + 143 + i * 58;
        const tone = r[1] === "ERROR" ? "err" : r[1] === "WARN" ? "warn" : "neutral";
        return `${rect(x, ry, inspX - x - 12, 58, i === 0 ? c.softer : "transparent", "transparent", 0)}${line(x, ry + 58, inspX - 12, ry + 58, c.line2)}
        ${t(x + 18, ry + 35, r[0], "mono-muted")}${chip(x + 150, ry + 17, r[1], tone, 72)}${t(x + 248, ry + 35, r[2], "mono")}${t(x + 382, ry + 35, r[3], "mono-muted")}${t(x + 570, ry + 35, r[4], "body")}`;
      })
      .join("")}
    ${rect(inspX, y + 92, 388, routeH - 204, c.bg, c.line, 8)}
    ${t(inspX + 16, y + 122, "Selected log", "h")}${chip(inspX + 284, y + 103, "ERROR", "err", 74)}
    ${t(inspX + 16, y + 148, "payment-svc · 12:04:18.890", "mono-muted")}
    ${["Body", "Attributes", "Correlation"].map((tab, i) => `${rect(inspX + 12 + i * 96, y + 166, 90, 28, i === 0 ? c.soft : "transparent", i === 0 ? c.line : "transparent", 5)}${t(inspX + 24 + i * 96, y + 185, tab, "label", `fill="${i === 0 ? c.fg : c.muted}"`)}`).join("")}
    ${rect(inspX + 16, y + 214, 356, 126, c.softer, c.line, 6)}
    ${t(inspX + 30, y + 244, "provider declined capture request", "mono")}
    ${t(inspX + 30, y + 272, "code=card_declined retry=false", "mono-muted")}
    ${t(inspX + 16, y + 382, "Correlation", "h")}
    ${["traceId  trc_92ad6f", "spanId   spn_41c", "service  payment-svc"].map((r, i) => `${line(inspX + 16, y + 404 + i * 42, W - pad - 16, y + 404 + i * 42, c.line2)}${t(inspX + 24, y + 430 + i * 42, r, "mono")}`).join("")}
    ${button(inspX + 16, y + 558, "Open span", "primary", 100)}${button(inspX + 128, y + 558, "Copy trace ID", "secondary", 116)}
  `,
    ),
  );
};

const datasetOverview = () => {
  const x = routeX + pad;
  const y = routeY + 96;
  const rows = [
    ["support-intents", "classification", "v7", "1,240", "ready", "92%", "12m ago"],
    ["order-extraction", "json extraction", "v3", "824", "warning", "76%", "2h ago"],
    ["refund-policy", "rag answer", "v2", "386", "ready", "100%", "1d ago"],
    ["tool-routing", "agent action", "v5", "2,014", "ready", "88%", "3d ago"],
  ];
  return svg(
    "CloudGrid dataset overview mockup",
    shell(
      "Evaluations",
      `
    ${routeHeader("AI Eval", "Create datasets and run project-scoped evaluations.", `${button(W - 236, routeY + 24, "New dataset", "primary", 112)}${button(W - 112, routeY + 24, "Import", "secondary", 80)}`)}
    ${rect(x, y, routeW - pad * 2, 44, c.bg, c.line, 8)}
    ${rect(x + 8, y + 8, 112, 28, c.primary, c.primary, 6)}${t(x + 28, y + 27, "Datasets", "button", `fill="#fafafa"`)}
    ${rect(x + 128, y + 8, 126, 28, c.bg, c.line, 6)}${t(x + 148, y + 27, "Evaluations", "button", `fill="${c.fg}"`)}
    ${rect(x, y + 60, routeW - pad * 2, routeH - 172, c.bg, c.line, 8)}
    ${rect(x + 16, y + 76, 300, 30, c.bg, c.line, 6)}${t(x + 28, y + 96, "Search datasets", "label")}
    ${["Name", "Family", "Version", "Ready rows", "Health", "Split coverage", "Updated"].map((h, i) => t(x + 18 + [0, 220, 408, 506, 632, 744, 902][i], y + 136, h, "label")).join("")}
    ${line(x, y + 152, W - pad, y + 152)}
    ${rows
      .map((r, i) => {
        const ry = y + 153 + i * 68;
        return `${line(x, ry + 68, W - pad, ry + 68, c.line2)}${t(x + 18, ry + 38, r[0], "h")}${t(x + 238, ry + 38, r[1], "body")}${t(x + 426, ry + 38, r[2], "mono")}${t(x + 528, ry + 38, r[3], "mono")}${chip(x + 642, ry + 20, r[4], r[4] === "ready" ? "ok" : "warn", 82)}${t(x + 766, ry + 38, r[5], "mono-muted")}${t(x + 920, ry + 38, r[6], "muted")}${button(W - 132, ry + 18, "Open", "secondary", 72)}`;
      })
      .join("")}
  `,
    ),
  );
};

const datasetDetail = () => {
  const x = routeX + pad;
  const y = routeY + 24;
  return svg(
    "CloudGrid dataset detail mockup",
    shell(
      "Evaluations",
      `
    ${t(x, y + 12, "‹", "title")}${t(x + 28, y + 10, "AI Eval / Datasets / support-intents", "muted")}
    ${t(x, y + 48, "support-intents", "title")}${t(x, y + 70, "classification · v7 · 1,240 ready rows · validation split complete", "muted")}
    ${button(W - 360, y + 32, "Create evaluation", "primary", 144)}${button(W - 204, y + 32, "Dataset settings", "secondary", 142)}
    ${rect(x, y + 92, routeW - pad * 2, 92, c.bg, c.line, 8)}
    ${[
      "Ready rows|1,240",
      "Schema health|ready",
      "Train/val/test|70 / 20 / 10",
      "Last import|12m ago",
    ]
      .map((m, i) => {
        const [a, b] = m.split("|");
        return `${t(x + 24 + i * 280, y + 126, a, "label")}${t(x + 24 + i * 280, y + 154, b, "title")}`;
      })
      .join("")}
    ${rect(x, y + 200, routeW - pad * 2, routeH - 284, c.bg, c.line, 8)}
    ${t(x + 16, y + 230, "Rows", "h")}${button(W - 244, y + 214, "Add row", "primary", 82)}${button(W - 150, y + 214, "Import", "secondary", 78)}
    ${["Split", "Status", "Input preview", "Expected preview", "Reason", "Source", "Updated"].map((h, i) => t(x + 18 + [0, 100, 202, 430, 650, 842, 980][i], y + 282, h, "label")).join("")}
    ${line(x, y + 298, W - pad, y + 298)}
    ${[
      [
        "validation",
        "ready",
        "refund request after duplicate charge",
        "billing_refund",
        "explicit refund wording",
        "trace trc_92ad",
        "12m ago",
      ],
      [
        "train",
        "ready",
        "cancel subscription and ask for VAT",
        "cancellation",
        "mixed billing terms",
        "manual",
        "1h ago",
      ],
      [
        "test",
        "draft",
        "where is order ORD-10482",
        "order_status",
        "needs expected confirmation",
        "csv import",
        "2h ago",
      ],
      [
        "validation",
        "ready",
        "agent gave wrong shipping answer",
        "shipping_policy",
        "trace-derived failure",
        "trace trc_c443",
        "3h ago",
      ],
    ]
      .map((r, i) => {
        const ry = y + 299 + i * 66;
        return `${line(x, ry + 66, W - pad, ry + 66, c.line2)}${chip(x + 18, ry + 20, r[0], "neutral", 78)}${chip(x + 110, ry + 20, r[1], r[1] === "ready" ? "ok" : "warn", 70)}${t(x + 220, ry + 38, r[2], "body")}${t(x + 448, ry + 38, r[3], "mono")}${t(x + 668, ry + 38, r[4], "muted")}${t(x + 860, ry + 38, r[5], "mono-muted")}${t(x + 998, ry + 38, r[6], "muted")}`;
      })
      .join("")}
  `,
    ),
  );
};

const evaluationOverview = () => {
  const x = routeX + pad;
  const y = routeY + 96;
  return svg(
    "CloudGrid evaluations overview mockup",
    shell(
      "Evaluations",
      `
    ${routeHeader("AI Eval", "Manage evaluation definitions and run policies.", `${button(W - 244, routeY + 24, "New evaluation", "primary", 132)}${button(W - 104, routeY + 24, "Compare", "secondary", 88)}`)}
    ${rect(x, y, routeW - pad * 2, 44, c.bg, c.line, 8)}
    ${rect(x + 8, y + 8, 112, 28, c.bg, c.line, 6)}${t(x + 28, y + 27, "Datasets", "button", `fill="${c.fg}"`)}
    ${rect(x + 128, y + 8, 126, 28, c.primary, c.primary, 6)}${t(x + 148, y + 27, "Evaluations", "button", `fill="#fafafa"`)}
    ${rect(x, y + 60, routeW - pad * 2, routeH - 172, c.bg, c.line, 8)}
    ${["Name", "Dataset", "Split", "Target", "Last run", "Primary metric", "Updated"].map((h, i) => t(x + 18 + [0, 230, 430, 526, 704, 838, 1012][i], y + 110, h, "label")).join("")}
    ${line(x, y + 126, W - pad, y + 126)}
    ${[
      [
        "support-quality-validation",
        "support-intents",
        "validation",
        "agent-v4",
        "complete",
        "pass rate 91%",
        "12m ago",
      ],
      [
        "order-json-regression",
        "order-extraction",
        "test",
        "extractor-v2",
        "running",
        "exact match 82%",
        "now",
      ],
      [
        "refund-policy-grounding",
        "refund-policy",
        "validation",
        "rag-v3",
        "failed",
        "grounded 74%",
        "1h ago",
      ],
      [
        "tool-routing-smoke",
        "tool-routing",
        "test",
        "agent-v4",
        "queued",
        "action match 88%",
        "4h ago",
      ],
    ]
      .map((r, i) => {
        const ry = y + 127 + i * 70;
        const tone =
          r[4] === "complete"
            ? "ok"
            : r[4] === "running"
              ? "info"
              : r[4] === "failed"
                ? "err"
                : "neutral";
        return `${line(x, ry + 70, W - pad, ry + 70, c.line2)}${t(x + 18, ry + 40, r[0], "h")}${t(x + 248, ry + 40, r[1], "body")}${chip(x + 446, ry + 22, r[2], "neutral", 82)}${t(x + 544, ry + 40, r[3], "mono")}${chip(x + 720, ry + 22, r[4], tone, 86)}${t(x + 858, ry + 40, r[5], "mono-muted")}${t(x + 1030, ry + 40, r[6], "muted")}${button(W - 156, ry + 20, "Open", "secondary", 72)}`;
      })
      .join("")}
  `,
    ),
  );
};

const evaluationDetail = () => {
  const x = routeX + pad;
  const y = routeY + 24;
  const inspectorX = W - 404;
  return svg(
    "CloudGrid evaluation detail result mockup",
    shell(
      "Evaluations",
      `
    ${t(x, y + 12, "‹", "title")}${t(x + 28, y + 10, "AI Eval / Evaluations / support-quality-validation", "muted")}
    ${t(x, y + 48, "support-quality-validation", "title")}${t(x, y + 70, "dataset support-intents v7 · validation · target agent-v4", "muted")}
    ${button(W - 330, y + 32, "Run evaluation", "primary", 128)}${button(W - 190, y + 32, "Create comparison", "secondary", 154)}
    ${rect(x, y + 92, inspectorX - x - 12, 160, c.bg, c.line, 8)}
    ${["Status|complete", "Pass rate|91%", "Exact match|82%", "p95 latency|420 ms", "Regressions|3"]
      .map((m, i) => {
        const [a, b] = m.split("|");
        return `${t(x + 24 + i * 158, y + 126, a, "label")}${t(x + 24 + i * 158, y + 158, b, "title")}${i > 0 ? t(x + 24 + i * 158, y + 184, ["+9pp", "+14pp", "-18%", "-5"][i - 1], "mono", `fill="${i === 4 ? c.amber : c.green}"`) : ""}`;
      })
      .join("")}
    ${rect(x, y + 268, inspectorX - x - 12, routeH - 352, c.bg, c.line, 8)}
    ${t(x + 16, y + 298, "Item results", "h")}
    ${["Row", "Expected", "Actual", "Metric", "Trajectory summary", "Trace"].map((h, i) => t(x + 18 + [0, 104, 250, 390, 500, 822][i], y + 342, h, "label")).join("")}
    ${line(x, y + 358, inspectorX - 12, y + 358)}
    ${[
      ["cls-041", "billing_refund", "billing_refund", "pass", "matched refund intent", "trc_92ad"],
      ["ext-018", "ORD-10482", "ORD-10482", "pass", "extracted order fields", "trc_a18f"],
      [
        "cls-077",
        "cancellation",
        "billing_invoice",
        "fail",
        "VAT detail outweighed intent",
        "trc_c443",
      ],
      ["ext-022", "FR", "FR", "pass", "normalized country value", "trc_d091"],
    ]
      .map((r, i) => {
        const ry = y + 359 + i * 66;
        return `${line(x, ry + 66, inspectorX - 12, ry + 66, c.line2)}${t(x + 18, ry + 38, r[0], "mono")}${t(x + 122, ry + 38, r[1], "mono")}${t(x + 268, ry + 38, r[2], "mono")}${chip(x + 402, ry + 20, r[3], r[3] === "pass" ? "ok" : "err", 62)}${t(x + 518, ry + 38, r[4], "muted")}${t(x + 840, ry + 38, r[5], "mono", `fill="${c.blue}"`)}`;
      })
      .join("")}
    ${rect(inspectorX, y + 92, 388, routeH - 176, c.bg, c.line, 8)}
    ${t(inspectorX + 16, y + 122, "Evaluation result", "h")}${chip(inspectorX + 276, y + 103, "complete", "ok", 82)}
    ${t(inspectorX + 16, y + 154, "Metric breakdown", "h")}
    ${["exact_match  82%  +14pp", "pass_rate    91%  +9pp", "groundedness 88%  +6pp", "latency_p95  420ms -18%"].map((r, i) => `${line(inspectorX + 16, y + 174 + i * 44, W - pad - 16, y + 174 + i * 44, c.line2)}${t(inspectorX + 24, y + 202 + i * 44, r, "mono")}`).join("")}
    ${t(inspectorX + 16, y + 382, "Problems", "h")}
    ${rect(inspectorX + 16, y + 402, 356, 88, "#fffbeb", "#fde68a", 6)}${t(inspectorX + 30, y + 430, "3 validation rows regressed on billing terms.", "body", `fill="${c.amber}"`)}${t(inspectorX + 30, y + 456, "Open failed rows before promotion.", "muted")}
    ${t(inspectorX + 16, y + 538, "Actions", "h")}${button(inspectorX + 16, y + 560, "Start optimization", "primary", 146)}${button(inspectorX + 174, y + 560, "Open traces", "secondary", 112)}
  `,
    ),
  );
};

const files = [
  ["trace-overview.svg", traceOverview()],
  ["trace-detail.svg", traceDetail()],
  ["metrics.svg", metrics()],
  ["logs.svg", logs()],
  ["ai-eval-dataset-overview.svg", datasetOverview()],
  ["ai-eval-dataset-detail.svg", datasetDetail()],
  ["ai-eval-evaluations-overview.svg", evaluationOverview()],
  ["ai-eval-evaluation-detail-result.svg", evaluationDetail()],
];

mkdirSync(outDir, { recursive: true });
for (const [name, content] of files) {
  writeFileSync(join(outDir, name), content);
}

console.log(`Wrote ${files.length} mockups to ${outDir}`);
