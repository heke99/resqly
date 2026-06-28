/**
 * Placeholder database typings.
 *
 * Regenerate against a live schema with:
 *   pnpm --filter @resqly/database gen:types
 * (requires `supabase` CLI + a linked/local project).
 *
 * Until then we expose a permissive but structurally-correct shape so the rest
 * of the workspace type-checks without a running database.
 */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface GenericTable {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: [];
}

export interface Database {
  public: {
    Tables: Record<string, GenericTable>;
    Views: Record<string, GenericTable>;
    Functions: {
      allocate_case_number: {
        Args: { p_tenant: string; p_scope?: string };
        Returns: string;
      };
      has_permission: {
        Args: { p_tenant: string; p_permission: string };
        Returns: boolean;
      };
      has_tenant_access: { Args: { p_tenant: string }; Returns: boolean };
      is_platform_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: Record<string, string>;
    CompositeTypes: Record<string, never>;
  };
}
