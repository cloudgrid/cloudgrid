---
id: TEC-BE-023
title: Project membership and roles
layer: backend
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-15
provenance: user-directed
depends_on: [TEC-BE-009, TEC-BE-011]
---

# Project Membership And Roles

## Decision

CloudGrid supports real project-specific membership and roles. Company membership grants organization visibility; project membership grants project access. Company admins retain administrative access to all projects in the company.

## Roles

Project roles:

- `viewer`: read traces, logs, metrics, dashboards, alert history, and project settings metadata;
- `editor`: viewer permissions plus personal dashboards, annotations, and non-destructive project collaboration actions;
- `admin`: editor permissions plus project settings, ingest credentials, retention policies, alert rules, project members, and project dashboard management.

Company `admin` implies project `admin` for every project in that company. In local mode, the Personal user is project `admin` for all local projects and cannot be removed or demoted.

Public contracts must use `ProjectRole` enum symbols exactly as `viewer`, `editor`, and `admin` to match existing GraphQL enum casing conventions.

## Control-Plane Ownership

Control-plane owns `project_membership` records. The table is schemafull and project-scoped. It stores `projectId`, `userId`, `role`, `createdAt`, `createdByUserId`, `updatedAt`, and `updatedByUserId`.

`ProjectMember` returned by GraphQL and message contracts has `projectId`, `userId`, `email`, `displayName`, `role`, `effectiveRole`, `source`, `createdAt`, `createdByUserId`, `updatedAt`, and `updatedByUserId`.

`source` is one of:

- `direct`: stored `project_membership` row;
- `company_admin`: company admin fallback without a stored project membership row;
- `local_personal`: local-mode Personal admin fallback.

`effectiveRole` is the role enforced by authorization. For `company_admin` and `local_personal`, `effectiveRole` is always `admin`. For `direct`, `effectiveRole` equals `role`.

Project member mutations must enforce:

- only project `admin` or company `admin` may add, update, or remove project members;
- the final project admin cannot be removed or downgraded unless a company admin still exists and company-admin fallback is enabled for that project;
- removing a company member removes or disables that user's project memberships in the same company;
- project access checks never trust frontend-supplied project IDs alone.

`projectMembers(projectId)` returns all direct project members plus implied `company_admin` and `local_personal` entries. The result is sorted by `source` priority (`local_personal`, `company_admin`, `direct`), then by `displayName`, then by `email`, then by `userId`.

`updateProjectMember(projectId, userId, role)` is an upsert. It creates a direct membership when none exists and updates the direct role when it exists. It returns the resulting `ProjectMember` with `source: direct`.

`removeProjectMember(projectId, userId)` removes only direct project membership rows and returns `true` after the row is absent. Removing implied `company_admin` or `local_personal` entries must fail with `ERR-016`. Removing a non-existent direct membership returns `true`.

## Required Contracts Before Implementation

Implementation requires:

- GraphQL `ProjectMember`, `ProjectRole`, `projectMembers`, `updateProjectMember`, and `removeProjectMember` contracts;
- control-plane message bridge subjects for project-member list/update/remove;
- SurrealDB schema and indexes for `(projectId, userId)` and user lookup;
- project settings UX for members with clear role descriptions and local-mode restrictions.

## Tests

Required tests:

- company admin implied project admin;
- project viewer/editor/admin authorization boundaries;
- final project admin invariant;
- local Personal admin cannot be removed or demoted;
- selected-project read/write checks use project membership.
