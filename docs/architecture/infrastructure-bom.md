# LifeOS Infrastructure Bill of Materials

## Overview

This guide provides concrete, budget-tiered hardware recommendations for self-hosted LifeOS deployments. These BOMs assume:

- Self-hosted LifeOS with always-on web/API/database/sync services
- Mobile clients via Expo EAS Build (hosted service for React Native binaries—no local Mac required)
- Proper backup discipline and UPS protection
- Practical local AI / privacy work where cost-justified

Prices are representative list prices (B&H, vendor MSRPs) as of 2026. Adjust by region and current market.

---

## Budget Build — One-Box Starter

**Best for:** 1 user or a couple, normal always-on LifeOS services, cloud AI, no serious local LLM work.

### Hardware

| Component        | Model                                                    | Notes                                               | Price       |
| ---------------- | -------------------------------------------------------- | --------------------------------------------------- | ----------- |
| **Primary Host** | Beelink EQR6 (AMD Ryzen 5 6600U, 24GB LPDDR5, 500GB SSD) | x86 always-on, dual M.2 PCIe 4.0 up to 8TB, 85W PSU | $509.00     |
| **UPS**          | APC BX1500M (1500VA / 900W, 10 outlets)                  | Protects against brief power loss                   | $189.99     |
| **Backup Drive** | WD Elements Desktop 8TB (external HDD)                   | Offline rotation backup                             | $209.99     |
|                  |                                                          | **Estimated Total**                                 | **$908.98** |

### Why This Tier

This is the **cheapest build I'd still call "real"**. It gives you:

- A dedicated, always-on x86 box for app/API/database workloads
- Enough RAM for typical LifeOS services (sync, calendar, notes, basic orchestration)
- **No local LLM burden:** cloud AI or Ollama on small models only
- UPS protection against brownouts and brief outages
- Separate backup disk for rotation off-site

Cost savings come from:

- Single mini PC (no NAS)
- Bare UPS (no redundancy layer)
- External HDD backup instead of NAS RAID

### Typical Deployment

- LifeOS core (web, API, database, NATS, module-loader) runs on the Beelink
- Backup drops to external USB disk on a schedule
- Whisper/voice runs on local CPU (acceptable ~1s latency)
- Larger models or heavy inference → cloud LLM API

---

## Recommended Build — Serious Home Production Node

**Best for:** A real Personal Operations OS / early Household Coordination OS deployment with proper local storage, backup discipline, and room to grow.

### Hardware

| Component                   | Model                                                        | Notes                                                         | Price         |
| --------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- | ------------- |
| **Primary Host**            | MINISFORUM UM890 Pro (AMD Ryzen 9 8945HS, 64GB RAM, 1TB SSD) | Dual 2.5GbE, dual M.2 PCIe 4.0, Oculink, USB4, up to 96GB RAM | $1,135.00     |
| **NAS / Online Backup**     | Synology DS923+ (4-bay NAS)                                  | Always-on, 10GbE & NVMe cache support, `>50TB` potential      | $599.99       |
| **NAS Drives**              | 2 × WD Red Plus 8TB (B&H 2-pack)                             | RAID-optimized for NAS up to 8 bays                           | $399.98       |
| **UPS**                     | APC BX1500M (1500VA / 900W)                                  | Protects NAS + primary host                                   | $189.99       |
| **Off-Box Rotation Backup** | WD Elements Desktop 8TB (external HDD)                       | Rotate off-site monthly/quarterly                             | $209.99       |
|                             |                                                              | **Estimated Total**                                           | **$2,534.95** |

### Why This Is the Sweet Spot

This is **the tier I would actually buy first for LifeOS**:

- The mini PC is strong enough for app/API/database/worker orchestration without choking
- The DS923+ provides an always-on, managed backup and file target with RAID discipline
- The external disk gives you a second copy you can rotate off-box for disaster recovery
- Path to upgrade later: swap in a 10GbE card or M.2 NVMe cache on the NAS without replacing hardware

### Privacy / Local Voice Note

**Important nuance:** If your privacy goal is **local voice but not full local LLM inference**, this tier is often enough.

Home Assistant's local voice docs report:

- Whisper on a Raspberry Pi 4: ~8 seconds per request
- Whisper on an Intel NUC: `<1 second`

This is a good signal that **local voice is much lighter than serious local model serving**. You can run private transcription on the UM890 without needing the Privacy-max tier.

### Typical Deployment

- LifeOS core on the MINISFORUM (64GB supports medium-scale agent orchestration)
- DS923+ runs Synology services (backup, media, optional Synology Apps)
- 2× WD Red in RAID 1 (mirrored, protected against single disk failure)
- External WD Elements rotates off-site, keeping a copy safe from local disaster
- Local Whisper for always-private voice (CPU-bound on the UM890)
- Cloud LLM or small Ollama models for heavier inference

