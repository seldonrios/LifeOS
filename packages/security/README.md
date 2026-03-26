# @lifeos/security

Security contracts for identity, service auth, and token handling.

Current implementation includes:

- HS256 JWT issuance for service tokens
- JWT verification with signature, issuer, audience, and expiry checks
- `createSecurityClient()` helpers for issuing service-scoped tokens and deriving auth context

Defaults are local-development friendly and should be overridden in production with `LIFEOS_JWT_SECRET`.

## Spec References

- [Tech Plan Component Architecture](../../docs/phase-1/reference-architecture.md)
- [Auth Architecture](../../docs/architecture/security-and-privacy.md)
