---
id: TEC-BE-025
title: Organization invitations and SSO membership lifecycle
layer: backend
status: draft
owner: unknown@example.com
updated: 2026-05-16
provenance: user-directed
---

# Organization Invitations And SSO Membership Lifecycle

CloudGrid deployed mode is invite-only after the first company admin has been
bootstrapped. Users may authenticate with a configured SSO provider, but SSO
authentication alone does not grant company or project access.

## Scope

This spec covers company-level invitations for `CLOUDGRID_AUTH_MODE=sso`.
Local mode does not expose company invitations because the visible company is
the local-only `Personal` company.

Project-specific access is still governed by
[Project membership and roles](./project-membership.md). A company invitation
may carry pending project grants only as defined by
[Invitation email delivery and project onboarding](./invitation-email-delivery.md).
Those grants create direct project membership rows only after the invited person
signs in with a matching verified SSO email.

## Entity

Control-plane owns `organization_invitation` records.

Fields:

- `id`: stable invitation ID.
- `organizationId`: target company.
- `email`: normalized invite email. Normalization trims whitespace and lowercases
  the full address.
- `role`: fixed `user` for v1.
- `status`: one of `pending`, `accepted`, `revoked`, or `expired`.
- `invitedByUserId`: company admin who created the invitation.
- `acceptedByUserId`: set when the invite is accepted.
- `createdAt`, `updatedAt`.
- `acceptedAt`, `revokedAt`, `expiresAt`.
- `deliveryStatus`, `lastDeliveryAttemptAt`, `lastDeliveryErrorCode`, and
  `lastEmailDeliveryId` as defined by the invitation email delivery spec.
- `projectGrants`: pending, applied, revoked, or failed project grants attached
  by project invitation flows.

Uniqueness:

- At most one `pending` invitation may exist for an
  `(organizationId, email)` pair.
- A new invitation may be created after the prior invitation is `accepted`,
  `revoked`, or `expired`.

Retention:

- Accepted, revoked, and expired invitations remain queryable by admins for
  audit. They are low-volume control-plane records, not telemetry records.
- Future retention policy may prune old terminal invitations only after an audit
  retention spec defines the window.

## Invitation Rules

Only company `admin` users may create or revoke organization invitations.

Creating an invitation:

- requires `organizationId` and `email`;
- validates email syntax using the same shared email validator as frontend form
  validation;
- normalizes the email before uniqueness checks;
- always creates a `user` invitation;
- must fail with `ERR-001` when the email is invalid;
- must fail with `ERR-016` when the caller is not a company admin;
- must fail with `ERR-001` when a pending invite already exists for the same
  organization and normalized email;
- must fail with `ERR-001` when the email already belongs to an active member of
  the same organization;
- returns the created `OrganizationInvitation`.

Revoking an invitation:

- requires invitation ID;
- requires company `admin` on the invitation's organization;
- changes only `pending` invitations to `revoked`;
- is idempotent for already `revoked` invitations;
- returns the updated invitation;
- must fail with `ERR-016` for accepted invitations because accepted membership
  must be removed through `removeOrganizationMember`.

There is no admin-selected company invite role in v1. Organization invitations
always create company role `user`. Admin promotion is available only after the
invited person signs in and becomes an active organization member.

When an invitation includes project grants, grant role validation follows
[Project membership and roles](./project-membership.md). Project grants do not
grant any access while the invitation is pending.

## SSO Acceptance

During SSO callback, the BFF validates the provider identity as defined in
[Authentication and authorization model](./authentication-authorization.md).
The BFF forwards `principalId`, `principalDisplayName`, `principalEmail`, and
an `emailVerified` equivalent when the provider exposes it.

Control-plane `GetViewer` bootstrap behavior in deployed SSO mode:

1. Ensure the `user` record exists or update its display name and email from the
   normalized provider profile.
2. Ensure the configured deployment organization exists.
3. If the organization has no memberships and no accepted invitations, create
   the first signed-in user as company `admin`.
4. If the user already has a membership, return it.
5. If the user has no membership, find a non-expired `pending` invitation for
   the configured organization whose normalized email equals the normalized
   verified provider email.
6. If a matching invitation exists, create a company membership with role
   `user`, mark the invitation `accepted`, set `acceptedByUserId` and
   `acceptedAt`, apply pending project grants in the same organization, and
   return the viewer with company/project access.
7. If no matching invitation exists, return a viewer with no organizations.

An invitation must not be accepted when the provider email is missing or
unverified. Providers that cannot assert verified email must not be enabled for
invite acceptance until the auth spec defines a provider-specific verification
rule.

Invitation acceptance is idempotent. If a callback is retried after membership
creation but before the response reaches the browser, subsequent viewer loads
return the existing membership and must not create duplicate memberships or
reactivate a terminal invitation.

## Member Listing

Company member management surfaces need both active members and invitations.

- `Organization.members` remains out of the organization summary object to keep
  viewer payloads small.
- `Query.organizationMembers(organizationId)` returns active members.
- `Query.organizationInvitations(organizationId)` returns invitations visible to
  company admins.
- Non-admin users must not receive invitation records.

`OrganizationMember` represents active members only. Pending invitations are
not members and cannot be promoted, demoted, selected for project membership, or
used for telemetry access.

Project-member management surfaces may show pending project invitations
separately from active `ProjectMember` rows. Pending project grants must not be
reported as active project members.

## Email Delivery

Invitation email delivery is required for deployed onboarding unless explicitly
disabled for private operator testing. Delivery behavior, SMTP configuration,
outbox retry, resend, project invite email content, and delivery status fields
are defined in
[Invitation email delivery and project onboarding](./invitation-email-delivery.md).

## SSO Deprovisioning

Automatically removing CloudGrid access when a user is removed from the SSO
provider makes sense for enterprise deployments, but it must be driven by an
explicit trusted directory sync signal, not by normal login failure.

CloudGrid supports this lifecycle policy shape:

- `manual`: default. Admins remove members in CloudGrid. Provider login failure
  does not mutate CloudGrid memberships.
- `sso_sync`: future provider-directory sync mode. A trusted SCIM or provider
  admin API integration may mark users as deprovisioned and remove their
  memberships.

The `sso_sync` mode is not enabled until separate provider sync contracts exist.
Those contracts must define provider identity matching, sync cursors, retries,
audit records, final-admin protection, pending-invite cleanup, and test fixtures.

When implemented, provider-driven deprovisioning must:

- never remove or downgrade the final company admin; it must fail closed and
  surface an admin action item instead;
- remove the user's project memberships in the same organization using the same
  cleanup semantics as `removeOrganizationMember`;
- revoke pending invitations for the deprovisioned verified email in that
  organization;
- not delete the `user` record, because historical audit fields reference user
  IDs;
- emit audit metadata containing the provider, external subject, sync run ID,
  affected organization, and affected user without logging provider tokens.

## Tests

Required default tests:

- company admin can create a pending email invitation;
- non-admin cannot create or revoke invitations;
- duplicate pending invitation for the same normalized email fails;
- invitation for an existing active member fails;
- invited SSO user with verified matching email becomes a `user`;
- invited SSO user with pending project grants receives those project
  memberships after acceptance;
- invited SSO user is not made `admin`;
- SSO user without a matching invitation gets no organization membership;
- unverified or missing provider email does not accept an invitation;
- revoked and expired invitations cannot be accepted;
- accepted invitations cannot be revoked and membership removal uses
  `removeOrganizationMember`;
- final-admin protection still holds for member removal, demotion, and future
  `sso_sync` deprovisioning.