---

## Privacy-Max / Local AI Build — First Tier I'd Call "Real Local AI"

**Best for:** Strong privacy posture, local transcription, local agent workflows, and practical small-to-mid local model work.

### Hardware

| Component                   | Model                                                                                            | Notes                                                      | Price         |
| --------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ------------- |
| **Primary Host**            | CLX SET Gaming Desktop (Intel Core Ultra 9 285K, 64GB DDR5, GeForce RTX 5070, 2TB NVMe, 4TB HDD) | Heavy compute for local models + agents, excellent cooling | $3,049.99     |
| **NAS / Online Backup**     | Synology DS923+ (4-bay NAS)                                                                      | 10GbE, NVMe cache, always-on target                        | $599.99       |
| **NAS Drives**              | 4 × WD Red Plus 8TB (B&H 4-pack)                                                                 | Full 4-bay RAID, near `50TB` usable                        | $799.96       |
| **UPS**                     | APC BX1500M (1500VA / 900W)                                                                      | Protects NAS + primary host                                | $189.99       |
| **Off-Box Rotation Backup** | WD Elements Desktop 8TB (external HDD)                                                           | Rotate off-site                                            | $209.99       |
|                             |                                                                                                  | **Estimated Total**                                        | **$4,849.92** |

### Why This Is the Local AI Tier

Ollama's published hardware support:

- NVIDIA GPUs: compute capability 5.0+ supported, **RTX 50xx family included**
- Model memory requirements:
  - **7B models:** ≥8GB VRAM
  - **13B models:** ≥16GB VRAM
  - **70B models:** ≥64GB system RAM

With **64GB RAM + RTX 5070**, this is **the first tier where local AI becomes practical instead of aspirational**:

- Run 7B–13B models comfortably on GPU VRAM
- Fall back to CPU for 70B models or batched inference
- Orchestrate multi-model agent workflows locally
- Private voice, vision, and text processing

### Important Limitation

This is a **small-to-mid local-model tier, not a "run all models locally all the time" tier**. If you specifically want big models running concurrently, move into heavier workstation/server budgets (3× cost and up).

### Typical Deployment

- CLX desktop runs LifeOS core + local Ollama
- Load 7B–13B models (Llama 2, Mistral, etc.) on the RTX 5070
- Use DS923+ for synchronized backups and media library
- Rotate external WD Elements off-site monthly
- Local Whisper, vision, and reasoning agents stay private
- Fall back to cloud only for very large models or exceptional load

---

## Which One to Choose

### My Recommendation

**Buy the Recommended build unless you already know that local AI is a core requirement on day one.**

- **Budget build** is enough to get LifeOS into real daily service, but it feels scrappy for always-on production.
- **Recommended build** is the one that feels like a **proper home production node** with sane storage and backup posture.
- **Privacy-max build** is the right jump **only when you truly want local inference and privacy-first AI to be part of the product, not just an experiment**.

### Cost Reduction Order

If you need to cut cost **within** a tier, cut in this order:

1. **Skip the NAS on the Budget build**
2. **Keep the UPS** (non-negotiable)
3. **Keep at least one separate backup target** (non-negotiable)
4. **Do not overbuy local-AI hardware until local models are truly part of your plan**

This keeps the system **professional and resilient** without forcing you into the most expensive tier too early.

---

## Migration Playbook: Budget -> Recommended (Minimal Downtime)

This playbook assumes you are moving from:

- Budget: one mini PC + UPS + external backup disk
- To Recommended: stronger mini PC + Synology DS923+ + RAID + off-box rotation backup

### Target Architecture After Migration

- Primary compute: MINISFORUM UM890 (apps, API, workers, DB if still single-node)
- NAS: DS923+ (online backups, file target, snapshots)
- External drive: WD Elements (off-box rotation)

### Downtime Goal

- Planned downtime window: **10-30 minutes** for final data cutover
- Service read-only/degraded mode before cutover: **optional but recommended**

### Phase 0: Prep (No Downtime)

1. Rack/power/network the DS923+ on UPS power.
2. Install two WD Red Plus drives and configure RAID 1 + health monitoring.
3. Create shared folders:

- `lifeos-backups`
- `lifeos-archives`
- `lifeos-media` (optional)

4. Enable NAS snapshots/retention policy (hourly short retention + daily long retention).
5. Build the UM890 host image (OS hardening, Docker, compose, secrets tooling).
6. Pin static DHCP leases or static IPs for old host, new host, and NAS.
7. Lower DNS TTL for LifeOS endpoint(s) to `60` seconds at least 24h before cutover.

