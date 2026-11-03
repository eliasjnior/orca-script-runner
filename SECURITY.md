# Security policy

Both plugins run code on the machine that runs Orca: a Node worker with your user account's
access, and Scripts types commands into your terminals. Please report anything that lets them do
more than their README says.

## Reporting a vulnerability

Report it privately through
[GitHub's private vulnerability reporting](https://github.com/eliasjnior/orca-plugins/security/advisories/new),
not in a public issue. Include the plugin and version, what an attacker controls (for example a
crafted `orca.yaml` or note) and what it leads to.

You should get an answer within a week. Fixes ship as a new version in this repository's catalog,
which Orca offers as an update.

## Supported versions

Only the newest version of each plugin in `orca-catalog.json` gets security fixes.
