const nav = [
  ["trace-overview", "Trace overview", "34"],
  ["trace-detail", "Trace detail", ""],
  ["logs", "Logs", "1.8k"],
  ["metrics", "Metrics", "214"],
  ["dashboards", "Dashboards", "8"],
  ["dataset-overview", "Datasets", "4"],
  ["dataset-detail", "Dataset detail", ""],
  ["evaluations", "Evaluations", "9"],
  ["evaluation-detail", "Evaluation result", ""],
];

const meta = {
  "trace-overview": ["Traces", "Search history, watch live traffic, and pivot into evidence.", "cloudgrid · /traces · live evidence"],
  "trace-detail": ["Trace detail", "Follow a request path, select a span, and inspect exact evidence.", "cloudgrid · /traces/trc_92ad6f"],
  logs: ["Logs", "Search project logs and pivot to trace or span context.", "cloudgrid · /logs · service:payment-svc"],
  metrics: ["Metrics", "Explore descriptors, query series, and open exemplar traces.", "cloudgrid · /metrics · http.server.duration"],
  dashboards: ["Dashboards", "Saved operational boards from typed telemetry widgets.", "cloudgrid · /dashboards · checkout overview"],
  "dataset-overview": ["Datasets", "Curate trace-backed examples for evaluation.", "cloudgrid · /ai-eval · datasets"],
  "dataset-detail": ["Dataset detail", "Maintain rows, health, splits, and evaluation readiness.", "cloudgrid · /ai-eval/datasets/support-intents"],
  evaluations: ["Evaluations", "Manage definitions, targets, run policy, and latest results.", "cloudgrid · /ai-eval · evaluations"],
  "evaluation-detail": ["Evaluation result", "Inspect run metrics, item results, trace evidence, and next actions.", "cloudgrid · /ai-eval · evaluation run"],
};

const actions = {
  "trace-overview": ["History", "Live"],
  "trace-detail": ["Waterfall", "Flow", "Add to dataset"],
  logs: ["Refresh", "More filters"],
  metrics: ["Refresh", "Save as dashboard"],
  dashboards: ["Add widget", "Edit layout"],
  "dataset-overview": ["New dataset", "Import"],
  "dataset-detail": ["Add row", "Import", "Create evaluation"],
  evaluations: ["New evaluation", "Create comparison"],
  "evaluation-detail": ["Run evaluation", "Start optimization"],
};

const $ = (selector) => document.querySelector(selector);
const screen = $("#screen");
const path = $("#chrome-path");
const title = $("#screen-title");
const subtitle = $("#screen-subtitle");
const actionTarget = $("#actions");
const navTarget = $("#nav-list");

function chip(text, tone = "") {
  return `<span class="chip ${tone}">${text}</span>`;
}

function panel(title, subtitle, body, extra = "") {
  return `<section class="panel ${extra}">
    <div class="panel-header">
      <div><div class="panel-title">${title}</div>${subtitle ? `<div class="panel-subtitle">${subtitle}</div>` : ""}</div>
    </div>
    ${body}
  </section>`;
}

function table(headers, rows, cls = "") {
  return `<table class="data-table ${cls}">
    <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>`;
}

function lineChart(color = "#5865f2", dashed = false) {
  return `<div class="line-chart">
    <svg viewBox="0 0 760 300" preserveAspectRatio="none" aria-hidden="true">
      <path d="M40 220 C110 160 140 210 190 150 S300 130 350 118 S470 206 530 160 S640 78 720 98" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" ${dashed ? 'stroke-dasharray="10 12"' : ""}/>
      <path d="M40 220 C110 160 140 210 190 150 S300 130 350 118 S470 206 530 160 S640 78 720 98 L720 280 L40 280 Z" fill="${color}" opacity=".1"/>
      <circle cx="548" cy="146" r="10" fill="#8b5cf6"/>
      <circle cx="548" cy="146" r="22" fill="#8b5cf6" opacity=".16"/>
    </svg>
  </div>`;
}

