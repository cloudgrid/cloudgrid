---
id: TEC-BE-027
title: Invitation email delivery and project onboarding
layer: backend
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-18
provenance: user-directed
depends_on: [TEC-BE-009, TEC-BE-011, TEC-BE-023, TEC-BE-025]
---

# Invitation Email Delivery And Project Onboarding

## Decision

CloudGrid deployed mode must support email-backed invitations because
invitations are the product path for onboarding another person into a company
and, when initiated from a project, into a specific project.

The first delivery adapter is SMTP. Email delivery is low-volume control-plane
work, not telemetry work. Control-plane owns invitation records, project grants,
the email outbox, retry state, and provider delivery status. The BFF owns only
public GraphQL validation, session/auth context, and message bridge mapping.

## Scope

In scope:

- company invitation email delivery for `CLOUDGRID_AUTH_MODE=sso`;
- project invite flow that invites an email address to one project role;
- SMTP provider configuration;
- durable email outbox and retry behavior;
- admin-visible delivery status and resend;
- local/dev disabled delivery mode with explicit manual-delivery status;
- safe email content, redaction, and tests.

Out of scope:

- password login;
- magic-link authentication;
- invitation bearer tokens;
- email address verification by CloudGrid itself;
- marketing emails;
- alert notification email;
- billing or organization lifecycle emails;
- SCIM/provider-directory sync emails;
- user-controlled templates or arbitrary HTML.

## Product Workflows

### Company Invitation

A company admin invites a person by email from organization member management.
The invite creates or reuses one pending `organization_invitation` for the
configured organization and normalized email. The invitation creates company
role `user` only after the recipient signs in with a matching verified SSO
email.

### Project Invitation

A project admin or company admin invites a person by email from a project's
member settings page. If the email belongs to an active company member,
control-plane creates or updates the direct `project_membership` immediately
and may enqueue a project-access notification email. If the email does not
belong to an active company member, control-plane creates or reuses a pending
organization invitation and attaches a pending project grant.

When the invited person later signs in with a matching verified SSO email,
control-plane accepts the company invitation as role `user` and creates the
pending project membership grants in the same organization.

Project grants never grant access before SSO acceptance.

## Entity Extensions

`organization_invitation` adds:

- `deliveryStatus`: one of `not_configured`, `pending`, `sent`,
  `failed_retryable`, `failed_terminal`, or `suppressed`.
- `lastDeliveryAttemptAt`: nullable timestamp.
- `lastDeliveryErrorCode`: nullable canonical error code. Provider messages are
  not stored in this public field.
- `lastEmailDeliveryId`: nullable ID of the latest email outbox record.
- `projectGrants`: list of pending grants. Each grant has `projectId`, `role`,
  `createdAt`, `createdByUserId`, `appliedAt`, and `status`.

`projectGrant.status` is one of:

- `pending`: grant will be applied when the invitation is accepted.
- `applied`: membership was created or updated after acceptance.
- `revoked`: grant was removed before acceptance.
- `failed`: grant could not be applied because the project no longer exists, is
  disabled, or the grant would violate role rules.

Control-plane owns a new `email_delivery` outbox table:

- `id`: stable delivery ID.
- `kind`: `organization_invitation` or `project_access`.
- `organizationId`.
- `projectId`: nullable.
- `invitationId`: nullable for active-member project-access notifications.
- `recipientEmail`: normalized email.
- `recipientUserId`: nullable.
- `template`: `organization_invitation_v1` or `project_access_v1`.
- `status`: `pending`, `sending`, `sent`, `failed_retryable`,
  `failed_terminal`, or `suppressed`.
- `attemptCount`.
- `nextAttemptAt`.
- `lastAttemptAt`.
- `lastErrorCode`: nullable canonical error code.
- `createdAt`, `updatedAt`.
- `sentAt`.

The outbox stores rendered subject and body only when needed for retry. Rendered
content must not include secrets, provider tokens, session cookies, or SurrealDB
credentials.

## Runtime Configuration

Invitation email configuration belongs to control-plane because control-plane
owns invitations and the outbox.

Variables:

- `CLOUDGRID_PUBLIC_URL`: external browser base URL, required in deployed mode
  when invitation email delivery is enabled.
- `CLOUDGRID_INVITATION_EMAIL_MODE`: `disabled` or `smtp`. Default `disabled`
  in local mode and `smtp` in deployed SSO mode.
- `CLOUDGRID_INVITATION_EMAIL_REQUIRE_DELIVERY`: boolean. Default `false` in
  local mode and `true` in deployed SSO mode. When true, create/resend
  mutations must fail if an email delivery cannot be enqueued.
- `CLOUDGRID_INVITATION_EMAIL_FROM`: required when mode is `smtp`.
- `CLOUDGRID_INVITATION_EMAIL_REPLY_TO`: optional reply-to address.
- `CLOUDGRID_INVITATION_EMAIL_SMTP_HOST`: required when mode is `smtp`.
- `CLOUDGRID_INVITATION_EMAIL_SMTP_PORT`: required when mode is `smtp`.
- `CLOUDGRID_INVITATION_EMAIL_SMTP_USERNAME`: optional unless the SMTP server
  requires auth.
- `CLOUDGRID_INVITATION_EMAIL_SMTP_PASSWORD`: optional unless the SMTP server
  requires auth.
