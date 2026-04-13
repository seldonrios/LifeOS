# JWT Signing Secret Policy

## Canonical Precedence Order

`JwtService` resolves the signing secret at construction time via `getSigningSecret()` in
`packages/security/src/index.ts`. The four-step resolution order is:

1. **`LIFEOS_JWT_SECRET`** — highest priority; the preferred explicit path for all deployments.
   If set and non-empty, this value is used unconditionally.
2. **`LIFEOS_MASTER_KEY`** — intentional fallback; used only when `LIFEOS_JWT_SECRET` is absent.
   See [LIFEOS_MASTER_KEY — Rationale and Status](#lifeos_master_key--rationale-and-status) below.
3. **Test-env default** — when `NODE_ENV=test` and both vars are unset, the hard-coded value
   `'lifeos-test-secret'` is returned so tests run without configuration.
4. **Dev escape hatch / throw** — when `NODE_ENV=development` and
   `LIFEOS_JWT_ALLOW_INSECURE_DEFAULT=true`, the insecure default is returned with a console
   warning. In all other cases (including `production`) where none of the above conditions is
   met, `getSigningSecret()` **throws at startup**, failing fast before any token can be issued.

---

## LIFEOS_MASTER_KEY — Rationale and Status

`LIFEOS_MASTER_KEY` is an **intentional, supported fallback** — not a bug or a deprecated
shortcut. It exists to accommodate operators who already manage a single master key across all
LifeOS services and prefer not to introduce a second independent secret until they can schedule
rotation.

Key points:

- `LIFEOS_MASTER_KEY` is **not deprecated**. Removing it would be a breaking change and requires
  a separate deprecation wave with advance notice in `CHANGELOG.md`.
- **`LIFEOS_JWT_SECRET` is the preferred explicit path** for new deployments. Operators setting
  up LifeOS for the first time should set `LIFEOS_JWT_SECRET` rather than relying on
  `LIFEOS_MASTER_KEY`.
- When both vars are set simultaneously, `LIFEOS_JWT_SECRET` wins — `LIFEOS_MASTER_KEY` is
  silently ignored.

---

## Rotation Expectations

- Both `LIFEOS_JWT_SECRET` and `LIFEOS_MASTER_KEY` should be rotated on the **same schedule**
  to avoid leaving a stale fallback credential in place.
- Setting `LIFEOS_JWT_SECRET` independently is sufficient to rotate the signing secret without
  touching `LIFEOS_MASTER_KEY`. Because `LIFEOS_JWT_SECRET` takes unconditional precedence, the
  `LIFEOS_MASTER_KEY` value becomes unreachable as soon as `LIFEOS_JWT_SECRET` is present.
- After rotation, **restart all services** that construct `JwtService`. The secret is read from
  the environment at construction time and is not refreshed dynamically.

---

## Environment Behavior Table

| `NODE_ENV` | `LIFEOS_JWT_SECRET` set | `LIFEOS_MASTER_KEY` set | `LIFEOS_JWT_ALLOW_INSECURE_DEFAULT` | Result |
|---|---|---|---|---|
| any | ✅ | any | any | Use `LIFEOS_JWT_SECRET` |
| any | ❌ | ✅ | any | Use `LIFEOS_MASTER_KEY` |
| `test` | ❌ | ❌ | any | Use test default (`'lifeos-test-secret'`) |
| `development` | ❌ | ❌ | `true` | Use insecure default + warn |
| `development` | ❌ | ❌ | not set | **Throw at startup** |
| `production` / other | ❌ | ❌ | any | **Throw at startup** |

---

## Related

- [Threat Model](threat-model.md)
- [Source: `packages/security/src/index.ts`](../../packages/security/src/index.ts)