### Phase 1: Baseline Backups and Restore Test (No Downtime)

1. Run a full backup from Budget host to NAS (`lifeos-backups`).
2. Copy latest backup set to external WD disk.
3. Run a **test restore** on UM890 in an isolated network or alternate ports:

- Restore DB snapshot
- Start core services
- Verify app/API health endpoints and one login flow

4. Record measured restore time; this is your realistic rollback/recovery baseline.

Exit criteria:

- You can restore and boot a working stack on UM890 from backup alone.

### Phase 2: Parallel Warmup on New Host (No Downtime)

1. Deploy LifeOS compose stack on UM890 but keep it non-public (no production DNS yet).
2. Configure secrets and environment parity with the Budget host.
3. Mirror non-critical data continuously (attachments, exports, static files) from old host to NAS.
4. Run smoke tests repeatedly on UM890:

- Authentication
- Core module load
- DB connectivity
- Queue/event bus health

Exit criteria:

- New host passes smoke checks for at least 24h while old host remains primary.

### Phase 3: Cutover Rehearsal (No Downtime)

1. Schedule a rehearsal window and execute the exact cutover sequence below without DNS switch.
2. Time each step and create a run-sheet with owner + fallback action.
3. Fix any step that exceeds expected time.

Exit criteria:

- Rehearsal completes inside target maintenance window.

### Phase 4: Production Cutover (10-30 Minutes)

1. Announce maintenance start and freeze writes (read-only mode if supported).
2. Stop write-producing services on Budget host:

- API write endpoints
- background workers/schedulers

3. Take final incremental backup (DB + stateful volumes) to NAS.
4. Validate backup artifact integrity (checksums / backup tool verification).
5. Restore final delta to UM890.
6. Start core dependencies on UM890 (DB, queue/event bus, cache if used).
7. Start LifeOS app/API/workers on UM890.
8. Run production smoke checks:

- Login/session creation
- Read/write transaction (create note/task, then read back)
- Module-loader startup diagnostics

9. Switch traffic:

- Update reverse proxy upstream to UM890 or
- Move DNS A/AAAA record to UM890

10. Keep Budget host powered but isolated from write traffic for rapid rollback.

### Phase 5: Immediate Post-Cutover Validation (First 2 Hours)

1. Watch logs and error rates continuously.
2. Confirm scheduled jobs execute once (no duplicates).
3. Verify sync clients (mobile/desktop) reconnect and complete one round-trip sync.
4. Trigger one on-demand backup from UM890 to NAS.
5. Create and verify off-box copy to external WD disk.

Success criteria:

- No critical errors for 2 hours
- Backups complete successfully from new primary host
- User workflows function normally

### Rollback Plan (If Cutover Fails)

Trigger rollback if any of these occur and cannot be fixed in 15 minutes:

- Authentication failure for all users
- Persistent DB migration/runtime errors
- Data integrity mismatch on verification transactions

Rollback steps:

1. Stop UM890 public traffic.
2. Repoint reverse proxy/DNS to Budget host.
3. Re-enable write services on Budget host.
4. Announce rollback completion.
5. Preserve UM890 logs/artifacts for incident review.

### Hardening After Successful Migration

1. Keep Budget host as warm standby for 7-14 days.
2. Add NAS snapshot replication and alerting (disk health, failed backups, UPS events).
3. Document new RPO/RTO targets and validate monthly restore drills.
4. Only then repurpose/decommission old hardware.

### Practical Sequencing Rule

To minimize downtime and risk, always migrate in this order:

1. **Backup destination first** (NAS)
2. **Restore confidence second** (test restore)
3. **Compute cutover third** (new host)
4. **Traffic switch last** (DNS/reverse proxy)

This sequence keeps your rollback path open until the final step.

---

## Key Assumptions

- **Expo EAS Build:** Mobile app binaries (iOS/Android) are built in Expo's hosted service. You do not need a Mac or iOS device for CI/CD.
- **Always-on expectation:** Target 99% uptime for personal use (UPS + single backup disk is acceptable; NAS + RAID adds the second layer).
- **Self-hosted:** You own the hardware, data, and encryption keys. Cloud AI is available but optional.
- **Scalability:** Each tier supports growth to the next one without total rebuild:
  - Budget → Recommended: Add NAS, keep the Beelink
  - Recommended → Privacy-max: Upgrade primary host, keep NAS and backup discipline

---

## Related Documentation

- [Hardware Profile](./hardware.md) — Reference architecture and design philosophy
- [SETUP.md](../SETUP.md) — Development environment setup
- [Security and Privacy](./security-and-privacy.md) — Encryption, backup, and data protection strategy