- `CLOUDGRID_INVITATION_EMAIL_SMTP_TLS`: `starttls`, `tls`, or `none`; default
  `starttls` in deployed mode.
- `CLOUDGRID_INVITATION_EMAIL_SMTP_TIMEOUT_MS`: default `10000`, valid
  `1000..60000`.
- `CLOUDGRID_INVITATION_EMAIL_MAX_ATTEMPTS`: default `5`, valid `1..20`.
- `CLOUDGRID_INVITATION_EMAIL_RETRY_BASE_SECONDS`: default `60`, valid
  `5..3600`.

Validation failures block control-plane startup with `ERR-009`.

`disabled` mode in deployed SSO is allowed only when
`CLOUDGRID_INVITATION_EMAIL_REQUIRE_DELIVERY=false`. In that mode, invite
mutations create pending invitations with `deliveryStatus=suppressed`, and the
admin UI must show that the operator must notify the recipient out of band.

## Delivery Semantics

Invitation creation and project invite creation must persist invitation state
and outbox state in one control-plane transaction. If delivery is required and
the outbox row cannot be created, the mutation fails and no invitation or
project grant is created.

SMTP delivery is asynchronous:

1. Control-plane creates the invitation and `email_delivery` outbox row.
2. A control-plane worker claims due `pending` rows.
3. The SMTP adapter sends the email with a bounded timeout.
4. Control-plane updates delivery status.
5. Failed retryable attempts are retried with exponential backoff.
6. Exhausted attempts become `failed_terminal`.

Successful mutation completion means the invitation and email job were durably
recorded. It does not guarantee that the recipient's mailbox accepted or read
the message.

## Email Content

The invite email must include:

- CloudGrid product name;
- company name or ID;
- inviting user's display name or email when available;
- project name and role when the invitation includes project grants;
- the configured `CLOUDGRID_PUBLIC_URL` login URL;
- a short explanation that access is granted after signing in with the invited
  verified email address.

The email must not include:

- bearer tokens;
- session cookies;
- provider access tokens or ID tokens;
- SMTP credentials;
- SurrealDB credentials;
- raw provider errors;
- raw telemetry data;
- project API keys.

The login URL does not contain a secret invitation token. Invitation acceptance
is based on matching verified SSO email.

## Public Contract Requirements

Implementation requires GraphQL and message contracts before UI work:

- `OrganizationInvitation.deliveryStatus`.
- `OrganizationInvitation.lastDeliveryAttemptAt`.
- `OrganizationInvitation.lastDeliveryErrorCode`.
- `OrganizationInvitation.projectGrants`.
- `InvitationDeliveryStatus` enum.
- `InvitationProjectGrant` type.
- `Mutation.resendOrganizationInvitation(id)`.
- `Mutation.inviteProjectMember(input: { projectId, email, role })`.
- control-plane message subject `control.invitations.resend`.
- control-plane message subject `control.project_invitations.create`.

`inviteProjectMember` returns an `OrganizationInvitation` when the invited email
is not an active company member and a `ProjectMember` when the user already has
company membership. The GraphQL contract may model this as a union or a wrapper
object, but it must make the outcome explicit.

## Authorization

Company invitations:

- creating, revoking, resending, and listing company invitations requires
  company `admin`.

Project invitations:

- creating a project invitation requires project `admin` or company `admin`;
- the role granted by a project invitation must be one of `viewer`, `editor`,
  or `admin`;
- project grants are applied only inside the same organization as the invitation
  and project;
- local `Personal` admin cannot be removed or demoted through project invite
  side effects.

## Error Mapping

- Invalid email, invalid role, duplicate pending invite, or invalid SMTP config
  shape: `ERR-001` or `ERR-009` depending on request versus startup context.
- Missing session: `ERR-015`.
- Caller lacks company/project admin rights: `ERR-016`.
- SMTP provider unavailable, timeout, authentication failure, or refused
  message: `ERR-022 INVITATION_EMAIL_DELIVERY_FAILED`.

Provider error text must not be returned to clients. Logs include canonical
error code, delivery ID, organization ID, project ID when present, and bounded
provider category only.

## Tests

Default tests must not require a real SMTP server.

Required default tests:

- deployed SSO mode with email required fails config validation when SMTP values
  are missing;
- local mode defaults to disabled delivery;
- disabled delivery with manual mode creates `suppressed` status only when
  delivery is not required;
- company invitation creates invitation and outbox atomically;
- project invite for inactive email creates invitation plus pending project
  grant;
- accepting an invitation applies pending project grants;
- project invite for active member creates or updates project membership without
  creating a duplicate invitation;
- SMTP adapter tests use a fake local SMTP server or fake transport;
- retryable delivery failure schedules another attempt;
- exhausted attempts mark `failed_terminal`;
- resend creates a new outbox row only for pending invitations;
- logs and public errors never include SMTP password, provider token, session
  cookie, or rendered secret values.

Opt-in real SMTP integration tests require:

- `CLOUDGRID_TEST_SMTP=1`;
- all `CLOUDGRID_INVITATION_EMAIL_SMTP_*` variables needed by the provider;
- `CLOUDGRID_INVITATION_EMAIL_FROM`;
- `CLOUDGRID_PUBLIC_URL`.

Default root verification commands must skip real SMTP tests when
`CLOUDGRID_TEST_SMTP` is unset.