function traceOverview() {
  const rows = [
    [service("checkout-api", "#5865f2"), "POST /checkout", mono("trc_92ad6f"), "842 ms" + bar(92, "var(--red)"), chip("error", "err"), "31", "3"],
    [service("agent-svc", "#8b5cf6"), "agent.run", mono("trc_a18fc2"), "611 ms" + bar(64), chip("ok", "ok"), "18", "0"],
    [service("payments", "#f59e0b"), "POST /capture", mono("trc_c44391"), "1.22 s" + bar(100, "var(--red)"), chip("error", "err"), "24", "2"],
    [service("frontend", "#10b981"), "GET /cart", mono("trc_d091be"), "122 ms" + bar(24), chip("ok", "ok"), "9", "0"],
    [service("llm-router", "#38bdf8"), "llm.chat", mono("trc_b82190"), "2.80 s" + bar(78, "var(--amber)"), chip("warn", "warn"), "15", "1"],
  ];
  return `<div class="grid trace-grid">
    <section class="panel wide filter-strip">
      ${["Last 30 minutes", "Service", "Status", "Duration", "Search"].map((v) => `<div class="control">${v}</div>`).join("")}
      ${chip("service=checkout-api")} ${chip("status=error", "err")}
    </section>
    ${facets()}
    ${panel("Trace stream", "backend-driven Query.traces", table(["Service", "Operation", "Trace ID", "Duration", "Status", "Spans", "Errors"], rows))}
    ${panel("Investigation queue", "selected evidence", `<div class="inspector-body">
      <div class="kv"><span>selected</span><strong>trc_92ad6f</strong></div>
      <div class="kv"><span>root</span><strong>POST /checkout</strong></div>
      <div class="kv"><span>slowest span</span><strong>payment.capture</strong></div>
      <div class="kv"><span>next action</span><strong>Open trace detail</strong></div>
      <div class="notice">3 error spans and 8 correlated logs are available for this trace.</div>
    </div>`)}
  </div>`;
}

function facets() {
  const groups = [
    ["Services", [["checkout-api", 64], ["agent-svc", 46], ["payments", 28]]],
    ["Operations", [["POST /checkout", 41], ["agent.run", 31], ["llm.chat", 18]]],
    ["Attribute keys", [["gen_ai.operation", 22], ["http.route", 18], ["cloud.region", 11]]],
  ];
  return panel("Facets", "server suggestions", `<div class="facet-body">${groups
    .map(
      ([name, values]) => `<div class="facet-group"><div class="tiny-label">${name}</div>${values
        .map(([value, count], i) => `<div class="facet-row ${i === 0 ? "selected" : ""}"><span>${value}</span><span>${count}</span></div>`)
        .join("")}</div>`,
    )
    .join("")}</div>`);
}

function traceDetail() {
  const spans = [
    ["checkout-api", "POST /checkout", 1, 88, "#f05267", "818 ms"],
    ["auth-svc", "auth.verify", 6, 16, "#10b981", "92 ms"],
    ["cart-svc", "cart.lookup", 20, 22, "#5865f2", "150 ms"],
    ["payment-svc", "payment.capture", 49, 34, "#f05267", "382 ms"],
    ["llm-router", "fraud.assess", 58, 28, "#8b5cf6", "230 ms"],
    ["storage-read", "query customer risk", 76, 15, "#38bdf8", "94 ms"],
  ];
  const timeline = `<div class="timeline"><div></div><div class="ticks"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
    ${spans
      .map(
        ([svc, name, left, width, color, dur]) => `<div class="span-row">
          <div class="span-label">${svc}<br><span class="mono muted">${name}</span></div>
          <div class="span-track"><div class="span-bar" style="--bar:${color};left:${left}%;width:${width}%"><strong>${dur}</strong></div></div>
        </div>`,
      )
      .join("")}</div>`;
  return `<div class="grid detail-grid">
    ${panel("Trace waterfall", "trc_92ad6f · POST /checkout", timeline)}
    ${panel("Span inspector", "payment.capture · client · 382 ms", `<div class="toolbar-tabs"><span class="tab active">Attributes</span><span class="tab">Events</span><span class="tab">Exceptions</span><span class="tab">Links</span></div><div class="inspector-body">
      ${["http.method|POST", "payment.provider|stripe", "error.type|ProviderDeclined", "cloud.region|eu-central-1", "span.kind|client"].map((v) => {
        const [k, val] = v.split("|");
        return `<div class="kv"><span>${k}</span><strong>${val}</strong></div>`;
      }).join("")}
    </div>`)}
    ${panel("Correlated logs", "selected span / whole trace", table(["Time", "Severity", "Message"], [
      [mono("12:04:18.890"), chip("ERROR", "err"), "payment.capture declined by provider"],
      [mono("12:04:18.912"), chip("WARN", "warn"), "fraud.assess high risk score"],
      [mono("12:04:19.018"), chip("INFO", "info"), "checkout completed status=partial"],
    ]), "wide")}
  </div>`;
}

