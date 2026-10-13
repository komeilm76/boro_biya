# Architecture Decision Log and Open Questions

Record decisions here using: **ID, status, context, decision, alternatives, consequences, date, owner**. Do not silently convert an open question into a permanent assumption.

## Initial decisions

### ADR-001 — Core architecture
**Status:** Proposed  
**Decision:** Modular monolith for core API plus independently deployable Relation and SOS services.  
**Reason:** Meets the standalone-service requirement while minimizing operational and memory overhead.  
**Revisit when:** measured team, scaling, or isolation needs justify further decomposition.

### ADR-002 — Plugin ZIP security
**Status:** Required  
**Decision:** Never execute uploaded plugin code in the core process or with host privileges. Use quarantined validation and isolated container workloads with explicit capabilities, signatures/provenance, and resource/network limits.  
**Reason:** ZIP upload can become arbitrary remote code execution and host compromise.

### ADR-003 — Location sharing
**Status:** Required  
**Decision:** Live sharing is off by default; accepted follower relationship plus explicit sharing setting is required. Last-known data is labeled with timestamp and expires according to retention policy.  
**Reason:** Location is sensitive and sharing must be consent-based.

### ADR-004 — Realtime
**Status:** Proposed  
**Decision:** Use SSE for one-way feeds; add Socket.IO/WebSocket only where bidirectional low-latency behavior justifies its additional operational cost.  
**Reason:** Simpler connection model for most notifications and dashboards.

### ADR-005 — Geospatial database
**Status:** Open  
**Question:** Use PostgreSQL PostGIS for proximity searches and geospatial indexing?  
**Action:** Prototype the nearest-user query, benchmark expected data sizes, verify Docker image/extension/backup support, then decide.

## Questions to resolve before relevant implementation

1. Is username the only login identifier, or will verified email/phone be supported?
2. Is CAPTCHA always shown, or risk-triggered? Which provider/self-hosted option and privacy requirements apply?
3. Which password/session model is chosen: server-side sessions with secure cookies, or token-based mobile sessions with refresh rotation? Define web and native-client behavior.
4. What is the account lockout threshold/window/backoff and unlock policy? What abuse signals can trigger an automated ban, and what appeal path exists?
5. Which stronger recovery factors are permitted alongside security questions?
6. What location retention period applies to last-known coordinates, and is any location history needed?
7. What is the default maximum SOS radius, and how are distance ties/eligibility determined?
8. Can SOS suggestions bypass a user's disabled preference for a narrowly defined emergency case? Default: no silent override.
9. Can one SOS alert have more than one responder task, or is the first accepted responder exclusive? Define cancellation/reassignment.
10. Which map tiles, geocoding, routing, traffic, and speed-limit providers are acceptable by region, license, budget, and privacy?
11. Is push notification required in Android, and which delivery provider is acceptable?
12. What initial concurrent users, event rate, latency SLO, server CPU/RAM/disk budget, and availability target should load tests represent?
13. Which plugin publishers are trusted, and how will signing keys be managed/rotated?
14. What data retention/deletion/export obligations apply to users and audit logs?
15. Which languages are required for the first release?
