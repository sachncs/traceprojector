# Security Policy

## Supported Versions

| Version | Supported          | Notes |
| ------- | ------------------ | ----- |
| 0.1.x   | :white_check_mark: | Active line under the current `traceprojector` name. |
| 0.0.x   | :x:                | End-of-life; no backports. Released under the legacy `bounded-commuting-discrete-trace-preserving-projections` repo. |

### Response-Time SLA

Best-effort targets:

- **Critical**: 30 days
- **High**: 90 days
- **Lower**: next regular release

### Disclosure Channel

For issues that cannot be reported by email, use the
[GitHub Security Advisories](https://github.com/sachncs/traceprojector/security/advisories/new)
tab for this repository.

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

1. **Do not** open a public issue describing the vulnerability.
2. Email the maintainer at **[sachncs@gmail.com](mailto:sachncs@gmail.com)** with a clear description of the issue, steps to reproduce, and potential impact.
3. If email is not available, open a private [GitHub Security Advisory](https://github.com/sachncs/traceprojector/security/advisories/new) for this repository.
4. Allow reasonable time (target: 90 days for high-severity, 30 days for critical) for the issue to be addressed before disclosing it publicly.

We take all security reports seriously and respond on a best-effort basis.

## Security Best Practices for Consumers

- This library performs numerical computation on user-provided mesh data. Always validate inputs before passing them to `Mesh` or `Projector` constructors.
- Do not execute untrusted function inputs directly through projection methods without sandboxing.
