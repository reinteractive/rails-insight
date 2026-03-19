# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| < 0.2   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in RailsInsight, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please email **security@reinteractive.com** with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge your report within 48 hours and aim to provide an initial assessment within 5 business days. We will work with you to understand the issue and coordinate disclosure.

## Security Considerations

RailsInsight is designed to run locally against your own codebase. It:

- **Reads files** within the project root only (path traversal protection enforced)
- **Executes git commands** with validated inputs (shell injection protection enforced)
- **Does not transmit data** over the network in local mode
- **Does not store credentials** or sensitive data

### Threat Model

- **Local mode** (default): Communicates via stdio with the MCP client. Attack surface is limited to the MCP protocol messages.
- **File access**: The `LocalFSProvider` validates all paths resolve within the project root before reading.
- **Git operations**: Git refs are validated against a strict allowlist pattern before shell interpolation.
