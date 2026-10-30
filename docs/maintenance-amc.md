# Maintenance and AMC

"Lifelong" = a written annual maintenance contract + the safeguards in deploy.md. Agree before go-live.

| Item | Suggested term |
| --- | --- |
| Covered | Bug fixes, security patches, dependency updates, Tally and GST rule changes, backups, monitoring |
| Not covered | New modules or major features (quoted separately) |
| Response time | Critical (billing down): 2 h · High: same business day · Normal: 3 business days |
| Updates | Monthly patch release tested on staging; quarterly dependency upgrade |
| Hosting costs | VPS, domain, SSL, backup storage, GSP/WhatsApp API — at actuals or included, stated clearly |
| Ownership | Who owns source code and data; client gets a data export on request |
| Handover | docs/ kept current: deploy, restore, Tally agent install, runbook |

Keep CHANGELOG.md and client-readable release notes for every update.