function logs() {
  return `<div class="grid logs-grid">
    <section class="panel wide filter-strip">${["free text", "service", "severity", "trace/span", "time"].map((v) => `<div class="control">${v}</div>`).join("")}${chip("trace=trc_92ad")} ${chip("severity=error", "err")}</section>
    ${panel("Log search", "virtualized rows", table(["Time", "Sev", "Service", "Trace / Span", "Message"], [
      [mono("12:04:18.890"), chip("ERROR", "err"), mono("payment-svc"), mono("trc_92ad / spn_41c"), "provider declined capture request"],
      [mono("12:04:18.711"), chip("WARN", "warn"), mono("tool-router"), mono("trc_92ad / spn_22f"), "web_search rate-limit retry attempt=2"],
      [mono("12:04:18.532"), chip("INFO", "info"), mono("llm-router"), mono("trc_a18f / spn_09a"), "openai.chat completion · 832 tokens"],
      [mono("12:04:18.421"), chip("INFO", "info"), mono("checkout-api"), mono("trc_92ad / root"), "started checkout request"],
    ]))}
    ${panel("Log inspector", "body · attributes · correlation", `<div class="inspector-body">
      <div class="notice">provider declined capture request<br><span class="mono">code=card_declined retry=false</span></div>
      <div class="kv"><span>traceId</span><strong>trc_92ad6f</strong></div>
      <div class="kv"><span>spanId</span><strong>spn_41c</strong></div>
      <div class="kv"><span>action</span><strong>Open span</strong></div>
    </div>`)}
  </div>`;
}

function metrics() {
  const metricRows = [["http.server.duration", "histogram · ms"], ["gen_ai.token.count", "sum · tokens"], ["process.cpu.usage", "gauge · ratio"], ["db.client.duration", "histogram · ms"], ["queue.depth", "gauge · items"]];
  return `<div class="grid metrics-grid">
    ${panel("Metric catalog", "Query.metricNames", `<div class="compact-list">${metricRows.map(([a, b], i) => `<div class="list-row ${i === 0 ? "selected" : ""}"><div><strong>${a}</strong><br><span class="muted">${b}</span></div></div>`).join("")}</div>`)}
    ${panel("http.server.duration", "p95 · 1m · group by service", `${lineChart()}${table(["Series", "Latest", "Points"], [[mono("checkout-api"), "842 ms", "240"], [mono("agent-svc"), "611 ms", "240"], [mono("payment-svc"), "1.22 s", "240"]])}`)}
    ${panel("Descriptor", "attributes · exemplars", `<div class="toolbar-tabs"><span class="tab active">Descriptor</span><span class="tab">Attributes</span><span class="tab">Exemplars</span></div><div class="inspector-body">
      ${["kind|histogram", "unit|ms", "temporality|delta", "monotonic|false", "first seen|2026-05-25"].map((v) => {
        const [k, val] = v.split("|");
        return `<div class="kv"><span>${k}</span><strong>${val}</strong></div>`;
      }).join("")}
    </div>`)}
  </div>`;
}

function dashboards() {
  return `<div class="grid dashboard-grid">
    ${panel("Request latency · p95", "metric · time-series · last 30m", lineChart(), "span-2")}
    ${panel("Spans / sec", "live · subscription", `<div class="dashboard-card"><div class="hero-number">1,284</div><div class="muted">+12% vs prior 5m window</div><div class="bars">${[28,35,25,42,31,50,39,47,34,54,43,58,48].map((h) => `<span style="height:${h}%"></span>`).join("")}</div></div>`)}
    ${panel("Logs by severity", "last 1h", `<div style="padding-top:18px">${severity("ERROR", 18, 8, "var(--red)")}${severity("WARN", 142, 24, "var(--amber)")}${severity("INFO", "12,894", 96, "var(--blue)")}${severity("DEBUG", "4,322", 38, "#94a3b8")}</div>`)}
  </div>`;
}

