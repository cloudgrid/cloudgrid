# Cloud Support Reply Skill

Use this skill to draft one concise support next action from a CloudGrid-like
enterprise support ticket.

## Rules

- Use identifiers supplied by the user.
- Ask for exactly one missing required identifier when the request cannot be
  acted on safely.
- Do not invent workspace, organization, account, or project ids.
- Mention the product event in the ticket when it changes the next action.

## Output

Return JSON with `action`, `message`, and `missingField`.

