---
id: NFR-005
title: Frontend accessibility
category: compliance
status: draft
provenance: inferred-draft
target: 0 critical axe accessibility violations on trace list, trace detail, and logs routes
measurement: Playwright axe check in CI for the three MVP routes
applies_to: [CAP-FE-*]
enforcement: warning
---

# Frontend Accessibility

The frontend must be keyboard usable and readable for operational workflows.

Trace investigation requirements:

- Span waterfall rows are reachable and selectable by keyboard.
- Selected span state is announced through accessible row state or equivalent labeling.
- Detail panel tabs expose accessible names and focus order.
- Stack trace frames remain readable at 320px width and do not rely on color alone.
- Timeline bars, severity markers, critical-path markers, and error markers have textual labels or tooltips available to keyboard and pointer users.
