import { z } from "zod";
import { uuidSchema } from "./common";
import { permissionKeySchema, roleKeySchema } from "./enums";

export const userProfileSchema = z.object({
  id: uuidSchema,
  email: z.string().email().nullable().optional(),
  full_name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  is_platform_admin: z.boolean().default(false),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

export const tenantUserSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  user_id: uuidSchema,
  status: z.enum(["active", "invited", "suspended"]).default("active"),
});
export type TenantUser = z.infer<typeof tenantUserSchema>;

export const userRoleSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  user_id: uuidSchema,
  role_key: roleKeySchema,
});
export type UserRole = z.infer<typeof userRoleSchema>;

export const permissionSchema = z.object({
  key: permissionKeySchema,
  description: z.string(),
});
export type Permission = z.infer<typeof permissionSchema>;

/** A resolved access context evaluated server-side for every protected action. */
export const accessContextSchema = z.object({
  user_id: uuidSchema,
  tenant_id: uuidSchema.nullable(),
  is_platform_admin: z.boolean(),
  roles: z.array(roleKeySchema),
  permissions: z.array(permissionKeySchema),
});
export type AccessContext = z.infer<typeof accessContextSchema>;
