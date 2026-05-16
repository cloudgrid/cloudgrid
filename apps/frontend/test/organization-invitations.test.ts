import { describe, expect, test } from "bun:test";
import {
  inviteOrganizationMemberOperation,
  organizationInvitationsOperation,
  organizationMembersOperation,
  revokeOrganizationInvitationOperation,
} from "../src/lib/graphql-client";
import { queryKeys } from "../src/lib/query-keys";

describe("organization member invitation GraphQL operations", () => {
  test("define active member and invitation operations", () => {
    expect(organizationMembersOperation).toContain(
      "query OrganizationMembers($organizationId: ID!)",
    );
    expect(organizationMembersOperation).toContain(
      "organizationMembers(organizationId: $organizationId)",
    );
    expect(organizationInvitationsOperation).toContain(
      "query OrganizationInvitations($organizationId: ID!)",
    );
    expect(organizationInvitationsOperation).toContain(
      "organizationInvitations(organizationId: $organizationId)",
    );
    expect(inviteOrganizationMemberOperation).toContain(
      "mutation InviteOrganizationMember($input: InviteOrganizationMemberInput!)",
    );
    expect(revokeOrganizationInvitationOperation).toContain(
      "mutation RevokeOrganizationInvitation($id: ID!)",
    );
  });

  test("separates active member and invitation cache keys", () => {
    expect(queryKeys.organizationMembers("org_1")).toEqual(["OrganizationMembers", "org_1"]);
    expect(queryKeys.organizationInvitations("org_1")).toEqual([
      "OrganizationInvitations",
      "org_1",
    ]);
  });
});