function datasetOverview() {
  return `<div class="grid dataset-grid">
    <section class="panel wide"><div class="toolbar-tabs"><span class="tab active">Datasets</span><span class="tab">Evaluations</span></div><div class="metric-card-row">
      ${metricCard("Ready rows", "4,464", "+312")}
      ${metricCard("Schema warnings", "2", "-4")}
      ${metricCard("Trace-derived", "38%", "+8pp")}
      ${metricCard("Validation cover", "91%", "+3pp")}
      ${metricCard("Latest import", "12m", "fresh")}
    </div></section>
    ${panel("Datasets", "project-scoped examples", table(["Name", "Family", "Version", "Ready rows", "Health", "Updated"], [
      ["support-intents", "classification", mono("v7"), "1,240", chip("ready", "ok"), "12m ago"],
      ["order-extraction", "json extraction", mono("v3"), "824", chip("warning", "warn"), "2h ago"],
      ["refund-policy", "rag answer", mono("v2"), "386", chip("ready", "ok"), "1d ago"],
      ["tool-routing", "agent action", mono("v5"), "2,014", chip("ready", "ok"), "3d ago"],
    ]))}
    ${panel("Readiness", "next useful action", `<div class="inspector-body"><div class="kv"><span>selected</span><strong>support-intents</strong></div><div class="kv"><span>split coverage</span><strong>70 / 20 / 10</strong></div><div class="kv"><span>schema</span><strong>text → label</strong></div><div class="notice">Eligible for a validation evaluation against agent-v4.</div></div>`)}
  </div>`;
}

function datasetDetail() {
  return `<div class="grid dataset-grid">
    <section class="panel wide"><div class="metric-card-row">${metricCard("Ready rows", "1,240", "+64")}${metricCard("Schema health", "ready", "ok")}${metricCard("Train/val/test", "70/20/10", "balanced")}${metricCard("Trace-derived", "421", "+18")}${metricCard("Last import", "12m", "fresh")}</div></section>
    ${panel("Rows", "cursor-paginated storage-read data", table(["Split", "Status", "Input preview", "Expected", "Reason", "Source"], [
      [chip("validation"), chip("ready", "ok"), "refund request after duplicate charge", mono("billing_refund"), "explicit refund wording", mono("trace trc_92ad")],
      [chip("train"), chip("ready", "ok"), "cancel subscription and ask for VAT", mono("cancellation"), "mixed billing terms", "manual"],
      [chip("test"), chip("draft", "warn"), "where is order ORD-10482", mono("order_status"), "needs expected confirmation", "csv import"],
      [chip("validation"), chip("ready", "ok"), "agent gave wrong shipping answer", mono("shipping_policy"), "trace-derived failure", mono("trace trc_c443")],
    ]))}
    ${panel("Dataset settings", "full replacement guarded by version", `<div class="inspector-body"><div class="kv"><span>input</span><strong>text</strong></div><div class="kv"><span>expected</span><strong>label enum</strong></div><div class="kv"><span>default split</span><strong>validation</strong></div><div class="kv"><span>retention</span><strong>project default</strong></div><div class="notice">Use raw JSON only when the dataset schema requires JSON values.</div></div>`)}
  </div>`;
}

function evaluations() {
  return `<div class="grid eval-grid">
    <section class="panel wide"><div class="toolbar-tabs"><span class="tab">Datasets</span><span class="tab active">Evaluations</span></div><div class="metric-card-row">${metricCard("Definitions", "9", "+1")}${metricCard("Running", "1", "now")}${metricCard("Last pass rate", "91%", "+9pp")}${metricCard("Regressions", "3", "-5")}${metricCard("Comparisons", "4", "+2")}</div></section>
    ${panel("Evaluation definitions", "dataset · target · latest run", table(["Name", "Dataset", "Split", "Target", "Last run", "Primary metric"], [
      ["support-quality-validation", "support-intents", chip("validation"), mono("agent-v4"), chip("complete", "ok"), "pass rate 91%"],
      ["order-json-regression", "order-extraction", chip("test"), mono("extractor-v2"), chip("running", "info"), "exact match 82%"],
      ["refund-policy-grounding", "refund-policy", chip("validation"), mono("rag-v3"), chip("failed", "err"), "grounded 74%"],
      ["tool-routing-smoke", "tool-routing", chip("test"), mono("agent-v4"), chip("queued"), "action match 88%"],
    ]))}
    ${panel("Run policy", "project AI provider resolution", `<div class="inspector-body"><div class="kv"><span>target</span><strong>agent-v4</strong></div><div class="kv"><span>model alias</span><strong>judge-fast</strong></div><div class="kv"><span>retention</span><strong>30 days</strong></div><div class="notice">Run controls are visible only for valid lifecycle states.</div></div>`)}
  </div>`;
}

