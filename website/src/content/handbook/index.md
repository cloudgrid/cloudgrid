---
title: Handbook
description: The practical, opinionated guide to running CloudGrid and extending it.
sidebar: Overview
order: 0
accent: brand
eyebrow: Handbook
updated: 2026-05-17
---

The CloudGrid Handbook is a hand-authored, opinionated companion to the
product. Read it top-to-bottom, or jump straight to the section you need.

## What you'll find here

- **Getting started** — run CloudGrid locally and send your first OTLP trace.
- **Architecture** — services, the message bridge, and what crosses what.
- **Deployment** — local mode, deployed mode, Kubernetes, scaling guidance.
- **Configuration** — env vars, deployment modes, auth modes, SSO providers.
- **Adapters** — author your own storage, bridge, auth, or harness adapter.

## How the docs are organized

The handbook is a tree of markdown files inside `src/content/handbook/`.
Folders become URL nesting — a file at `architecture/services.md` is served
at `/handbook/architecture/services`. The sidebar to your left is built
automatically; the right-hand outline tracks the page you're reading.
