import type { Db } from '@boro-biya/db';
import { administrativePermissionKeys } from '@boro-biya/validation';
export const administrativePermissions = administrativePermissionKeys;
export type AdministrativePermission = (typeof administrativePermissions)[number];
export async function hasPermission(
  client: Pick<Db['pool'], 'query'>,
  userId: string,
  permission: AdministrativePermission,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM core.user_roles ur JOIN core.role_permissions rp ON rp.role_id = ur.role_id
    JOIN core.permissions p ON p.id = rp.permission_id WHERE ur.user_id = $1 AND p.key = $2 LIMIT 1`,
    [userId, permission],
  );
  return result.rowCount === 1;
}
export async function hasActiveAdministrator(client: Pick<Db['pool'], 'query'>): Promise<boolean> {
  const result = await client.query(
    `SELECT u.id FROM core.users u JOIN core.user_roles ur ON ur.user_id = u.id
    JOIN core.role_permissions rp ON rp.role_id = ur.role_id JOIN core.permissions p ON p.id = rp.permission_id
    WHERE u.account_status = 'active' AND NOT u.password_setup_required AND NOT u.security_setup_required AND p.key = ANY($1::text[])
    GROUP BY u.id HAVING count(DISTINCT p.key) = cardinality($1::text[]) LIMIT 1`,
    [administrativePermissions],
  );
  return result.rowCount === 1;
}
