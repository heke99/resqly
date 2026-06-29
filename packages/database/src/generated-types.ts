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
      tow_drivers_within_radius: {
        Args: { p_lat: number; p_lng: number; p_radius_m: number; p_limit?: number };
        Returns: Array<{
          driver_id: string;
          tow_company_id: string;
          distance_m: number;
          last_lat: number;
          last_lng: number;
        }>;
      };
      dispatch_eligible_candidates: {
        Args: {
          p_lat: number;
          p_lng: number;
          p_radius_m: number;
          p_limit?: number;
          p_payer_type?: string;
          p_insurance_tenant_id?: string | null;
          p_now?: string;
        };
        Returns: Array<{
          driver_id: string;
          tow_company_id: string;
          duty_status: string;
          is_online: boolean;
          is_busy: boolean;
          distance_m: number;
          can_handle_ev: boolean;
          has_flatbed: boolean;
          can_tow_heavy_truck: boolean;
          can_tow_motorcycle: boolean;
        }>;
      };
      accept_tow_offer: {
        Args: { p_job: string; p_driver: string };
        Returns: Array<{ accepted: boolean; tow_company_id: string | null; reason: string | null }>;
      };
    };
    Enums: Record<string, string>;
    CompositeTypes: Record<string, never>;
  };
}
