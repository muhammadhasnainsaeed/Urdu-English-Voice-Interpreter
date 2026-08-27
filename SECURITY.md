# Security Policy

## Supported versions

Only the latest version on the default branch is currently supported.

## Reporting a vulnerability

Please do not open a public issue for a security vulnerability. Report it
privately through the repository maintainer's GitHub profile or security
contact. Include a concise description, affected files or versions, steps to
reproduce, and any suggested mitigation.

Never send Azure keys, `.env` files, meeting content, transcripts, or recordings
with a report.

We will acknowledge reports when received, investigate the impact, and publish
a fix or mitigation when appropriate.

## Security practices

- Keep credentials in `.env`, which is ignored by Git.
- Use `.env.example` as the public configuration reference.
- Keep secrets in the Electron main process; do not expose them to the renderer.
- Review logs before sharing them because transcripts and provider errors may
  contain sensitive content.
