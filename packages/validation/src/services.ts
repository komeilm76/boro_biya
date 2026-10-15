import { z } from 'zod';

/**
 * Service vocabulary. This list is the single source of truth for the services that exist
 * (ARCHITECTURE §2, OPS-02 … OPS-04 plus the web artefact); `@boro-biya/contracts` re-exports it.
 * A service that does not exist yet (for example a background worker) is added here in the phase
 * that creates it, never in advance.
 */
export const SERVICE_NAMES = ['api', 'relation', 'sos', 'web'] as const;

export type ServiceName = (typeof SERVICE_NAMES)[number];

export const serviceNameSchema = z.enum(SERVICE_NAMES);