function evaluationDetail() {
  return `<div class="grid eval-grid">
    <section class="panel wide"><div class="panel-header"><div><div class="panel-title">support-quality-validation</div><div class="panel-subtitle">dataset support-intents-v7 · validation · target agent-v4 · rows 124</div></div>${chip("complete", "ok")}</div><div class="metric-card-row">${metricCard("Exact match", "82%", "+14pp")}${metricCard("Pass rate", "91%", "+9pp")}${metricCard("p95 latency", "420 ms", "-18%")}${metricCard("Regressions", "3", "-5")}${metricCard("Improvements", "28", "+11")}</div></section>
    ${panel("Item results", "trace-backed evidence", table(["Row", "Input", "Expected", "Actual", "Metric", "Trace"], [
      [mono("cls-041"), "refund request", mono("billing_refund"), mono("billing_refund"), chip("pass", "ok"), mono("trc_92ad")],
      [mono("ext-018"), "order email", mono("ORD-10482"), mono("ORD-10482"), chip("pass", "ok"), mono("trc_a18f")],
      [mono("cls-077"), "cancel + VAT", mono("cancellation"), mono("billing_invoice"), chip("fail", "err"), mono("trc_c443")],
      [mono("ext-022"), "chat order", mono("FR"), mono("FR"), chip("pass", "ok"), mono("trc_d091")],
    ]))}
    ${panel("Result inspector", "metric deltas · problems · actions", `<div class="inspector-body">${["exact_match|82% +14pp", "pass_rate|91% +9pp", "groundedness|88% +6pp", "latency_p95|420ms -18%"].map((v) => { const [k, val] = v.split("|"); return `<div class="kv"><span>${k}</span><strong>${val}</strong></div>`; }).join("")}<div class="notice">3 validation rows regressed on billing terms. Open failed rows before promotion.</div></div>`)}
  </div>`;
}

function service(name, color) {
  return `<span class="service-cell"><span class="service-dot" style="background:${color}"></span>${name}</span>`;
}

function mono(value) {
  return `<span class="mono">${value}</span>`;
}

function bar(width, color = "var(--blue)") {
  return `<div class="duration-bar"><span style="width:${width}%;background:${color}"></span></div>`;
}

function metricCard(label, value, delta) {
  return `<div class="metric-card"><label>${label}</label><strong>${value}</strong><small>${delta}</small></div>`;
}

function severity(label, value, width, color) {
  return `<div class="severity-row"><span class="mono muted">${label}</span><div class="meter" style="--meter:${color}"><span style="width:${width}%"></span></div><span class="mono muted">${value}</span></div>`;
}

const renderers = {
  "trace-overview": traceOverview,
  "trace-detail": traceDetail,
  logs,
  metrics,
  dashboards,
  "dataset-overview": datasetOverview,
  "dataset-detail": datasetDetail,
  evaluations,
  "evaluation-detail": evaluationDetail,
};

function renderNav(active) {
  navTarget.innerHTML = nav
    .map(([id, label, count]) => `<button class="nav-item ${id === active ? "active" : ""}" data-screen="${id}"><span>${label}</span><span class="count">${count}</span></button>`)
    .join("");
  navTarget.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      location.hash = button.dataset.screen;
    });
  });
}

function render() {
  const active = location.hash.replace("#", "") || "trace-overview";
  const renderer = renderers[active] ?? traceOverview;
  const [heading, sub, chrome] = meta[active] ?? meta["trace-overview"];
  title.textContent = heading;
  subtitle.textContent = sub;
  path.textContent = chrome;
  actionTarget.innerHTML = (actions[active] ?? []).map((label, i) => `<button class="button ${i === 0 ? "primary" : ""}">${label}</button>`).join("");
  renderNav(active);
  screen.innerHTML = renderer();
}

window.addEventListener("hashchange", render);
render();
