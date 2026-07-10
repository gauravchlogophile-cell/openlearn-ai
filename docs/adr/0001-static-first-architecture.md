# ADR-0001: Static-first architecture

Status: Accepted · Date: 2026-07-07 · Phase 4 §1

## Decision
All learning content (lessons, registry, cheat sheets, canned lab outputs) is
pre-built to static assets and served from a CDN. Dynamic infrastructure
exists only for identity, progress, community, and live labs.

## Context
Free-forever economics require near-zero marginal cost; the 3G/low-end-device
budget requires fast first paint; forkability requires portability.

## Consequences
+ $0-class hosting at any read scale; learning survives backend outages;
  trivially portable (exit drills).
- App-like surfaces need islands discipline; personalisation is client-side
  or API-fetched, never baked into HTML.
