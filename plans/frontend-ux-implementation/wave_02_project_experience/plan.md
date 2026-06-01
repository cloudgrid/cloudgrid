# Wave 02 Project Experience

## End-to-End Outcome

The project picker, project home, and project settings surfaces guide local and
deployed users through project selection, setup, ingest credentials, retention,
AI provider settings, and safe admin actions.

## Implementation Order

1. Complete `TICKET-302` after shared shell primitives are available.
2. Record project/settings test evidence before route workspace tickets start.

## Parallelization

This wave runs as one owner because project picker, settings rail, ingest setup,
and local-mode safeguards share route and project feature files.

## Resume And Status

Resume from `TICKET-302` when `TICKET-301` is done. Record current proof in
`_status.yaml` after route tests and visual checks pass.

## Operational Path Coverage

Success path: users select or create a project, inspect setup state, and manage
project settings with stable navigation. Failure path: missing permissions,
backend unavailable responses, unavailable actions, and destructive actions show
inline reasons or confirmation. Recovery path: users can retry load/save,
dismiss one-time secrets after viewing, and return to setup from empty states.

## NFR Operations And Supply Chain Coverage

Security/privacy covers one-time secret handling and no destructive local admin
company actions. Performance/resilience covers centered project lists and
bounded settings forms. Observability/logging is UI evidence only. Production
and release use frontend typecheck, build, route tests, smoke, and Playwright
screenshots; supply-chain changes are not applicable.
