# 🔐 Security Policy

## 🧭 Overview

LifeOS is a local-first, modular Personal AI system.  
Security, privacy, and user sovereignty are core to the project.

We take vulnerabilities seriously and appreciate responsible disclosure from the community.

---

## 📦 Supported Versions

As the project is in early development, security updates are primarily focused on the latest version.

| Version        | Supported |
| -------------- | --------- |
| Latest (main)  | ✅        |
| Older versions | ❌        |

---

## 🚨 Reporting a Vulnerability

If you discover a security vulnerability, **please do not open a public issue**.

Instead, report it responsibly:

📧 **seldonrios+lifeos@gmail.com**

Include as much detail as possible:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested mitigation (if known)

You can also include:

- Proof-of-concept code
- Logs or screenshots
- Environment details

### Before you send - redact sensitive data

Please redact sensitive personal and credential data before submitting your report:

- Auth tokens and API keys
- HTTP `Authorization` headers
- Email addresses and contact information
- Life graph snapshots or personal content
- Local file paths that reveal home directory structure
- Personal notes, captures, or goal content

For non-security concerns (bugs, feature requests, docs), use GitHub issue forms and the conduct process in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

---

## ⏱️ Response Expectations

We aim to:

- **Acknowledge** reports within 48 hours
- **Investigate and triage** within a few days
- **Provide updates** as we work toward a fix

Critical issues will be prioritized.

---

## 🛠️ Disclosure Policy

- We follow **responsible disclosure**
- Please allow time for a fix before public disclosure
- We will coordinate with you on timing if needed

---

## 🧩 Scope

Security applies to:

- Core LifeOS architecture
- Modules and integrations
- Local and remote execution paths
- Data handling, storage, and transport

Out-of-scope (unless explicitly exploitable):

- Theoretical issues without a clear attack path
- Issues requiring unrealistic assumptions

---

## 🔐 Security Principles

LifeOS is built around:

- **Local-first architecture** — minimize external exposure
- **User data ownership** — no hidden data flows
- **Modular isolation** — reduce blast radius of failures
- **Explicit permissions** — no implicit trust between modules
- **Transparency** — clear, inspectable behavior

---

## 🙏 Acknowledgements

We appreciate responsible researchers and contributors who help improve the security of LifeOS.

Contributors who report valid vulnerabilities may be acknowledged here (with permission).

---

## 🌱 Final Note

Security is not a feature — it’s a foundation.

Thank you for helping make LifeOS safer for everyone.
