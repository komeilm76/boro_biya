interface Manifest {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[];
}
export const repositoryRoot: string;
export const services: Readonly<Record<'core' | 'relation' | 'sos', string>>;
export function planService(
  service: string,
  root?: string,
): {
  selected: Map<string, { path: string; manifest: Manifest }>;
  manifest: Manifest;
};
export function exportService(service: string, output: string, options?: { root?: string }): string;
