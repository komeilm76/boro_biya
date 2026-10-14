/** Services that may identify themselves on health responses or in structured logs. */
export const SERVICE_NAMES = ['api', 'relation', 'sos'] as const;

/** A stable first-party service identifier. */
export type ServiceName = (typeof SERVICE_NAMES)[number];

/** Service identity included in health output and logs. */
export interface ServiceIdentity {
  name: ServiceName;
  version: string;
  buildCommit: string;
}
