export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      api_request_logs: {
        Row: {
          api_client_id: string | null;
          created_at: string;
          id: string;
          ip: string | null;
          method: string;
          path: string;
          request_id: string;
          status_code: number | null;
          tenant_id: string | null;
        };
        Insert: {
          api_client_id?: string | null;
          created_at?: string;
          id?: string;
          ip?: string | null;
          method: string;
          path: string;
          request_id: string;
          status_code?: number | null;
          tenant_id?: string | null;
        };
        Update: {
          api_client_id?: string | null;
          created_at?: string;
          id?: string;
          ip?: string | null;
          method?: string;
          path?: string;
          request_id?: string;
          status_code?: number | null;
          tenant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "api_request_logs_api_client_id_fkey";
            columns: ["api_client_id"];
            isOneToOne: false;
            referencedRelation: "tenant_api_clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "api_request_logs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "api_request_logs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "api_request_logs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_api_client_id: string | null;
          actor_kind: string | null;
          actor_user_id: string | null;
          actor_worker: string | null;
          created_at: string;
          device: string | null;
          entity_id: string | null;
          entity_type: string;
          fields: string[];
          id: string;
          ip: string | null;
          metadata: Json | null;
          reason: string | null;
          tenant_id: string | null;
        };
        Insert: {
          action: string;
          actor_api_client_id?: string | null;
          actor_kind?: string | null;
          actor_user_id?: string | null;
          actor_worker?: string | null;
          created_at?: string;
          device?: string | null;
          entity_id?: string | null;
          entity_type: string;
          fields?: string[];
          id?: string;
          ip?: string | null;
          metadata?: Json | null;
          reason?: string | null;
          tenant_id?: string | null;
        };
        Update: {
          action?: string;
          actor_api_client_id?: string | null;
          actor_kind?: string | null;
          actor_user_id?: string | null;
          actor_worker?: string | null;
          created_at?: string;
          device?: string | null;
          entity_id?: string | null;
          entity_type?: string;
          fields?: string[];
          id?: string;
          ip?: string | null;
          metadata?: Json | null;
          reason?: string | null;
          tenant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_api_client_id_fkey";
            columns: ["actor_api_client_id"];
            isOneToOne: false;
            referencedRelation: "tenant_api_clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      bankid_auth_results: {
        Row: {
          created_at: string;
          hint_code: string | null;
          id: string;
          session_id: string;
          status: Database["public"]["Enums"]["bankid_status"];
        };
        Insert: {
          created_at?: string;
          hint_code?: string | null;
          id?: string;
          session_id: string;
          status: Database["public"]["Enums"]["bankid_status"];
        };
        Update: {
          created_at?: string;
          hint_code?: string | null;
          id?: string;
          session_id?: string;
          status?: Database["public"]["Enums"]["bankid_status"];
        };
        Relationships: [
          {
            foreignKeyName: "bankid_auth_results_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "bankid_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      bankid_sessions: {
        Row: {
          auto_start_token: string | null;
          callback_state: string | null;
          completed_at: string | null;
          completion_processed_at: string | null;
          created_at: string;
          environment: Database["public"]["Enums"]["bankid_env"];
          hint_code: string | null;
          id: string;
          incident_id: string | null;
          order_ref: string;
          provider: string;
          purpose: string;
          qr_start_secret: string | null;
          qr_start_token: string | null;
          raw_status: Json | null;
          session_expires_at: string | null;
          status: Database["public"]["Enums"]["bankid_status"];
          subscription_token: string | null;
          tenant_id: string | null;
          tic_session_id: string | null;
          user_id: string | null;
          webhook_received_at: string | null;
        };
        Insert: {
          auto_start_token?: string | null;
          callback_state?: string | null;
          completed_at?: string | null;
          completion_processed_at?: string | null;
          created_at?: string;
          environment: Database["public"]["Enums"]["bankid_env"];
          hint_code?: string | null;
          id?: string;
          incident_id?: string | null;
          order_ref: string;
          provider?: string;
          purpose: string;
          qr_start_secret?: string | null;
          qr_start_token?: string | null;
          raw_status?: Json | null;
          session_expires_at?: string | null;
          status?: Database["public"]["Enums"]["bankid_status"];
          subscription_token?: string | null;
          tenant_id?: string | null;
          tic_session_id?: string | null;
          user_id?: string | null;
          webhook_received_at?: string | null;
        };
        Update: {
          auto_start_token?: string | null;
          callback_state?: string | null;
          completed_at?: string | null;
          completion_processed_at?: string | null;
          created_at?: string;
          environment?: Database["public"]["Enums"]["bankid_env"];
          hint_code?: string | null;
          id?: string;
          incident_id?: string | null;
          order_ref?: string;
          provider?: string;
          purpose?: string;
          qr_start_secret?: string | null;
          qr_start_token?: string | null;
          raw_status?: Json | null;
          session_expires_at?: string | null;
          status?: Database["public"]["Enums"]["bankid_status"];
          subscription_token?: string | null;
          tenant_id?: string | null;
          tic_session_id?: string | null;
          user_id?: string | null;
          webhook_received_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "bankid_sessions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "bankid_sessions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "bankid_sessions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bankid_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_bankid_sessions_incident";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "incidents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_bankid_sessions_incident";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["incident_id"];
          },
        ];
      };
      bankid_signatures: {
        Row: {
          bankid_status: Database["public"]["Enums"]["bankid_status"];
          completed_at: string | null;
          created_at: string;
          device: string | null;
          display_name: string;
          environment: Database["public"]["Enums"]["bankid_env"];
          id: string;
          incident_id: string | null;
          ip: string | null;
          ocsp_response: string | null;
          order_ref: string;
          personal_number_hash: string;
          raw_completion: Json | null;
          signature: string;
          signed_payload_hash: string;
          tenant_id: string;
          tic_session_id: string | null;
          user_id: string;
          user_non_visible_data_hash: string | null;
          user_visible_data_hash: string | null;
        };
        Insert: {
          bankid_status: Database["public"]["Enums"]["bankid_status"];
          completed_at?: string | null;
          created_at?: string;
          device?: string | null;
          display_name: string;
          environment: Database["public"]["Enums"]["bankid_env"];
          id?: string;
          incident_id?: string | null;
          ip?: string | null;
          ocsp_response?: string | null;
          order_ref: string;
          personal_number_hash: string;
          raw_completion?: Json | null;
          signature: string;
          signed_payload_hash: string;
          tenant_id: string;
          tic_session_id?: string | null;
          user_id: string;
          user_non_visible_data_hash?: string | null;
          user_visible_data_hash?: string | null;
        };
        Update: {
          bankid_status?: Database["public"]["Enums"]["bankid_status"];
          completed_at?: string | null;
          created_at?: string;
          device?: string | null;
          display_name?: string;
          environment?: Database["public"]["Enums"]["bankid_env"];
          id?: string;
          incident_id?: string | null;
          ip?: string | null;
          ocsp_response?: string | null;
          order_ref?: string;
          personal_number_hash?: string;
          raw_completion?: Json | null;
          signature?: string;
          signed_payload_hash?: string;
          tenant_id?: string;
          tic_session_id?: string | null;
          user_id?: string;
          user_non_visible_data_hash?: string | null;
          user_visible_data_hash?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "bankid_signatures_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "bankid_signatures_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "bankid_signatures_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bankid_signatures_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_bankid_sig_incident";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "incidents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_bankid_sig_incident";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["incident_id"];
          },
        ];
      };
      billing_usage_events: {
        Row: {
          id: string;
          kind: string;
          occurred_at: string;
          quantity: number;
          tenant_id: string;
        };
        Insert: {
          id?: string;
          kind: string;
          occurred_at?: string;
          quantity?: number;
          tenant_id: string;
        };
        Update: {
          id?: string;
          kind?: string;
          occurred_at?: string;
          quantity?: number;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_usage_events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "billing_usage_events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "billing_usage_events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      case_number_sequences: {
        Row: {
          current_value: number;
          scope: string;
          tenant_id: string;
          year: number;
        };
        Insert: {
          current_value?: number;
          scope?: string;
          tenant_id: string;
          year: number;
        };
        Update: {
          current_value?: number;
          scope?: string;
          tenant_id?: string;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: "case_number_sequences_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "case_number_sequences_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "case_number_sequences_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      case_numbers: {
        Row: {
          case_number: string;
          created_at: string;
          id: string;
          scope: string;
          sequence: number;
          tenant_id: string;
          year: number;
        };
        Insert: {
          case_number: string;
          created_at?: string;
          id?: string;
          scope?: string;
          sequence: number;
          tenant_id: string;
          year: number;
        };
        Update: {
          case_number?: string;
          created_at?: string;
          id?: string;
          scope?: string;
          sequence?: number;
          tenant_id?: string;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: "case_numbers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "case_numbers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "case_numbers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      claim_status_events: {
        Row: {
          actor_user_id: string | null;
          claim_id: string;
          created_at: string;
          from_status: Database["public"]["Enums"]["claim_status"] | null;
          id: string;
          reason: string | null;
          to_status: Database["public"]["Enums"]["claim_status"];
        };
        Insert: {
          actor_user_id?: string | null;
          claim_id: string;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["claim_status"] | null;
          id?: string;
          reason?: string | null;
          to_status: Database["public"]["Enums"]["claim_status"];
        };
        Update: {
          actor_user_id?: string | null;
          claim_id?: string;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["claim_status"] | null;
          id?: string;
          reason?: string | null;
          to_status?: Database["public"]["Enums"]["claim_status"];
        };
        Relationships: [
          {
            foreignKeyName: "claim_status_events_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "claim_status_events_claim_id_fkey";
            columns: ["claim_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["claim_id"];
          },
          {
            foreignKeyName: "claim_status_events_claim_id_fkey";
            columns: ["claim_id"];
            isOneToOne: false;
            referencedRelation: "insurance_claims";
            referencedColumns: ["id"];
          },
        ];
      };
      consent_records: {
        Row: {
          consent_type: Database["public"]["Enums"]["consent_type"];
          created_at: string;
          granted: boolean;
          id: string;
          tenant_id: string;
          user_id: string;
          version: string;
        };
        Insert: {
          consent_type: Database["public"]["Enums"]["consent_type"];
          created_at?: string;
          granted: boolean;
          id?: string;
          tenant_id: string;
          user_id: string;
          version: string;
        };
        Update: {
          consent_type?: Database["public"]["Enums"]["consent_type"];
          created_at?: string;
          granted?: boolean;
          id?: string;
          tenant_id?: string;
          user_id?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "consent_records_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "consent_records_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "consent_records_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consent_records_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_consent_acceptances: {
        Row: {
          accepted_at: string;
          accepted_text_hash: string;
          consent_kind: string;
          id: string;
          incident_id: string | null;
          ip: string | null;
          legal_version_id: string | null;
          metadata: NonNullable<Json>;
          tenant_id: string;
          tow_job_id: string | null;
          user_agent: string | null;
          user_id: string;
          vehicle_id: string | null;
          vehicle_policy_id: string | null;
        };
        Insert: {
          accepted_at?: string;
          accepted_text_hash: string;
          consent_kind: string;
          id?: string;
          incident_id?: string | null;
          ip?: string | null;
          legal_version_id?: string | null;
          metadata?: NonNullable<Json>;
          tenant_id: string;
          tow_job_id?: string | null;
          user_agent?: string | null;
          user_id: string;
          vehicle_id?: string | null;
          vehicle_policy_id?: string | null;
        };
        Update: {
          accepted_at?: string;
          accepted_text_hash?: string;
          consent_kind?: string;
          id?: string;
          incident_id?: string | null;
          ip?: string | null;
          legal_version_id?: string | null;
          metadata?: NonNullable<Json>;
          tenant_id?: string;
          tow_job_id?: string | null;
          user_agent?: string | null;
          user_id?: string;
          vehicle_id?: string | null;
          vehicle_policy_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "customer_consent_acceptances_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "incidents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_consent_acceptances_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["incident_id"];
          },
          {
            foreignKeyName: "customer_consent_acceptances_legal_version_id_fkey";
            columns: ["legal_version_id"];
            isOneToOne: false;
            referencedRelation: "tenant_legal_text_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_consent_acceptances_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "customer_consent_acceptances_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "customer_consent_acceptances_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_consent_acceptances_tow_job_id_fkey";
            columns: ["tow_job_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["tow_job_id"];
          },
          {
            foreignKeyName: "customer_consent_acceptances_tow_job_id_fkey";
            columns: ["tow_job_id"];
            isOneToOne: false;
            referencedRelation: "tow_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_consent_acceptances_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_consent_acceptances_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_consent_acceptances_vehicle_policy_id_fkey";
            columns: ["vehicle_policy_id"];
            isOneToOne: false;
            referencedRelation: "vehicle_insurance_policies";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_insurance_connections: {
        Row: {
          bankid_verified_at: string | null;
          consent_record_id: string | null;
          created_at: string;
          customer_user_id: string;
          id: string;
          insurance_company_id: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          bankid_verified_at?: string | null;
          consent_record_id?: string | null;
          created_at?: string;
          customer_user_id: string;
          id?: string;
          insurance_company_id: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          bankid_verified_at?: string | null;
          consent_record_id?: string | null;
          created_at?: string;
          customer_user_id?: string;
          id?: string;
          insurance_company_id?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_insurance_connections_consent_record_id_fkey";
            columns: ["consent_record_id"];
            isOneToOne: false;
            referencedRelation: "consent_records";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_insurance_connections_customer_user_id_fkey";
            columns: ["customer_user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_insurance_connections_insurance_company_id_fkey";
            columns: ["insurance_company_id"];
            isOneToOne: false;
            referencedRelation: "insurance_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_insurance_connections_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "customer_insurance_connections_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "customer_insurance_connections_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      driver_devices: {
        Row: {
          created_at: string;
          device_name: string | null;
          driver_id: string;
          expo_push_token: string;
          id: string;
          last_active_at: string;
          platform: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          device_name?: string | null;
          driver_id: string;
          expo_push_token: string;
          id?: string;
          last_active_at?: string;
          platform?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          device_name?: string | null;
          driver_id?: string;
          expo_push_token?: string;
          id?: string;
          last_active_at?: string;
          platform?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "driver_devices_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "driver_performance_stats";
            referencedColumns: ["driver_id"];
          },
          {
            foreignKeyName: "driver_devices_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "tow_drivers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "driver_devices_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      fraud_flags: {
        Row: {
          created_at: string;
          flag: string;
          id: string;
          incident_id: string | null;
          severity: string;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          flag: string;
          id?: string;
          incident_id?: string | null;
          severity?: string;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          flag?: string;
          id?: string;
          incident_id?: string | null;
          severity?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fraud_flags_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "incidents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fraud_flags_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["incident_id"];
          },
          {
            foreignKeyName: "fraud_flags_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "fraud_flags_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "fraud_flags_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      incident_evidence: {
        Row: {
          content_type: string;
          created_at: string;
          id: string;
          incident_id: string;
          storage_path: string;
          uploaded_by: string | null;
          uploaded_by_api_client_id: string | null;
        };
        Insert: {
          content_type: string;
          created_at?: string;
          id?: string;
          incident_id: string;
          storage_path: string;
          uploaded_by?: string | null;
          uploaded_by_api_client_id?: string | null;
        };
        Update: {
          content_type?: string;
          created_at?: string;
          id?: string;
          incident_id?: string;
          storage_path?: string;
          uploaded_by?: string | null;
          uploaded_by_api_client_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "incident_evidence_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "incidents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incident_evidence_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["incident_id"];
          },
          {
            foreignKeyName: "incident_evidence_uploaded_by_api_client_id_fkey";
            columns: ["uploaded_by_api_client_id"];
            isOneToOne: false;
            referencedRelation: "tenant_api_clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incident_evidence_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      incident_locations: {
        Row: {
          accuracy_m: number | null;
          address: string | null;
          created_at: string;
          geom: unknown;
          id: string;
          incident_id: string;
          kind: string;
          lat: number | null;
          lng: number | null;
          manually_adjusted: boolean;
        };
        Insert: {
          accuracy_m?: number | null;
          address?: string | null;
          created_at?: string;
          geom?: unknown;
          id?: string;
          incident_id: string;
          kind?: string;
          lat?: number | null;
          lng?: number | null;
          manually_adjusted?: boolean;
        };
        Update: {
          accuracy_m?: number | null;
          address?: string | null;
          created_at?: string;
          geom?: unknown;
          id?: string;
          incident_id?: string;
          kind?: string;
          lat?: number | null;
          lng?: number | null;
          manually_adjusted?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "incident_locations_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "incidents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incident_locations_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["incident_id"];
          },
        ];
      };
      incident_participants: {
        Row: {
          created_at: string;
          id: string;
          incident_id: string;
          role: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          incident_id: string;
          role: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          incident_id?: string;
          role?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "incident_participants_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "incidents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incident_participants_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["incident_id"];
          },
          {
            foreignKeyName: "incident_participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      incident_risk_scores: {
        Row: {
          created_at: string;
          flags: string[];
          id: string;
          incident_id: string;
          score: number;
          status: Database["public"]["Enums"]["risk_status"];
        };
        Insert: {
          created_at?: string;
          flags?: string[];
          id?: string;
          incident_id: string;
          score?: number;
          status?: Database["public"]["Enums"]["risk_status"];
        };
        Update: {
          created_at?: string;
          flags?: string[];
          id?: string;
          incident_id?: string;
          score?: number;
          status?: Database["public"]["Enums"]["risk_status"];
        };
        Relationships: [
          {
            foreignKeyName: "incident_risk_scores_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "incidents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incident_risk_scores_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["incident_id"];
          },
        ];
      };
      incident_safety_checks: {
        Row: {
          created_at: string;
          dangerous_location: boolean;
          id: string;
          incident_id: string;
          notes: string | null;
          passengers_safe: boolean | null;
        };
        Insert: {
          created_at?: string;
          dangerous_location?: boolean;
          id?: string;
          incident_id: string;
          notes?: string | null;
          passengers_safe?: boolean | null;
        };
        Update: {
          created_at?: string;
          dangerous_location?: boolean;
          id?: string;
          incident_id?: string;
          notes?: string | null;
          passengers_safe?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "incident_safety_checks_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "incidents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incident_safety_checks_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["incident_id"];
          },
        ];
      };
      incident_status_events: {
        Row: {
          actor_api_client_id: string | null;
          actor_kind: string | null;
          actor_user_id: string | null;
          actor_worker: string | null;
          created_at: string;
          from_status: Database["public"]["Enums"]["incident_status"] | null;
          id: string;
          incident_id: string;
          reason: string | null;
          to_status: Database["public"]["Enums"]["incident_status"];
        };
        Insert: {
          actor_api_client_id?: string | null;
          actor_kind?: string | null;
          actor_user_id?: string | null;
          actor_worker?: string | null;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["incident_status"] | null;
          id?: string;
          incident_id: string;
          reason?: string | null;
          to_status: Database["public"]["Enums"]["incident_status"];
        };
        Update: {
          actor_api_client_id?: string | null;
          actor_kind?: string | null;
          actor_user_id?: string | null;
          actor_worker?: string | null;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["incident_status"] | null;
          id?: string;
          incident_id?: string;
          reason?: string | null;
          to_status?: Database["public"]["Enums"]["incident_status"];
        };
        Relationships: [
          {
            foreignKeyName: "incident_status_events_actor_api_client_id_fkey";
            columns: ["actor_api_client_id"];
            isOneToOne: false;
            referencedRelation: "tenant_api_clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incident_status_events_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incident_status_events_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "incidents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incident_status_events_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["incident_id"];
          },
        ];
      };
      incidents: {
        Row: {
          bankid_verified: boolean;
          case_number: string | null;
          created_at: string;
          created_by_api_client_id: string | null;
          created_by_user_id: string | null;
          customer_user_id: string;
          damage_type: Database["public"]["Enums"]["damage_type"] | null;
          description: string | null;
          id: string;
          insurance_company_id: string | null;
          is_drivable: boolean | null;
          needs_tow: boolean | null;
          occurred_at: string | null;
          problem_type: Database["public"]["Enums"]["tow_problem_type"] | null;
          requires_bankid: boolean;
          status: Database["public"]["Enums"]["incident_status"];
          tenant_id: string;
          type: Database["public"]["Enums"]["incident_type"];
          updated_at: string;
          vehicle_id: string | null;
        };
        Insert: {
          bankid_verified?: boolean;
          case_number?: string | null;
          created_at?: string;
          created_by_api_client_id?: string | null;
          created_by_user_id?: string | null;
          customer_user_id: string;
          damage_type?: Database["public"]["Enums"]["damage_type"] | null;
          description?: string | null;
          id?: string;
          insurance_company_id?: string | null;
          is_drivable?: boolean | null;
          needs_tow?: boolean | null;
          occurred_at?: string | null;
          problem_type?: Database["public"]["Enums"]["tow_problem_type"] | null;
          requires_bankid?: boolean;
          status?: Database["public"]["Enums"]["incident_status"];
          tenant_id: string;
          type: Database["public"]["Enums"]["incident_type"];
          updated_at?: string;
          vehicle_id?: string | null;
        };
        Update: {
          bankid_verified?: boolean;
          case_number?: string | null;
          created_at?: string;
          created_by_api_client_id?: string | null;
          created_by_user_id?: string | null;
          customer_user_id?: string;
          damage_type?: Database["public"]["Enums"]["damage_type"] | null;
          description?: string | null;
          id?: string;
          insurance_company_id?: string | null;
          is_drivable?: boolean | null;
          needs_tow?: boolean | null;
          occurred_at?: string | null;
          problem_type?: Database["public"]["Enums"]["tow_problem_type"] | null;
          requires_bankid?: boolean;
          status?: Database["public"]["Enums"]["incident_status"];
          tenant_id?: string;
          type?: Database["public"]["Enums"]["incident_type"];
          updated_at?: string;
          vehicle_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "incidents_created_by_api_client_id_fkey";
            columns: ["created_by_api_client_id"];
            isOneToOne: false;
            referencedRelation: "tenant_api_clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incidents_created_by_user_id_fkey";
            columns: ["created_by_user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incidents_customer_user_id_fkey";
            columns: ["customer_user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incidents_insurance_company_id_fkey";
            columns: ["insurance_company_id"];
            isOneToOne: false;
            referencedRelation: "insurance_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incidents_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "incidents_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "incidents_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incidents_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      insurance_claims: {
        Row: {
          claim_number: string | null;
          created_at: string;
          id: string;
          incident_id: string | null;
          status: Database["public"]["Enums"]["claim_status"];
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          claim_number?: string | null;
          created_at?: string;
          id?: string;
          incident_id?: string | null;
          status?: Database["public"]["Enums"]["claim_status"];
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          claim_number?: string | null;
          created_at?: string;
          id?: string;
          incident_id?: string | null;
          status?: Database["public"]["Enums"]["claim_status"];
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fk_claims_incident";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "incidents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_claims_incident";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["incident_id"];
          },
          {
            foreignKeyName: "insurance_claims_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "insurance_claims_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "insurance_claims_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      insurance_companies: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          name: string;
          tenant_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name: string;
          tenant_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "insurance_companies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "insurance_companies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "insurance_companies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      integration_requests: {
        Row: {
          created_at: string;
          endpoint: string;
          id: string;
          idempotency_key: string | null;
          payload: Json | null;
          provider: string;
          request_id: string;
          tenant_id: string | null;
        };
        Insert: {
          created_at?: string;
          endpoint: string;
          id?: string;
          idempotency_key?: string | null;
          payload?: Json | null;
          provider: string;
          request_id: string;
          tenant_id?: string | null;
        };
        Update: {
          created_at?: string;
          endpoint?: string;
          id?: string;
          idempotency_key?: string | null;
          payload?: Json | null;
          provider?: string;
          request_id?: string;
          tenant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "integration_requests_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "integration_requests_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "integration_requests_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      integration_responses: {
        Row: {
          created_at: string;
          id: string;
          payload: Json | null;
          request_id: string;
          status_code: number | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          payload?: Json | null;
          request_id: string;
          status_code?: number | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          payload?: Json | null;
          request_id?: string;
          status_code?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "integration_responses_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "integration_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      manual_reviews: {
        Row: {
          assigned_to_user_id: string | null;
          created_at: string;
          created_by_api_client_id: string | null;
          created_by_kind: string;
          created_by_user_id: string | null;
          created_by_worker: string | null;
          id: string;
          incident_id: string | null;
          reason: string;
          resolved_at: string | null;
          resolved_by_user_id: string | null;
          status: string;
          tenant_id: string;
          tow_job_id: string | null;
        };
        Insert: {
          assigned_to_user_id?: string | null;
          created_at?: string;
          created_by_api_client_id?: string | null;
          created_by_kind?: string;
          created_by_user_id?: string | null;
          created_by_worker?: string | null;
          id?: string;
          incident_id?: string | null;
          reason: string;
          resolved_at?: string | null;
          resolved_by_user_id?: string | null;
          status?: string;
          tenant_id: string;
          tow_job_id?: string | null;
        };
        Update: {
          assigned_to_user_id?: string | null;
          created_at?: string;
          created_by_api_client_id?: string | null;
          created_by_kind?: string;
          created_by_user_id?: string | null;
          created_by_worker?: string | null;
          id?: string;
          incident_id?: string | null;
          reason?: string;
          resolved_at?: string | null;
          resolved_by_user_id?: string | null;
          status?: string;
          tenant_id?: string;
          tow_job_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "manual_reviews_assigned_to_user_id_fkey";
            columns: ["assigned_to_user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "manual_reviews_created_by_api_client_id_fkey";
            columns: ["created_by_api_client_id"];
            isOneToOne: false;
            referencedRelation: "tenant_api_clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "manual_reviews_created_by_user_id_fkey";
            columns: ["created_by_user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "manual_reviews_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "incidents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "manual_reviews_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["incident_id"];
          },
          {
            foreignKeyName: "manual_reviews_resolved_by_user_id_fkey";
            columns: ["resolved_by_user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "manual_reviews_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "manual_reviews_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "manual_reviews_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "manual_reviews_tow_job_id_fkey";
            columns: ["tow_job_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["tow_job_id"];
          },
          {
            foreignKeyName: "manual_reviews_tow_job_id_fkey";
            columns: ["tow_job_id"];
            isOneToOne: false;
            referencedRelation: "tow_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_deliveries: {
        Row: {
          attempts: number;
          channel: string;
          claim_token: string | null;
          claimed_by: string | null;
          created_at: string;
          dedupe_key: string | null;
          error: string | null;
          first_attempt_at: string | null;
          id: string;
          incident_id: string | null;
          last_error: string | null;
          lease_until: string | null;
          next_attempt_at: string | null;
          payload: Json | null;
          provider: string;
          provider_message_id: string | null;
          provider_request: Json | null;
          sent_at: string | null;
          status: string;
          subject: string | null;
          tenant_id: string | null;
          to_address: string;
          tow_job_id: string | null;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          channel: string;
          claim_token?: string | null;
          claimed_by?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          error?: string | null;
          first_attempt_at?: string | null;
          id?: string;
          incident_id?: string | null;
          last_error?: string | null;
          lease_until?: string | null;
          next_attempt_at?: string | null;
          payload?: Json | null;
          provider: string;
          provider_message_id?: string | null;
          provider_request?: Json | null;
          sent_at?: string | null;
          status?: string;
          subject?: string | null;
          tenant_id?: string | null;
          to_address: string;
          tow_job_id?: string | null;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          channel?: string;
          claim_token?: string | null;
          claimed_by?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          error?: string | null;
          first_attempt_at?: string | null;
          id?: string;
          incident_id?: string | null;
          last_error?: string | null;
          lease_until?: string | null;
          next_attempt_at?: string | null;
          payload?: Json | null;
          provider?: string;
          provider_message_id?: string | null;
          provider_request?: Json | null;
          sent_at?: string | null;
          status?: string;
          subject?: string | null;
          tenant_id?: string | null;
          to_address?: string;
          tow_job_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "incidents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_deliveries_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["incident_id"];
          },
          {
            foreignKeyName: "notification_deliveries_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "notification_deliveries_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "notification_deliveries_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_deliveries_tow_job_id_fkey";
            columns: ["tow_job_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["tow_job_id"];
          },
          {
            foreignKeyName: "notification_deliveries_tow_job_id_fkey";
            columns: ["tow_job_id"];
            isOneToOne: false;
            referencedRelation: "tow_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      one_time_secret_reveals: {
        Row: {
          consumed_at: string | null;
          created_at: string;
          created_by: string | null;
          expires_at: string;
          id: string;
          kind: string;
          secret_value: string;
          tenant_id: string;
          token_hash: string;
        };
        Insert: {
          consumed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          id?: string;
          kind: string;
          secret_value: string;
          tenant_id: string;
          token_hash: string;
        };
        Update: {
          consumed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          id?: string;
          kind?: string;
          secret_value?: string;
          tenant_id?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "one_time_secret_reveals_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "one_time_secret_reveals_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "one_time_secret_reveals_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "one_time_secret_reveals_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      operational_notification_queue: {
        Row: {
          attempts: number;
          channel: string;
          claim_token: string | null;
          claimed_by: string | null;
          created_at: string;
          driver_id: string | null;
          first_attempt_at: string | null;
          id: string;
          last_error: string | null;
          lease_until: string | null;
          next_attempt_at: string;
          offer_id: string | null;
          payload: NonNullable<Json>;
          provider_request: Json | null;
          recipient: string;
          status: string;
          template_key: string;
          tenant_id: string | null;
          tow_job_id: string | null;
          tow_vehicle_id: string | null;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          channel: string;
          claim_token?: string | null;
          claimed_by?: string | null;
          created_at?: string;
          driver_id?: string | null;
          first_attempt_at?: string | null;
          id?: string;
          last_error?: string | null;
          lease_until?: string | null;
          next_attempt_at?: string;
          offer_id?: string | null;
          payload?: NonNullable<Json>;
          provider_request?: Json | null;
          recipient: string;
          status?: string;
          template_key: string;
          tenant_id?: string | null;
          tow_job_id?: string | null;
          tow_vehicle_id?: string | null;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          channel?: string;
          claim_token?: string | null;
          claimed_by?: string | null;
          created_at?: string;
          driver_id?: string | null;
          first_attempt_at?: string | null;
          id?: string;
          last_error?: string | null;
          lease_until?: string | null;
          next_attempt_at?: string;
          offer_id?: string | null;
          payload?: NonNullable<Json>;
          provider_request?: Json | null;
          recipient?: string;
          status?: string;
          template_key?: string;
          tenant_id?: string | null;
          tow_job_id?: string | null;
          tow_vehicle_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "operational_notification_queue_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "driver_performance_stats";
            referencedColumns: ["driver_id"];
          },
          {
            foreignKeyName: "operational_notification_queue_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "tow_drivers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "operational_notification_queue_offer_id_fkey";
            columns: ["offer_id"];
            isOneToOne: false;
            referencedRelation: "tow_job_offers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "operational_notification_queue_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "operational_notification_queue_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "operational_notification_queue_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "operational_notification_queue_tow_job_id_fkey";
            columns: ["tow_job_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["tow_job_id"];
          },
          {
            foreignKeyName: "operational_notification_queue_tow_job_id_fkey";
            columns: ["tow_job_id"];
            isOneToOne: false;
            referencedRelation: "tow_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "operational_notification_queue_tow_vehicle_id_fkey";
            columns: ["tow_vehicle_id"];
            isOneToOne: false;
            referencedRelation: "insurer_agreement_vehicle_matrix";
            referencedColumns: ["tow_vehicle_id"];
          },
          {
            foreignKeyName: "operational_notification_queue_tow_vehicle_id_fkey";
            columns: ["tow_vehicle_id"];
            isOneToOne: false;
            referencedRelation: "tow_vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      partner_references: {
        Row: {
          created_at: string;
          id: string;
          incident_id: string | null;
          kind: string;
          reference: string;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          incident_id?: string | null;
          kind: string;
          reference: string;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          incident_id?: string | null;
          kind?: string;
          reference?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "partner_references_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "incidents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "partner_references_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["incident_id"];
          },
          {
            foreignKeyName: "partner_references_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "partner_references_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "partner_references_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      permissions: {
        Row: {
          description: string;
          key: string;
        };
        Insert: {
          description: string;
          key: string;
        };
        Update: {
          description?: string;
          key?: string;
        };
        Relationships: [];
      };
      request_idempotency_keys: {
        Row: {
          action: string;
          created_at: string;
          id: string;
          idempotency_key: string;
          resource_id: string | null;
          response: Json | null;
          scope: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          id?: string;
          idempotency_key: string;
          resource_id?: string | null;
          response?: Json | null;
          scope: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          id?: string;
          idempotency_key?: string;
          resource_id?: string | null;
          response?: Json | null;
          scope?: string;
        };
        Relationships: [];
      };
      role_permissions: {
        Row: {
          permission_key: string;
          role_key: string;
        };
        Insert: {
          permission_key: string;
          role_key: string;
        };
        Update: {
          permission_key?: string;
          role_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey";
            columns: ["permission_key"];
            isOneToOne: false;
            referencedRelation: "permissions";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "role_permissions_role_key_fkey";
            columns: ["role_key"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["key"];
          },
        ];
      };
      roles: {
        Row: {
          description: string;
          key: string;
          tenant_type: Database["public"]["Enums"]["tenant_type"] | null;
        };
        Insert: {
          description: string;
          key: string;
          tenant_type?: Database["public"]["Enums"]["tenant_type"] | null;
        };
        Update: {
          description?: string;
          key?: string;
          tenant_type?: Database["public"]["Enums"]["tenant_type"] | null;
        };
        Relationships: [];
      };
      security_events: {
        Row: {
          created_at: string;
          detail: string | null;
          id: string;
          kind: string;
          severity: string;
          tenant_id: string | null;
        };
        Insert: {
          created_at?: string;
          detail?: string | null;
          id?: string;
          kind: string;
          severity?: string;
          tenant_id?: string | null;
        };
        Update: {
          created_at?: string;
          detail?: string | null;
          id?: string;
          kind?: string;
          severity?: string;
          tenant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "security_events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "security_events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "security_events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      signed_payloads: {
        Row: {
          created_at: string;
          id: string;
          signed_payload_hash: string;
          tenant_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          signed_payload_hash: string;
          tenant_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          signed_payload_hash?: string;
          tenant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "signed_payloads_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "signed_payloads_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "signed_payloads_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      spatial_ref_sys: {
        Row: {
          auth_name: string | null;
          auth_srid: number | null;
          proj4text: string | null;
          srid: number;
          srtext: string | null;
        };
        Insert: {
          auth_name?: string | null;
          auth_srid?: number | null;
          proj4text?: string | null;
          srid: number;
          srtext?: string | null;
        };
        Update: {
          auth_name?: string | null;
          auth_srid?: number | null;
          proj4text?: string | null;
          srid?: number;
          srtext?: string | null;
        };
        Relationships: [];
      };
      tenant_api_clients: {
        Row: {
          active: boolean;
          api_key_hash: string;
          created_at: string;
          created_by_user_id: string | null;
          id: string;
          key_last4: string;
          last_used_at: string | null;
          name: string;
          scopes: string[];
          tenant_id: string;
        };
        Insert: {
          active?: boolean;
          api_key_hash: string;
          created_at?: string;
          created_by_user_id?: string | null;
          id?: string;
          key_last4: string;
          last_used_at?: string | null;
          name: string;
          scopes?: string[];
          tenant_id: string;
        };
        Update: {
          active?: boolean;
          api_key_hash?: string;
          created_at?: string;
          created_by_user_id?: string | null;
          id?: string;
          key_last4?: string;
          last_used_at?: string | null;
          name?: string;
          scopes?: string[];
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_api_clients_created_by_user_id_fkey";
            columns: ["created_by_user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_api_clients_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_api_clients_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_api_clients_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_assets: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          storage_path: string;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          storage_path: string;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          storage_path?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_assets_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_assets_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_assets_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_billing_plans: {
        Row: {
          active: boolean;
          case_fee_minor: number;
          created_at: string;
          currency: string;
          id: string;
          monthly_license_minor: number;
          plan_key: string;
          signing_fee_minor: number;
          tenant_id: string;
          tow_job_fee_minor: number;
        };
        Insert: {
          active?: boolean;
          case_fee_minor?: number;
          created_at?: string;
          currency?: string;
          id?: string;
          monthly_license_minor?: number;
          plan_key: string;
          signing_fee_minor?: number;
          tenant_id: string;
          tow_job_fee_minor?: number;
        };
        Update: {
          active?: boolean;
          case_fee_minor?: number;
          created_at?: string;
          currency?: string;
          id?: string;
          monthly_license_minor?: number;
          plan_key?: string;
          signing_fee_minor?: number;
          tenant_id?: string;
          tow_job_fee_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_billing_plans_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_billing_plans_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_billing_plans_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_branding: {
        Row: {
          favicon_url: string | null;
          logo_dark_url: string | null;
          logo_url: string | null;
          product_name: string | null;
          support_email: string | null;
          support_phone: string | null;
          support_url: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          favicon_url?: string | null;
          logo_dark_url?: string | null;
          logo_url?: string | null;
          product_name?: string | null;
          support_email?: string | null;
          support_phone?: string | null;
          support_url?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          favicon_url?: string | null;
          logo_dark_url?: string | null;
          logo_url?: string | null;
          product_name?: string | null;
          support_email?: string | null;
          support_phone?: string | null;
          support_url?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_branding_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_branding_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_branding_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_domains: {
        Row: {
          created_at: string;
          domain: string;
          id: string;
          is_primary: boolean;
          tenant_id: string;
          verified: boolean;
        };
        Insert: {
          created_at?: string;
          domain: string;
          id?: string;
          is_primary?: boolean;
          tenant_id: string;
          verified?: boolean;
        };
        Update: {
          created_at?: string;
          domain?: string;
          id?: string;
          is_primary?: boolean;
          tenant_id?: string;
          verified?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_domains_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_domains_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_domains_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_feature_flags: {
        Row: {
          damage_claims_enabled: boolean;
          marketplace_enabled: boolean;
          realtime_tracking_enabled: boolean;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          damage_claims_enabled?: boolean;
          marketplace_enabled?: boolean;
          realtime_tracking_enabled?: boolean;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          damage_claims_enabled?: boolean;
          marketplace_enabled?: boolean;
          realtime_tracking_enabled?: boolean;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_feature_flags_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_feature_flags_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_feature_flags_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_legal_text_versions: {
        Row: {
          active_from: string | null;
          active_to: string | null;
          body: string;
          created_at: string;
          created_by: string | null;
          id: string;
          kind: string;
          locale: string;
          status: string;
          tenant_id: string;
          title: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          active_from?: string | null;
          active_to?: string | null;
          body: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          kind: string;
          locale?: string;
          status?: string;
          tenant_id: string;
          title: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          active_from?: string | null;
          active_to?: string | null;
          body?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          kind?: string;
          locale?: string;
          status?: string;
          tenant_id?: string;
          title?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_legal_text_versions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_legal_text_versions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_legal_text_versions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_legal_text_versions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_legal_texts: {
        Row: {
          id: string;
          locale: string;
          privacy_policy: string | null;
          tenant_id: string;
          terms_of_service: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          locale?: string;
          privacy_policy?: string | null;
          tenant_id: string;
          terms_of_service?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          locale?: string;
          privacy_policy?: string | null;
          tenant_id?: string;
          terms_of_service?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_legal_texts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_legal_texts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_legal_texts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_notification_fallback_rules: {
        Row: {
          created_at: string;
          enabled: boolean;
          expose_sensitive_data_in_sms: boolean;
          id: string;
          insurance_next_wave_radius_km: number;
          job_scope: string;
          manual_review_after_minutes: number;
          operational_contacts: NonNullable<Json>;
          private_wave_radius_km: number;
          push_max_attempts: number;
          push_timeout_seconds: number;
          sms_fallback_enabled: boolean;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean;
          expose_sensitive_data_in_sms?: boolean;
          id?: string;
          insurance_next_wave_radius_km?: number;
          job_scope?: string;
          manual_review_after_minutes?: number;
          operational_contacts?: NonNullable<Json>;
          private_wave_radius_km?: number;
          push_max_attempts?: number;
          push_timeout_seconds?: number;
          sms_fallback_enabled?: boolean;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          expose_sensitive_data_in_sms?: boolean;
          id?: string;
          insurance_next_wave_radius_km?: number;
          job_scope?: string;
          manual_review_after_minutes?: number;
          operational_contacts?: NonNullable<Json>;
          private_wave_radius_km?: number;
          push_max_attempts?: number;
          push_timeout_seconds?: number;
          sms_fallback_enabled?: boolean;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_notification_fallback_rules_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_notification_fallback_rules_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_notification_fallback_rules_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_notification_templates: {
        Row: {
          body: string;
          channel: string;
          id: string;
          locale: string;
          subject: string | null;
          template_key: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          body: string;
          channel: string;
          id?: string;
          locale?: string;
          subject?: string | null;
          template_key: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          channel?: string;
          id?: string;
          locale?: string;
          subject?: string | null;
          template_key?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_notification_templates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_notification_templates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_notification_templates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_settings: {
        Row: {
          allow_marketplace_fallback: boolean;
          bankid_required_for_claims: boolean;
          bankid_required_for_tow: boolean;
          default_dispatch_strategy: string;
          eta_refresh_seconds: number;
          max_dispatch_candidates: number;
          max_dispatch_radius_km: number;
          max_insurance_broadcast_candidates: number;
          offer_expiry_seconds: number;
          private_dispatch_wave_radius_km: number;
          stats_admin_hourly_cost_minor: number;
          stats_minutes_saved_per_case: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          allow_marketplace_fallback?: boolean;
          bankid_required_for_claims?: boolean;
          bankid_required_for_tow?: boolean;
          default_dispatch_strategy?: string;
          eta_refresh_seconds?: number;
          max_dispatch_candidates?: number;
          max_dispatch_radius_km?: number;
          max_insurance_broadcast_candidates?: number;
          offer_expiry_seconds?: number;
          private_dispatch_wave_radius_km?: number;
          stats_admin_hourly_cost_minor?: number;
          stats_minutes_saved_per_case?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          allow_marketplace_fallback?: boolean;
          bankid_required_for_claims?: boolean;
          bankid_required_for_tow?: boolean;
          default_dispatch_strategy?: string;
          eta_refresh_seconds?: number;
          max_dispatch_candidates?: number;
          max_dispatch_radius_km?: number;
          max_insurance_broadcast_candidates?: number;
          offer_expiry_seconds?: number;
          private_dispatch_wave_radius_km?: number;
          stats_admin_hourly_cost_minor?: number;
          stats_minutes_saved_per_case?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_theme_tokens: {
        Row: {
          color_background: string;
          color_danger: string;
          color_on_primary: string;
          color_primary: string;
          color_secondary: string;
          color_success: string;
          color_surface: string;
          color_text: string;
          font_family: string;
          radius_base: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          color_background?: string;
          color_danger?: string;
          color_on_primary?: string;
          color_primary?: string;
          color_secondary?: string;
          color_success?: string;
          color_surface?: string;
          color_text?: string;
          font_family?: string;
          radius_base?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          color_background?: string;
          color_danger?: string;
          color_on_primary?: string;
          color_primary?: string;
          color_secondary?: string;
          color_success?: string;
          color_surface?: string;
          color_text?: string;
          font_family?: string;
          radius_base?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_theme_tokens_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_theme_tokens_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_theme_tokens_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_users: {
        Row: {
          created_at: string;
          id: string;
          status: Database["public"]["Enums"]["tenant_user_status"];
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          status?: Database["public"]["Enums"]["tenant_user_status"];
          tenant_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          status?: Database["public"]["Enums"]["tenant_user_status"];
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_users_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_users_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_users_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_users_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_webhooks: {
        Row: {
          active: boolean;
          created_at: string;
          created_by_user_id: string | null;
          events: string[];
          id: string;
          secret: string;
          tenant_id: string;
          url: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by_user_id?: string | null;
          events?: string[];
          id?: string;
          secret: string;
          tenant_id: string;
          url: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by_user_id?: string | null;
          events?: string[];
          id?: string;
          secret?: string;
          tenant_id?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_webhooks_created_by_user_id_fkey";
            columns: ["created_by_user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_webhooks_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_webhooks_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tenant_webhooks_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenants: {
        Row: {
          case_number_prefix: string;
          created_at: string;
          id: string;
          name: string;
          private_marketplace_operator: boolean;
          slug: string;
          status: Database["public"]["Enums"]["tenant_status"];
          type: Database["public"]["Enums"]["tenant_type"];
          updated_at: string;
        };
        Insert: {
          case_number_prefix: string;
          created_at?: string;
          id?: string;
          name: string;
          private_marketplace_operator?: boolean;
          slug: string;
          status?: Database["public"]["Enums"]["tenant_status"];
          type: Database["public"]["Enums"]["tenant_type"];
          updated_at?: string;
        };
        Update: {
          case_number_prefix?: string;
          created_at?: string;
          id?: string;
          name?: string;
          private_marketplace_operator?: boolean;
          slug?: string;
          status?: Database["public"]["Enums"]["tenant_status"];
          type?: Database["public"]["Enums"]["tenant_type"];
          updated_at?: string;
        };
        Relationships: [];
      };
      tow_availability_windows: {
        Row: {
          end_minute: number;
          id: string;
          on_call: boolean;
          start_minute: number;
          tenant_id: string;
          tow_company_id: string;
          weekday: number;
        };
        Insert: {
          end_minute: number;
          id?: string;
          on_call?: boolean;
          start_minute: number;
          tenant_id: string;
          tow_company_id: string;
          weekday: number;
        };
        Update: {
          end_minute?: number;
          id?: string;
          on_call?: boolean;
          start_minute?: number;
          tenant_id?: string;
          tow_company_id?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tow_availability_windows_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_availability_windows_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_availability_windows_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_availability_windows_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_availability_windows_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_dashboard_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_availability_windows_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_performance_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_availability_windows_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_production_readiness";
            referencedColumns: ["tow_company_id"];
          },
        ];
      };
      tow_companies: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          name: string;
          tenant_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name: string;
          tenant_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tow_companies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_companies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_companies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tow_company_insurance_agreements: {
        Row: {
          active_from: string | null;
          active_to: string | null;
          coverage_area: NonNullable<Json>;
          created_at: string;
          decided_by_user_id: string | null;
          id: string;
          insurance_tenant_id: string;
          pricing_model: string;
          priority: number;
          requested_by_user_id: string | null;
          sla_minutes: number;
          status: string;
          tow_company_id: string;
          updated_at: string;
        };
        Insert: {
          active_from?: string | null;
          active_to?: string | null;
          coverage_area?: NonNullable<Json>;
          created_at?: string;
          decided_by_user_id?: string | null;
          id?: string;
          insurance_tenant_id: string;
          pricing_model?: string;
          priority?: number;
          requested_by_user_id?: string | null;
          sla_minutes?: number;
          status?: string;
          tow_company_id: string;
          updated_at?: string;
        };
        Update: {
          active_from?: string | null;
          active_to?: string | null;
          coverage_area?: NonNullable<Json>;
          created_at?: string;
          decided_by_user_id?: string | null;
          id?: string;
          insurance_tenant_id?: string;
          pricing_model?: string;
          priority?: number;
          requested_by_user_id?: string | null;
          sla_minutes?: number;
          status?: string;
          tow_company_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tow_company_insurance_agreements_decided_by_user_id_fkey";
            columns: ["decided_by_user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_company_insurance_agreements_insurance_tenant_id_fkey";
            columns: ["insurance_tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_company_insurance_agreements_insurance_tenant_id_fkey";
            columns: ["insurance_tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_company_insurance_agreements_insurance_tenant_id_fkey";
            columns: ["insurance_tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_company_insurance_agreements_requested_by_user_id_fkey";
            columns: ["requested_by_user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_company_insurance_agreements_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_company_insurance_agreements_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_dashboard_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_company_insurance_agreements_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_performance_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_company_insurance_agreements_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_production_readiness";
            referencedColumns: ["tow_company_id"];
          },
        ];
      };
      tow_company_marketplace_settings: {
        Row: {
          accepts_direct_orders: boolean;
          active: boolean;
          coverage_area: NonNullable<Json>;
          created_at: string;
          currency: string;
          id: string;
          min_price_minor: number;
          private_customer_enabled: boolean;
          tow_company_id: string;
          updated_at: string;
        };
        Insert: {
          accepts_direct_orders?: boolean;
          active?: boolean;
          coverage_area?: NonNullable<Json>;
          created_at?: string;
          currency?: string;
          id?: string;
          min_price_minor?: number;
          private_customer_enabled?: boolean;
          tow_company_id: string;
          updated_at?: string;
        };
        Update: {
          accepts_direct_orders?: boolean;
          active?: boolean;
          coverage_area?: NonNullable<Json>;
          created_at?: string;
          currency?: string;
          id?: string;
          min_price_minor?: number;
          private_customer_enabled?: boolean;
          tow_company_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tow_company_marketplace_settings_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: true;
            referencedRelation: "tow_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_company_marketplace_settings_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: true;
            referencedRelation: "tow_company_dashboard_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_company_marketplace_settings_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: true;
            referencedRelation: "tow_company_performance_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_company_marketplace_settings_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: true;
            referencedRelation: "tow_company_production_readiness";
            referencedColumns: ["tow_company_id"];
          },
        ];
      };
      tow_company_users: {
        Row: {
          created_at: string;
          id: string;
          tenant_id: string;
          tow_company_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          tenant_id: string;
          tow_company_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          tenant_id?: string;
          tow_company_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tow_company_users_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_company_users_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_company_users_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_company_users_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_company_users_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_dashboard_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_company_users_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_performance_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_company_users_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_production_readiness";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_company_users_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      tow_drivers: {
        Row: {
          accept_rate: number | null;
          bankid_verified: boolean;
          created_at: string;
          created_by_user_id: string | null;
          current_vehicle_id: string | null;
          duty_status: Database["public"]["Enums"]["duty_status"];
          email: string | null;
          full_name: string;
          id: string;
          is_online: boolean;
          languages: string[];
          last_lat: number | null;
          last_lng: number | null;
          last_location: unknown;
          last_seen_at: string | null;
          license_classes: string[];
          phone: string | null;
          rating: number | null;
          status: string;
          tenant_id: string;
          tow_company_id: string;
          updated_at: string;
          user_id: string | null;
          zone: string | null;
        };
        Insert: {
          accept_rate?: number | null;
          bankid_verified?: boolean;
          created_at?: string;
          created_by_user_id?: string | null;
          current_vehicle_id?: string | null;
          duty_status?: Database["public"]["Enums"]["duty_status"];
          email?: string | null;
          full_name: string;
          id?: string;
          is_online?: boolean;
          languages?: string[];
          last_lat?: number | null;
          last_lng?: number | null;
          last_location?: unknown;
          last_seen_at?: string | null;
          license_classes?: string[];
          phone?: string | null;
          rating?: number | null;
          status?: string;
          tenant_id: string;
          tow_company_id: string;
          updated_at?: string;
          user_id?: string | null;
          zone?: string | null;
        };
        Update: {
          accept_rate?: number | null;
          bankid_verified?: boolean;
          created_at?: string;
          created_by_user_id?: string | null;
          current_vehicle_id?: string | null;
          duty_status?: Database["public"]["Enums"]["duty_status"];
          email?: string | null;
          full_name?: string;
          id?: string;
          is_online?: boolean;
          languages?: string[];
          last_lat?: number | null;
          last_lng?: number | null;
          last_location?: unknown;
          last_seen_at?: string | null;
          license_classes?: string[];
          phone?: string | null;
          rating?: number | null;
          status?: string;
          tenant_id?: string;
          tow_company_id?: string;
          updated_at?: string;
          user_id?: string | null;
          zone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fk_driver_current_vehicle";
            columns: ["current_vehicle_id"];
            isOneToOne: false;
            referencedRelation: "insurer_agreement_vehicle_matrix";
            referencedColumns: ["tow_vehicle_id"];
          },
          {
            foreignKeyName: "fk_driver_current_vehicle";
            columns: ["current_vehicle_id"];
            isOneToOne: false;
            referencedRelation: "tow_vehicles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_drivers_created_by_user_id_fkey";
            columns: ["created_by_user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_drivers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_drivers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_drivers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_drivers_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_drivers_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_dashboard_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_drivers_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_performance_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_drivers_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_production_readiness";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_drivers_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      tow_job_assignments: {
        Row: {
          assigned_at: string;
          driver_id: string;
          id: string;
          tenant_id: string;
          tow_company_id: string;
          tow_job_id: string;
        };
        Insert: {
          assigned_at?: string;
          driver_id: string;
          id?: string;
          tenant_id: string;
          tow_company_id: string;
          tow_job_id: string;
        };
        Update: {
          assigned_at?: string;
          driver_id?: string;
          id?: string;
          tenant_id?: string;
          tow_company_id?: string;
          tow_job_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tow_job_assignments_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "driver_performance_stats";
            referencedColumns: ["driver_id"];
          },
          {
            foreignKeyName: "tow_job_assignments_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "tow_drivers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_job_assignments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_job_assignments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_job_assignments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_job_assignments_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_job_assignments_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_dashboard_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_job_assignments_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_performance_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_job_assignments_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_production_readiness";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_job_assignments_tow_job_id_fkey";
            columns: ["tow_job_id"];
            isOneToOne: true;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["tow_job_id"];
          },
          {
            foreignKeyName: "tow_job_assignments_tow_job_id_fkey";
            columns: ["tow_job_id"];
            isOneToOne: true;
            referencedRelation: "tow_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      tow_job_completion_reports: {
        Row: {
          comments: string | null;
          created_at: string;
          customer_signed: boolean;
          destination: string | null;
          driver_id: string;
          extra_cost_minor: number | null;
          failed_trip: boolean;
          id: string;
          observed_damages: string | null;
          tenant_id: string;
          tow_job_id: string;
          vehicle_picked_up: boolean;
          waiting_minutes: number;
          work_performed: string;
        };
        Insert: {
          comments?: string | null;
          created_at?: string;
          customer_signed?: boolean;
          destination?: string | null;
          driver_id: string;
          extra_cost_minor?: number | null;
          failed_trip?: boolean;
          id?: string;
          observed_damages?: string | null;
          tenant_id: string;
          tow_job_id: string;
          vehicle_picked_up: boolean;
          waiting_minutes?: number;
          work_performed: string;
        };
        Update: {
          comments?: string | null;
          created_at?: string;
          customer_signed?: boolean;
          destination?: string | null;
          driver_id?: string;
          extra_cost_minor?: number | null;
          failed_trip?: boolean;
          id?: string;
          observed_damages?: string | null;
          tenant_id?: string;
          tow_job_id?: string;
          vehicle_picked_up?: boolean;
          waiting_minutes?: number;
          work_performed?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tow_job_completion_reports_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "driver_performance_stats";
            referencedColumns: ["driver_id"];
          },
          {
            foreignKeyName: "tow_job_completion_reports_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "tow_drivers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_job_completion_reports_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_job_completion_reports_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_job_completion_reports_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_job_completion_reports_tow_job_id_fkey";
            columns: ["tow_job_id"];
            isOneToOne: true;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["tow_job_id"];
          },
          {
            foreignKeyName: "tow_job_completion_reports_tow_job_id_fkey";
            columns: ["tow_job_id"];
            isOneToOne: true;
            referencedRelation: "tow_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      tow_job_customer_shares: {
        Row: {
          created_at: string;
          customer_email: string | null;
          customer_name: string;
          customer_notes: string | null;
          customer_phone: string;
          destination_address: string | null;
          driver_id: string;
          id: string;
          pickup_address: string | null;
          pickup_lat: number;
          pickup_lng: number;
          problem_summary: string;
          reason: string;
          registration_number: string;
          shared_fields: string[];
          tenant_id: string;
          tow_job_id: string;
        };
        Insert: {
          created_at?: string;
          customer_email?: string | null;
          customer_name: string;
          customer_notes?: string | null;
          customer_phone: string;
          destination_address?: string | null;
          driver_id: string;
          id?: string;
          pickup_address?: string | null;
          pickup_lat: number;
          pickup_lng: number;
          problem_summary: string;
          reason: string;
          registration_number: string;
          shared_fields: string[];
          tenant_id: string;
          tow_job_id: string;
        };
        Update: {
          created_at?: string;
          customer_email?: string | null;
          customer_name?: string;
          customer_notes?: string | null;
          customer_phone?: string;
          destination_address?: string | null;
          driver_id?: string;
          id?: string;
          pickup_address?: string | null;
          pickup_lat?: number;
          pickup_lng?: number;
          problem_summary?: string;
          reason?: string;
          registration_number?: string;
          shared_fields?: string[];
          tenant_id?: string;
          tow_job_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tow_job_customer_shares_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "driver_performance_stats";
            referencedColumns: ["driver_id"];
          },
          {
            foreignKeyName: "tow_job_customer_shares_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "tow_drivers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_job_customer_shares_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_job_customer_shares_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_job_customer_shares_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_job_customer_shares_tow_job_id_fkey";
            columns: ["tow_job_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["tow_job_id"];
          },
          {
            foreignKeyName: "tow_job_customer_shares_tow_job_id_fkey";
            columns: ["tow_job_id"];
            isOneToOne: false;
            referencedRelation: "tow_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      tow_job_eta_snapshots: {
        Row: {
          created_at: string;
          degraded: boolean;
          distance_meters: number;
          driver_id: string | null;
          eta_seconds: number;
          id: string;
          source: string;
          tow_job_id: string;
        };
        Insert: {
          created_at?: string;
          degraded?: boolean;
          distance_meters: number;
          driver_id?: string | null;
          eta_seconds: number;
          id?: string;
          source: string;
          tow_job_id: string;
        };
        Update: {
          created_at?: string;
          degraded?: boolean;
          distance_meters?: number;
          driver_id?: string | null;
          eta_seconds?: number;
          id?: string;
          source?: string;
          tow_job_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tow_job_eta_snapshots_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "driver_performance_stats";
            referencedColumns: ["driver_id"];
          },
          {
            foreignKeyName: "tow_job_eta_snapshots_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "tow_drivers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_job_eta_snapshots_tow_job_id_fkey";
            columns: ["tow_job_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["tow_job_id"];
          },
          {
            foreignKeyName: "tow_job_eta_snapshots_tow_job_id_fkey";
            columns: ["tow_job_id"];
            isOneToOne: false;
            referencedRelation: "tow_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      tow_job_evidence: {
        Row: {
          content_type: string;
          created_at: string;
          driver_id: string | null;
          id: string;
          phase: string;
          storage_path: string;
          tenant_id: string;
          tow_job_id: string;
        };
        Insert: {
          content_type: string;
          created_at?: string;
          driver_id?: string | null;
          id?: string;
          phase?: string;
          storage_path: string;
          tenant_id: string;
          tow_job_id: string;
        };
        Update: {
          content_type?: string;
          created_at?: string;
          driver_id?: string | null;
          id?: string;
          phase?: string;
          storage_path?: string;
          tenant_id?: string;
          tow_job_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tow_job_evidence_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "driver_performance_stats";
            referencedColumns: ["driver_id"];
          },
          {
            foreignKeyName: "tow_job_evidence_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "tow_drivers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_job_evidence_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_job_evidence_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_job_evidence_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_job_evidence_tow_job_id_fkey";
            columns: ["tow_job_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["tow_job_id"];
          },
          {
            foreignKeyName: "tow_job_evidence_tow_job_id_fkey";
            columns: ["tow_job_id"];
            isOneToOne: false;
            referencedRelation: "tow_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      tow_job_invoices: {
        Row: {
          created_at: string;
          currency: string;
          id: string;
          lines: NonNullable<Json>;
          payer_type: string;
          status: string;
          subtotal_minor: number;
          tenant_id: string;
          total_minor: number;
          tow_job_id: string;
          vat_minor: number;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          id?: string;
          lines?: NonNullable<Json>;
          payer_type: string;
          status?: string;
          subtotal_minor?: number;
          tenant_id: string;
          total_minor?: number;
          tow_job_id: string;
          vat_minor?: number;
        };
        Update: {
          created_at?: string;
          currency?: string;
          id?: string;
          lines?: NonNullable<Json>;
          payer_type?: string;
          status?: string;
          subtotal_minor?: number;
          tenant_id?: string;
          total_minor?: number;
          tow_job_id?: string;
          vat_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tow_job_invoices_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_job_invoices_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_job_invoices_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_job_invoices_tow_job_id_fkey";
            columns: ["tow_job_id"];
            isOneToOne: true;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["tow_job_id"];
          },
          {
            foreignKeyName: "tow_job_invoices_tow_job_id_fkey";
            columns: ["tow_job_id"];
            isOneToOne: true;
            referencedRelation: "tow_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      tow_job_offers: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          distance_meters: number | null;
          driver_id: string;
          eta_seconds: number | null;
          expires_at: string;
          id: string;
          offered_at: string;
          push_attempts: number;
          push_error: string | null;
          push_sent_at: string | null;
          push_status: string;
          rank: number;
          rejected_at: string | null;
          rejection_reason: string | null;
          status: Database["public"]["Enums"]["offer_status"];
          tenant_id: string;
          tow_company_id: string;
          tow_job_id: string;
          tow_vehicle_id: string | null;
          updated_at: string;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          distance_meters?: number | null;
          driver_id: string;
          eta_seconds?: number | null;
          expires_at: string;
          id?: string;
          offered_at?: string;
          push_attempts?: number;
          push_error?: string | null;
          push_sent_at?: string | null;
          push_status?: string;
          rank?: number;
          rejected_at?: string | null;
          rejection_reason?: string | null;
          status?: Database["public"]["Enums"]["offer_status"];
          tenant_id: string;
          tow_company_id: string;
          tow_job_id: string;
          tow_vehicle_id?: string | null;
          updated_at?: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          distance_meters?: number | null;
          driver_id?: string;
          eta_seconds?: number | null;
          expires_at?: string;
          id?: string;
          offered_at?: string;
          push_attempts?: number;
          push_error?: string | null;
          push_sent_at?: string | null;
          push_status?: string;
          rank?: number;
          rejected_at?: string | null;
          rejection_reason?: string | null;
          status?: Database["public"]["Enums"]["offer_status"];
          tenant_id?: string;
          tow_company_id?: string;
          tow_job_id?: string;
          tow_vehicle_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tow_job_offers_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "driver_performance_stats";
            referencedColumns: ["driver_id"];
          },
          {
            foreignKeyName: "tow_job_offers_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "tow_drivers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_job_offers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_job_offers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_job_offers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_job_offers_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_job_offers_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_dashboard_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_job_offers_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_performance_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_job_offers_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_production_readiness";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_job_offers_tow_job_id_fkey";
            columns: ["tow_job_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["tow_job_id"];
          },
          {
            foreignKeyName: "tow_job_offers_tow_job_id_fkey";
            columns: ["tow_job_id"];
            isOneToOne: false;
            referencedRelation: "tow_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_job_offers_tow_vehicle_id_fkey";
            columns: ["tow_vehicle_id"];
            isOneToOne: false;
            referencedRelation: "insurer_agreement_vehicle_matrix";
            referencedColumns: ["tow_vehicle_id"];
          },
          {
            foreignKeyName: "tow_job_offers_tow_vehicle_id_fkey";
            columns: ["tow_vehicle_id"];
            isOneToOne: false;
            referencedRelation: "tow_vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      tow_job_status_events: {
        Row: {
          actor_api_client_id: string | null;
          actor_kind: string | null;
          actor_user_id: string | null;
          actor_worker: string | null;
          created_at: string;
          from_status: Database["public"]["Enums"]["tow_job_status"] | null;
          id: string;
          reason: string | null;
          to_status: Database["public"]["Enums"]["tow_job_status"];
          tow_job_id: string;
        };
        Insert: {
          actor_api_client_id?: string | null;
          actor_kind?: string | null;
          actor_user_id?: string | null;
          actor_worker?: string | null;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["tow_job_status"] | null;
          id?: string;
          reason?: string | null;
          to_status: Database["public"]["Enums"]["tow_job_status"];
          tow_job_id: string;
        };
        Update: {
          actor_api_client_id?: string | null;
          actor_kind?: string | null;
          actor_user_id?: string | null;
          actor_worker?: string | null;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["tow_job_status"] | null;
          id?: string;
          reason?: string | null;
          to_status?: Database["public"]["Enums"]["tow_job_status"];
          tow_job_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tow_job_status_events_actor_api_client_id_fkey";
            columns: ["actor_api_client_id"];
            isOneToOne: false;
            referencedRelation: "tenant_api_clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_job_status_events_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_job_status_events_tow_job_id_fkey";
            columns: ["tow_job_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["tow_job_id"];
          },
          {
            foreignKeyName: "tow_job_status_events_tow_job_id_fkey";
            columns: ["tow_job_id"];
            isOneToOne: false;
            referencedRelation: "tow_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      tow_jobs: {
        Row: {
          created_at: string;
          created_by_api_client_id: string | null;
          created_by_user_id: string | null;
          dispatch_attempts: number;
          dispatch_claimed_until: string | null;
          driver_id: string | null;
          id: string;
          incident_id: string;
          last_dispatch_attempt_at: string | null;
          last_dispatch_error: string | null;
          payer_type: string;
          price_snapshot: Json | null;
          priority: string;
          sla_deadline: string | null;
          status: Database["public"]["Enums"]["tow_job_status"];
          tenant_id: string;
          tow_company_id: string | null;
          tow_vehicle_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by_api_client_id?: string | null;
          created_by_user_id?: string | null;
          dispatch_attempts?: number;
          dispatch_claimed_until?: string | null;
          driver_id?: string | null;
          id?: string;
          incident_id: string;
          last_dispatch_attempt_at?: string | null;
          last_dispatch_error?: string | null;
          payer_type?: string;
          price_snapshot?: Json | null;
          priority?: string;
          sla_deadline?: string | null;
          status?: Database["public"]["Enums"]["tow_job_status"];
          tenant_id: string;
          tow_company_id?: string | null;
          tow_vehicle_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by_api_client_id?: string | null;
          created_by_user_id?: string | null;
          dispatch_attempts?: number;
          dispatch_claimed_until?: string | null;
          driver_id?: string | null;
          id?: string;
          incident_id?: string;
          last_dispatch_attempt_at?: string | null;
          last_dispatch_error?: string | null;
          payer_type?: string;
          price_snapshot?: Json | null;
          priority?: string;
          sla_deadline?: string | null;
          status?: Database["public"]["Enums"]["tow_job_status"];
          tenant_id?: string;
          tow_company_id?: string | null;
          tow_vehicle_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tow_jobs_created_by_api_client_id_fkey";
            columns: ["created_by_api_client_id"];
            isOneToOne: false;
            referencedRelation: "tenant_api_clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_jobs_created_by_user_id_fkey";
            columns: ["created_by_user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_jobs_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "driver_performance_stats";
            referencedColumns: ["driver_id"];
          },
          {
            foreignKeyName: "tow_jobs_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "tow_drivers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_jobs_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "incidents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_jobs_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "insurance_case_console";
            referencedColumns: ["incident_id"];
          },
          {
            foreignKeyName: "tow_jobs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_jobs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_jobs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_jobs_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_jobs_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_dashboard_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_jobs_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_performance_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_jobs_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_production_readiness";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_jobs_tow_vehicle_id_fkey";
            columns: ["tow_vehicle_id"];
            isOneToOne: false;
            referencedRelation: "insurer_agreement_vehicle_matrix";
            referencedColumns: ["tow_vehicle_id"];
          },
          {
            foreignKeyName: "tow_jobs_tow_vehicle_id_fkey";
            columns: ["tow_vehicle_id"];
            isOneToOne: false;
            referencedRelation: "tow_vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      tow_price_lists: {
        Row: {
          active: boolean;
          cancellation_policy: string | null;
          created_at: string;
          currency: string;
          evening_night_surcharge_minor: number;
          failed_trip_minor: number;
          heavy_tow_minor: number;
          id: string;
          minimum_price_minor: number;
          name: string;
          on_call_surcharge_minor: number;
          per_km_minor: number;
          per_waiting_minute_minor: number;
          start_fee_minor: number;
          tenant_id: string;
          tow_company_id: string;
          weekend_surcharge_minor: number;
        };
        Insert: {
          active?: boolean;
          cancellation_policy?: string | null;
          created_at?: string;
          currency?: string;
          evening_night_surcharge_minor?: number;
          failed_trip_minor?: number;
          heavy_tow_minor?: number;
          id?: string;
          minimum_price_minor?: number;
          name: string;
          on_call_surcharge_minor?: number;
          per_km_minor?: number;
          per_waiting_minute_minor?: number;
          start_fee_minor?: number;
          tenant_id: string;
          tow_company_id: string;
          weekend_surcharge_minor?: number;
        };
        Update: {
          active?: boolean;
          cancellation_policy?: string | null;
          created_at?: string;
          currency?: string;
          evening_night_surcharge_minor?: number;
          failed_trip_minor?: number;
          heavy_tow_minor?: number;
          id?: string;
          minimum_price_minor?: number;
          name?: string;
          on_call_surcharge_minor?: number;
          per_km_minor?: number;
          per_waiting_minute_minor?: number;
          start_fee_minor?: number;
          tenant_id?: string;
          tow_company_id?: string;
          weekend_surcharge_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tow_price_lists_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_price_lists_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_price_lists_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_price_lists_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_price_lists_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_dashboard_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_price_lists_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_performance_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_price_lists_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_production_readiness";
            referencedColumns: ["tow_company_id"];
          },
        ];
      };
      tow_sla_rules: {
        Row: {
          created_at: string;
          id: string;
          priority: string;
          target_eta_minutes: number;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          priority?: string;
          target_eta_minutes?: number;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          priority?: string;
          target_eta_minutes?: number;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tow_sla_rules_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_sla_rules_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_sla_rules_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tow_vehicle_capabilities: {
        Row: {
          can_handle_ev: boolean;
          can_tow_car: boolean;
          can_tow_heavy_truck: boolean;
          can_tow_light_truck: boolean;
          can_tow_motorcycle: boolean;
          has_battery_booster: boolean;
          has_crane: boolean;
          has_flatbed: boolean;
          has_fuel_service: boolean;
          has_tire_service: boolean;
          has_wheel_lift: boolean;
          has_winch: boolean;
          tow_vehicle_id: string;
        };
        Insert: {
          can_handle_ev?: boolean;
          can_tow_car?: boolean;
          can_tow_heavy_truck?: boolean;
          can_tow_light_truck?: boolean;
          can_tow_motorcycle?: boolean;
          has_battery_booster?: boolean;
          has_crane?: boolean;
          has_flatbed?: boolean;
          has_fuel_service?: boolean;
          has_tire_service?: boolean;
          has_wheel_lift?: boolean;
          has_winch?: boolean;
          tow_vehicle_id: string;
        };
        Update: {
          can_handle_ev?: boolean;
          can_tow_car?: boolean;
          can_tow_heavy_truck?: boolean;
          can_tow_light_truck?: boolean;
          can_tow_motorcycle?: boolean;
          has_battery_booster?: boolean;
          has_crane?: boolean;
          has_flatbed?: boolean;
          has_fuel_service?: boolean;
          has_tire_service?: boolean;
          has_wheel_lift?: boolean;
          has_winch?: boolean;
          tow_vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tow_vehicle_capabilities_tow_vehicle_id_fkey";
            columns: ["tow_vehicle_id"];
            isOneToOne: true;
            referencedRelation: "insurer_agreement_vehicle_matrix";
            referencedColumns: ["tow_vehicle_id"];
          },
          {
            foreignKeyName: "tow_vehicle_capabilities_tow_vehicle_id_fkey";
            columns: ["tow_vehicle_id"];
            isOneToOne: true;
            referencedRelation: "tow_vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      tow_vehicle_insurance_permissions: {
        Row: {
          active_from: string | null;
          active_to: string | null;
          created_at: string;
          id: string;
          insurance_agreement_id: string;
          notes: string | null;
          status: string;
          tow_vehicle_id: string;
          updated_at: string;
        };
        Insert: {
          active_from?: string | null;
          active_to?: string | null;
          created_at?: string;
          id?: string;
          insurance_agreement_id: string;
          notes?: string | null;
          status?: string;
          tow_vehicle_id: string;
          updated_at?: string;
        };
        Update: {
          active_from?: string | null;
          active_to?: string | null;
          created_at?: string;
          id?: string;
          insurance_agreement_id?: string;
          notes?: string | null;
          status?: string;
          tow_vehicle_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tow_vehicle_insurance_permissions_insurance_agreement_id_fkey";
            columns: ["insurance_agreement_id"];
            isOneToOne: false;
            referencedRelation: "insurer_agreement_vehicle_matrix";
            referencedColumns: ["agreement_id"];
          },
          {
            foreignKeyName: "tow_vehicle_insurance_permissions_insurance_agreement_id_fkey";
            columns: ["insurance_agreement_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_insurance_agreements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_vehicle_insurance_permissions_tow_vehicle_id_fkey";
            columns: ["tow_vehicle_id"];
            isOneToOne: false;
            referencedRelation: "insurer_agreement_vehicle_matrix";
            referencedColumns: ["tow_vehicle_id"];
          },
          {
            foreignKeyName: "tow_vehicle_insurance_permissions_tow_vehicle_id_fkey";
            columns: ["tow_vehicle_id"];
            isOneToOne: false;
            referencedRelation: "tow_vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      tow_vehicle_locations: {
        Row: {
          created_at: string;
          geom: unknown;
          id: string;
          lat: number;
          lng: number;
          tow_vehicle_id: string;
        };
        Insert: {
          created_at?: string;
          geom?: unknown;
          id?: string;
          lat: number;
          lng: number;
          tow_vehicle_id: string;
        };
        Update: {
          created_at?: string;
          geom?: unknown;
          id?: string;
          lat?: number;
          lng?: number;
          tow_vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tow_vehicle_locations_tow_vehicle_id_fkey";
            columns: ["tow_vehicle_id"];
            isOneToOne: false;
            referencedRelation: "insurer_agreement_vehicle_matrix";
            referencedColumns: ["tow_vehicle_id"];
          },
          {
            foreignKeyName: "tow_vehicle_locations_tow_vehicle_id_fkey";
            columns: ["tow_vehicle_id"];
            isOneToOne: false;
            referencedRelation: "tow_vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      tow_vehicles: {
        Row: {
          capacity_notes: string | null;
          created_at: string;
          created_by_user_id: string | null;
          current_driver_id: string | null;
          duty_status: Database["public"]["Enums"]["duty_status"];
          gps_device_id: string | null;
          id: string;
          inspection_valid_until: string | null;
          insurance_valid_until: string | null;
          last_service_at: string | null;
          max_weight_kg: number | null;
          registration_number: string;
          status: string;
          tenant_id: string;
          tow_company_id: string;
          updated_at: string;
          vehicle_type: Database["public"]["Enums"]["tow_vehicle_type"];
        };
        Insert: {
          capacity_notes?: string | null;
          created_at?: string;
          created_by_user_id?: string | null;
          current_driver_id?: string | null;
          duty_status?: Database["public"]["Enums"]["duty_status"];
          gps_device_id?: string | null;
          id?: string;
          inspection_valid_until?: string | null;
          insurance_valid_until?: string | null;
          last_service_at?: string | null;
          max_weight_kg?: number | null;
          registration_number: string;
          status?: string;
          tenant_id: string;
          tow_company_id: string;
          updated_at?: string;
          vehicle_type: Database["public"]["Enums"]["tow_vehicle_type"];
        };
        Update: {
          capacity_notes?: string | null;
          created_at?: string;
          created_by_user_id?: string | null;
          current_driver_id?: string | null;
          duty_status?: Database["public"]["Enums"]["duty_status"];
          gps_device_id?: string | null;
          id?: string;
          inspection_valid_until?: string | null;
          insurance_valid_until?: string | null;
          last_service_at?: string | null;
          max_weight_kg?: number | null;
          registration_number?: string;
          status?: string;
          tenant_id?: string;
          tow_company_id?: string;
          updated_at?: string;
          vehicle_type?: Database["public"]["Enums"]["tow_vehicle_type"];
        };
        Relationships: [
          {
            foreignKeyName: "tow_vehicles_created_by_user_id_fkey";
            columns: ["created_by_user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_vehicles_current_driver_id_fkey";
            columns: ["current_driver_id"];
            isOneToOne: false;
            referencedRelation: "driver_performance_stats";
            referencedColumns: ["driver_id"];
          },
          {
            foreignKeyName: "tow_vehicles_current_driver_id_fkey";
            columns: ["current_driver_id"];
            isOneToOne: false;
            referencedRelation: "tow_drivers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_vehicles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_vehicles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_vehicles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_vehicles_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_vehicles_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_dashboard_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_vehicles_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_performance_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_vehicles_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_production_readiness";
            referencedColumns: ["tow_company_id"];
          },
        ];
      };
      tow_zones: {
        Row: {
          center_lat: number;
          center_lng: number;
          created_at: string;
          id: string;
          name: string;
          radius_km: number;
          tenant_id: string;
          tow_company_id: string;
        };
        Insert: {
          center_lat: number;
          center_lng: number;
          created_at?: string;
          id?: string;
          name: string;
          radius_km?: number;
          tenant_id: string;
          tow_company_id: string;
        };
        Update: {
          center_lat?: number;
          center_lng?: number;
          created_at?: string;
          id?: string;
          name?: string;
          radius_km?: number;
          tenant_id?: string;
          tow_company_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tow_zones_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_zones_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_zones_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_zones_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_zones_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_dashboard_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_zones_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_performance_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_zones_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_production_readiness";
            referencedColumns: ["tow_company_id"];
          },
        ];
      };
      user_identity_verifications: {
        Row: {
          created_at: string;
          display_name: string | null;
          environment: Database["public"]["Enums"]["bankid_env"];
          id: string;
          personal_number_hash: string | null;
          tenant_id: string;
          user_id: string;
          verified: boolean;
          verified_at: string | null;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          environment: Database["public"]["Enums"]["bankid_env"];
          id?: string;
          personal_number_hash?: string | null;
          tenant_id: string;
          user_id: string;
          verified?: boolean;
          verified_at?: string | null;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          environment?: Database["public"]["Enums"]["bankid_env"];
          id?: string;
          personal_number_hash?: string | null;
          tenant_id?: string;
          user_id?: string;
          verified?: boolean;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "user_identity_verifications_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "user_identity_verifications_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "user_identity_verifications_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_identity_verifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_profiles: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          is_platform_admin: boolean;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          is_platform_admin?: boolean;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          is_platform_admin?: boolean;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role_key: string;
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role_key: string;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role_key?: string;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_role_key_fkey";
            columns: ["role_key"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "user_roles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "user_roles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "user_roles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_roles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      vehicle_insurance_policies: {
        Row: {
          consent_record_id: string | null;
          created_at: string;
          created_by_user_id: string | null;
          customer_user_id: string | null;
          id: string;
          insurance_company_id: string;
          is_active: boolean;
          policy_number: string | null;
          status: string;
          tenant_id: string | null;
          updated_at: string;
          valid_from: string | null;
          valid_to: string | null;
          vehicle_id: string;
          verified_with_bankid_at: string | null;
        };
        Insert: {
          consent_record_id?: string | null;
          created_at?: string;
          created_by_user_id?: string | null;
          customer_user_id?: string | null;
          id?: string;
          insurance_company_id: string;
          is_active?: boolean;
          policy_number?: string | null;
          status?: string;
          tenant_id?: string | null;
          updated_at?: string;
          valid_from?: string | null;
          valid_to?: string | null;
          vehicle_id: string;
          verified_with_bankid_at?: string | null;
        };
        Update: {
          consent_record_id?: string | null;
          created_at?: string;
          created_by_user_id?: string | null;
          customer_user_id?: string | null;
          id?: string;
          insurance_company_id?: string;
          is_active?: boolean;
          policy_number?: string | null;
          status?: string;
          tenant_id?: string | null;
          updated_at?: string;
          valid_from?: string | null;
          valid_to?: string | null;
          vehicle_id?: string;
          verified_with_bankid_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "vehicle_insurance_policies_consent_record_id_fkey";
            columns: ["consent_record_id"];
            isOneToOne: false;
            referencedRelation: "consent_records";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicle_insurance_policies_created_by_user_id_fkey";
            columns: ["created_by_user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicle_insurance_policies_customer_user_id_fkey";
            columns: ["customer_user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicle_insurance_policies_insurance_company_id_fkey";
            columns: ["insurance_company_id"];
            isOneToOne: false;
            referencedRelation: "insurance_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicle_insurance_policies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "vehicle_insurance_policies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "vehicle_insurance_policies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicle_insurance_policies_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      vehicle_owners: {
        Row: {
          id: string;
          relation: string;
          user_id: string;
          vehicle_id: string;
        };
        Insert: {
          id?: string;
          relation?: string;
          user_id: string;
          vehicle_id: string;
        };
        Update: {
          id?: string;
          relation?: string;
          user_id?: string;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vehicle_owners_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicle_owners_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      vehicles: {
        Row: {
          color: string | null;
          created_at: string;
          created_by_user_id: string | null;
          fuel_type: Database["public"]["Enums"]["fuel_type"] | null;
          id: string;
          insurance_company_id: string | null;
          is_default: boolean;
          make: string | null;
          model: string | null;
          owner_user_id: string;
          ownership: Database["public"]["Enums"]["vehicle_ownership"];
          policy_number: string | null;
          registration_number: string;
          tenant_id: string | null;
          updated_at: string;
          vehicle_type: string | null;
          vin: string | null;
          year: number | null;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          created_by_user_id?: string | null;
          fuel_type?: Database["public"]["Enums"]["fuel_type"] | null;
          id?: string;
          insurance_company_id?: string | null;
          is_default?: boolean;
          make?: string | null;
          model?: string | null;
          owner_user_id: string;
          ownership?: Database["public"]["Enums"]["vehicle_ownership"];
          policy_number?: string | null;
          registration_number: string;
          tenant_id?: string | null;
          updated_at?: string;
          vehicle_type?: string | null;
          vin?: string | null;
          year?: number | null;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          created_by_user_id?: string | null;
          fuel_type?: Database["public"]["Enums"]["fuel_type"] | null;
          id?: string;
          insurance_company_id?: string | null;
          is_default?: boolean;
          make?: string | null;
          model?: string | null;
          owner_user_id?: string;
          ownership?: Database["public"]["Enums"]["vehicle_ownership"];
          policy_number?: string | null;
          registration_number?: string;
          tenant_id?: string | null;
          updated_at?: string;
          vehicle_type?: string | null;
          vin?: string | null;
          year?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "vehicles_created_by_user_id_fkey";
            columns: ["created_by_user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicles_insurance_company_id_fkey";
            columns: ["insurance_company_id"];
            isOneToOne: false;
            referencedRelation: "insurance_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicles_owner_user_id_fkey";
            columns: ["owner_user_id"];
            isOneToOne: false;
            referencedRelation: "user_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "vehicles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "vehicles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_deliveries: {
        Row: {
          attempts: number;
          claim_token: string | null;
          claimed_by: string | null;
          created_at: string;
          delivered_at: string | null;
          envelope: NonNullable<Json>;
          event: string;
          first_attempt_at: string | null;
          id: string;
          last_error: string | null;
          lease_until: string | null;
          next_attempt_at: string | null;
          payload: NonNullable<Json>;
          provider_request: Json | null;
          response_body: string | null;
          response_status: number | null;
          status: string;
          tenant_id: string;
          updated_at: string;
          webhook_id: string;
        };
        Insert: {
          attempts?: number;
          claim_token?: string | null;
          claimed_by?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          envelope: NonNullable<Json>;
          event: string;
          first_attempt_at?: string | null;
          id?: string;
          last_error?: string | null;
          lease_until?: string | null;
          next_attempt_at?: string | null;
          payload: NonNullable<Json>;
          provider_request?: Json | null;
          response_body?: string | null;
          response_status?: number | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
          webhook_id: string;
        };
        Update: {
          attempts?: number;
          claim_token?: string | null;
          claimed_by?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          envelope?: NonNullable<Json>;
          event?: string;
          first_attempt_at?: string | null;
          id?: string;
          last_error?: string | null;
          lease_until?: string | null;
          next_attempt_at?: string | null;
          payload?: NonNullable<Json>;
          provider_request?: Json | null;
          response_body?: string | null;
          response_status?: number | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          webhook_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "webhook_deliveries_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "webhook_deliveries_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey";
            columns: ["webhook_id"];
            isOneToOne: false;
            referencedRelation: "tenant_webhooks";
            referencedColumns: ["id"];
          },
        ];
      };
      worker_heartbeats: {
        Row: {
          instance_id: string;
          last_error: string | null;
          last_failed_at: string | null;
          last_started_at: string | null;
          last_succeeded_at: string | null;
          status: string;
          updated_at: string;
          worker_name: string;
        };
        Insert: {
          instance_id: string;
          last_error?: string | null;
          last_failed_at?: string | null;
          last_started_at?: string | null;
          last_succeeded_at?: string | null;
          status?: string;
          updated_at?: string;
          worker_name: string;
        };
        Update: {
          instance_id?: string;
          last_error?: string | null;
          last_failed_at?: string | null;
          last_started_at?: string | null;
          last_succeeded_at?: string | null;
          status?: string;
          updated_at?: string;
          worker_name?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      domain_integrity_violations: {
        Row: {
          entity_id: string | null;
          entity_type: string | null;
          tenant_id: string | null;
          violation: string | null;
        };
        Relationships: [];
      };
      driver_performance_stats: {
        Row: {
          acceptance_rate: number | null;
          avg_accept_seconds: number | null;
          avg_arrival_seconds: number | null;
          driver_id: string | null;
          full_name: string | null;
          is_online: boolean | null;
          jobs_completed: number | null;
          offers_accepted: number | null;
          offers_expired: number | null;
          offers_received: number | null;
          offers_rejected: number | null;
          rating: number | null;
          status: string | null;
          tenant_id: string | null;
          tow_company_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tow_drivers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_drivers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_drivers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_drivers_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_drivers_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_dashboard_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_drivers_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_performance_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_drivers_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_production_readiness";
            referencedColumns: ["tow_company_id"];
          },
        ];
      };
      geography_columns: {
        Row: {
          coord_dimension: number | null;
          f_geography_column: unknown;
          f_table_catalog: unknown;
          f_table_name: unknown;
          f_table_schema: unknown;
          srid: number | null;
          type: string | null;
        };
        Relationships: [];
      };
      geometry_columns: {
        Row: {
          coord_dimension: number | null;
          f_geometry_column: unknown;
          f_table_catalog: string | null;
          f_table_name: unknown;
          f_table_schema: unknown;
          srid: number | null;
          type: string | null;
        };
        Insert: {
          coord_dimension?: number | null;
          f_geometry_column?: unknown;
          f_table_catalog?: string | null;
          f_table_name?: unknown;
          f_table_schema?: unknown;
          srid?: number | null;
          type?: string | null;
        };
        Update: {
          coord_dimension?: number | null;
          f_geometry_column?: unknown;
          f_table_catalog?: string | null;
          f_table_name?: unknown;
          f_table_schema?: unknown;
          srid?: number | null;
          type?: string | null;
        };
        Relationships: [];
      };
      insurance_case_console: {
        Row: {
          assigned_driver_name: string | null;
          assigned_tow_company_name: string | null;
          assigned_tow_vehicle_registration: string | null;
          bankid_signature_count: number | null;
          bankid_signed_at: string | null;
          bankid_verified: boolean | null;
          case_number: string | null;
          claim_id: string | null;
          claim_number: string | null;
          claim_status: Database["public"]["Enums"]["claim_status"] | null;
          created_at: string | null;
          customer_email: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          damage_type: Database["public"]["Enums"]["damage_type"] | null;
          description: string | null;
          distance_meters: number | null;
          eta_seconds: number | null;
          eta_source: string | null;
          evidence_count: number | null;
          incident_id: string | null;
          incident_status: Database["public"]["Enums"]["incident_status"] | null;
          incident_type: Database["public"]["Enums"]["incident_type"] | null;
          insurance_company_name: string | null;
          make: string | null;
          model: string | null;
          next_action_label: string | null;
          payer_type: string | null;
          priority: string | null;
          problem_type: Database["public"]["Enums"]["tow_problem_type"] | null;
          registration_number: string | null;
          requires_bankid: boolean | null;
          sla_deadline: string | null;
          tenant_failed_webhooks: number | null;
          tenant_id: string | null;
          tow_job_id: string | null;
          tow_status: Database["public"]["Enums"]["tow_job_status"] | null;
          updated_at: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "incidents_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "incidents_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "incidents_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      insurance_dashboard_stats: {
        Row: {
          active_towing: number | null;
          avg_cost_minor: number | null;
          avg_eta_seconds: number | null;
          avg_resolution_seconds: number | null;
          avg_response_seconds: number | null;
          awaiting_bankid: number | null;
          awaiting_handler: number | null;
          cancelled_cases: number | null;
          cases_7d: number | null;
          completed_cases: number | null;
          damage_claims: number | null;
          manual_review: number | null;
          new_cases: number | null;
          sla_risk: number | null;
          tenant_id: string | null;
          total_cases: number | null;
          total_cost_minor: number | null;
          webhook_errors: number | null;
        };
        Relationships: [];
      };
      insurance_partner_performance_stats: {
        Row: {
          avg_eta_seconds: number | null;
          insurance_tenant_id: string | null;
          jobs_completed: number | null;
          jobs_failed: number | null;
          jobs_total: number | null;
          revenue_minor: number | null;
          sla_hit: number | null;
          sla_hit_rate: number | null;
          sla_miss: number | null;
          tow_company_id: string | null;
          tow_company_name: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tow_jobs_tenant_id_fkey";
            columns: ["insurance_tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_jobs_tenant_id_fkey";
            columns: ["insurance_tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_jobs_tenant_id_fkey";
            columns: ["insurance_tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_jobs_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_jobs_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_dashboard_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_jobs_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_performance_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_jobs_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_production_readiness";
            referencedColumns: ["tow_company_id"];
          },
        ];
      };
      insurer_agreement_vehicle_matrix: {
        Row: {
          agreement_id: string | null;
          agreement_status: string | null;
          can_handle_ev: boolean | null;
          can_tow_car: boolean | null;
          can_tow_heavy_truck: boolean | null;
          can_tow_light_truck: boolean | null;
          can_tow_motorcycle: boolean | null;
          coverage_area: Json | null;
          eligible_for_insurance_dispatch: boolean | null;
          insurance_tenant_id: string | null;
          permission_id: string | null;
          permission_notes: string | null;
          permission_status: string | null;
          priority: number | null;
          registration_number: string | null;
          sla_minutes: number | null;
          tow_company_id: string | null;
          tow_company_name: string | null;
          tow_vehicle_duty_status: Database["public"]["Enums"]["duty_status"] | null;
          tow_vehicle_id: string | null;
          tow_vehicle_status: string | null;
          vehicle_type: Database["public"]["Enums"]["tow_vehicle_type"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "tow_company_insurance_agreements_insurance_tenant_id_fkey";
            columns: ["insurance_tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_company_insurance_agreements_insurance_tenant_id_fkey";
            columns: ["insurance_tenant_id"];
            isOneToOne: false;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_company_insurance_agreements_insurance_tenant_id_fkey";
            columns: ["insurance_tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_company_insurance_agreements_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tow_company_insurance_agreements_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_dashboard_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_company_insurance_agreements_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_performance_stats";
            referencedColumns: ["tow_company_id"];
          },
          {
            foreignKeyName: "tow_company_insurance_agreements_tow_company_id_fkey";
            columns: ["tow_company_id"];
            isOneToOne: false;
            referencedRelation: "tow_company_production_readiness";
            referencedColumns: ["tow_company_id"];
          },
        ];
      };
      insurer_production_readiness: {
        Row: {
          active_agreements: number | null;
          active_api_clients: number | null;
          active_legal_versions: number | null;
          active_webhooks: number | null;
          bankid_required_for_claims: boolean | null;
          bankid_required_for_tow: boolean | null;
          blockers: string[] | null;
          case_number_prefix: string | null;
          eligible_tow_vehicles: number | null;
          enabled_fallback_rules: number | null;
          has_branding: boolean | null;
          has_case_prefix: boolean | null;
          has_simple_privacy: boolean | null;
          has_simple_terms: boolean | null;
          has_theme: boolean | null;
          insurer_name: string | null;
          ready_for_paid_pilot: boolean | null;
          slug: string | null;
          status: Database["public"]["Enums"]["tenant_status"] | null;
          tenant_id: string | null;
        };
        Relationships: [];
      };
      superadmin_platform_stats: {
        Row: {
          active_cases: number | null;
          active_drivers: number | null;
          active_tow_jobs: number | null;
          bankid_signatures: number | null;
          bankid_signatures_7d: number | null;
          cases_7d: number | null;
          cases_today: number | null;
          drivers_online: number | null;
          insurance_companies: number | null;
          revenue_minor: number | null;
          sla_risks: number | null;
          total_tenants: number | null;
          tow_companies: number | null;
          webhook_errors: number | null;
        };
        Relationships: [];
      };
      tow_company_dashboard_stats: {
        Row: {
          accepted_jobs: number | null;
          active_jobs: number | null;
          avg_accept_seconds: number | null;
          avg_arrival_seconds: number | null;
          completed_jobs: number | null;
          drivers_online: number | null;
          drivers_total: number | null;
          missed_jobs: number | null;
          new_offers: number | null;
          rejected_jobs: number | null;
          revenue_minor: number | null;
          sla_hit: number | null;
          sla_miss: number | null;
          tenant_id: string | null;
          tow_company_id: string | null;
          vehicles_available: number | null;
          vehicles_total: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "tow_companies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_companies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_companies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tow_company_performance_stats: {
        Row: {
          acceptance_rate: number | null;
          avg_accept_seconds: number | null;
          completion_rate: number | null;
          jobs_cancelled: number | null;
          jobs_completed: number | null;
          jobs_failed: number | null;
          jobs_total: number | null;
          name: string | null;
          offers_accepted: number | null;
          offers_received: number | null;
          revenue_minor: number | null;
          sla_hit: number | null;
          sla_hit_rate: number | null;
          sla_miss: number | null;
          tenant_id: string | null;
          tow_company_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tow_companies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_companies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_companies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tow_company_production_readiness: {
        Row: {
          accepts_private_jobs: boolean | null;
          active_agreements: number | null;
          active_drivers: number | null;
          active_vehicles: number | null;
          blockers: string[] | null;
          company_active: boolean | null;
          completed_reports: number | null;
          driver_count: number | null;
          has_support_contact: boolean | null;
          loginable_drivers: number | null;
          push_devices: number | null;
          ready_for_live_operation: boolean | null;
          slug: string | null;
          tenant_id: string | null;
          tow_company_id: string | null;
          tow_company_name: string | null;
          vehicle_count: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "tow_companies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "insurance_dashboard_stats";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_companies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "insurer_production_readiness";
            referencedColumns: ["tenant_id"];
          },
          {
            foreignKeyName: "tow_companies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string };
        Returns: undefined;
      };
      _postgis_index_extent: { Args: { col: string; tbl: unknown }; Returns: unknown };
      _postgis_pgsql_version: { Args: Record<PropertyKey, never>; Returns: string };
      _postgis_scripts_pgsql_version: { Args: Record<PropertyKey, never>; Returns: string };
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown };
        Returns: number;
      };
      _postgis_stats: { Args: { ""?: string; att_name: string; tbl: unknown }; Returns: string };
      _st_3dintersects: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      _st_contains: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      _st_containsproperly: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      _st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      _st_dwithin: {
        Args: { geog1: unknown; geog2: unknown; tolerance: number; use_spheroid?: boolean };
        Returns: boolean;
      };
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      _st_intersects: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      _st_linecrossingdirection: { Args: { line1: unknown; line2: unknown }; Returns: number };
      _st_longestline: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown };
      _st_maxdistance: { Args: { geom1: unknown; geom2: unknown }; Returns: number };
      _st_orderingequals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      _st_overlaps: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      _st_sortablehash: { Args: { geom: unknown }; Returns: number };
      _st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      _st_voronoi: {
        Args: { clip?: unknown; g1: unknown; return_polygons?: boolean; tolerance?: number };
        Returns: unknown;
      };
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      accept_tow_offer: {
        Args: { p_driver: string; p_job: string };
        Returns: {
          accepted: boolean;
          reason: string;
          tow_company_id: string;
        }[];
      };
      accept_tow_offer_for_actor: {
        Args: { p_actor_user: string; p_correlation_id: string; p_driver: string; p_job: string };
        Returns: {
          accepted: boolean;
          reason: string;
          tow_company_id: string;
        }[];
      };
      addauth: { Args: { "": string }; Returns: boolean };
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string;
              column_name: string;
              new_dim: number;
              new_srid_in: number;
              new_type: string;
              schema_name: string;
              table_name: string;
              use_typmod?: boolean;
            };
            Returns: string;
          }
        | {
            Args: {
              column_name: string;
              new_dim: number;
              new_srid: number;
              new_type: string;
              schema_name: string;
              table_name: string;
              use_typmod?: boolean;
            };
            Returns: string;
          }
        | {
            Args: {
              column_name: string;
              new_dim: number;
              new_srid: number;
              new_type: string;
              table_name: string;
              use_typmod?: boolean;
            };
            Returns: string;
          };
      allocate_case_number: { Args: { p_scope?: string; p_tenant: string }; Returns: string };
      bind_delivery_request: {
        Args: { p_id: string; p_queue: string; p_request: Json; p_token: string };
        Returns: Json;
      };
      cancel_incident_workflow: {
        Args: {
          p_actor_user: string;
          p_customer_only?: boolean;
          p_incident: string;
          p_reason: string;
        };
        Returns: Json;
      };
      claim_delivery_batch: {
        Args: {
          p_channels?: string[];
          p_lease_seconds?: number;
          p_limit?: number;
          p_queue: string;
          p_worker: string;
        };
        Returns: Json;
      };
      claim_tow_dispatch_job: {
        Args: { p_job: string; p_lease_seconds?: number };
        Returns: {
          claimed: boolean;
          job_status: Database["public"]["Enums"]["tow_job_status"];
        }[];
      };
      claim_tow_dispatch_retries: {
        Args: { p_limit?: number; p_min_age_seconds?: number };
        Returns: {
          case_number: string;
          incident_id: string;
          job_id: string;
          job_status: Database["public"]["Enums"]["tow_job_status"];
          payer_type: string;
          pickup_lat: number;
          pickup_lng: number;
          priority: string;
          problem_type: string;
          tenant_id: string;
        }[];
      };
      complete_bankid_session: {
        Args: {
          p_business_payload?: Json;
          p_from_webhook?: boolean;
          p_result?: Json;
          p_session_id: string;
          p_signature: Json;
        };
        Returns: {
          flow: string;
          newly_processed: boolean;
          related_id: string;
          signature_id: string;
        }[];
      };
      consume_one_time_secret: {
        Args: { p_tenant_id: string; p_token_hash: string };
        Returns: {
          reveal_kind: string;
          reveal_secret: string;
        }[];
      };
      create_resqly_staging_demo: {
        Args: Record<PropertyKey, never>;
        Returns: {
          approved_tow_company_one: string;
          approved_tow_company_two: string;
          insurer_tenant_id: string;
          marketplace_tow_company: string;
          suspended_tow_company: string;
        }[];
      };
      create_resqly_staging_demo_unguarded: {
        Args: Record<PropertyKey, never>;
        Returns: {
          approved_tow_company_one: string;
          approved_tow_company_two: string;
          insurer_tenant_id: string;
          marketplace_tow_company: string;
          suspended_tow_company: string;
        }[];
      };
      dearmor: { Args: { "": string }; Returns: string };
      disablelongtransactions: { Args: Record<PropertyKey, never>; Returns: string };
      dispatch_eligible_candidates: {
        Args: {
          p_insurance_tenant_id?: string;
          p_lat: number;
          p_limit?: number;
          p_lng: number;
          p_now?: string;
          p_payer_type?: string;
          p_radius_m: number;
        };
        Returns: {
          agreement_priority: number;
          can_handle_ev: boolean;
          can_tow_heavy_truck: boolean;
          can_tow_motorcycle: boolean;
          distance_m: number;
          driver_id: string;
          driver_lat: number;
          driver_lng: number;
          duty_status: Database["public"]["Enums"]["duty_status"];
          has_flatbed: boolean;
          insurance_agreement_id: string;
          is_busy: boolean;
          is_online: boolean;
          marketplace_enabled: boolean;
          tow_company_id: string;
          tow_vehicle_id: string;
        }[];
      };
      driver_actor_active: { Args: { p_driver: string; p_user: string }; Returns: boolean };
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string;
              column_name: string;
              schema_name: string;
              table_name: string;
            };
            Returns: string;
          }
        | {
            Args: { column_name: string; schema_name: string; table_name: string };
            Returns: string;
          }
        | { Args: { column_name: string; table_name: string }; Returns: string };
      dropgeometrytable:
        | {
            Args: { catalog_name: string; schema_name: string; table_name: string };
            Returns: string;
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string };
      enablelongtransactions: { Args: Record<PropertyKey, never>; Returns: string };
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      escalate_tow_job_manual_review: {
        Args: {
          p_actor_api_client?: string;
          p_actor_user: string;
          p_actor_worker?: string;
          p_assign_to?: string;
          p_job: string;
          p_reason: string;
          p_review_reason: string;
          p_tenant: string;
        };
        Returns: Json;
      };
      finalize_tow_job: {
        Args: { p_driver: string; p_invoice: Json; p_job: string; p_report: Json };
        Returns: {
          already_finalized: boolean;
          job_status: Database["public"]["Enums"]["tow_job_status"];
          total_minor: number;
        }[];
      };
      gen_random_uuid: { Args: Record<PropertyKey, never>; Returns: string };
      gen_salt: { Args: { "": string }; Returns: string };
      geometry: { Args: { "": string }; Returns: unknown };
      geometry_above: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      geometry_below: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      geometry_cmp: { Args: { geom1: unknown; geom2: unknown }; Returns: number };
      geometry_contained_3d: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      geometry_contains: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      geometry_contains_3d: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      geometry_distance_box: { Args: { geom1: unknown; geom2: unknown }; Returns: number };
      geometry_distance_centroid: { Args: { geom1: unknown; geom2: unknown }; Returns: number };
      geometry_eq: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      geometry_ge: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      geometry_gt: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      geometry_le: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      geometry_left: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      geometry_lt: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      geometry_overabove: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      geometry_overbelow: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      geometry_overlaps: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      geometry_overlaps_3d: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      geometry_overleft: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      geometry_overright: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      geometry_right: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      geometry_same: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      geometry_same_3d: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      geometry_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      geomfromewkt: { Args: { "": string }; Returns: unknown };
      gettransactionid: { Args: Record<PropertyKey, never>; Returns: unknown };
      has_offer_for_job: { Args: { p_job: string }; Returns: boolean };
      has_permission: { Args: { p_permission: string; p_tenant: string }; Returns: boolean };
      has_tenant_access: { Args: { p_tenant: string }; Returns: boolean };
      is_assigned_driver_for_job: { Args: { p_job: string }; Returns: boolean };
      is_driver_user: { Args: { p_driver: string }; Returns: boolean };
      is_platform_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_tow_company_member: { Args: { p_company: string }; Returns: boolean };
      longtransactionsenabled: { Args: Record<PropertyKey, never>; Returns: boolean };
      pgp_armor_headers: { Args: { "": string }; Returns: Record<string, unknown>[] };
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string };
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string };
        Returns: number;
      };
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string };
        Returns: number;
      };
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string };
        Returns: string;
      };
      postgis_extensions_upgrade: { Args: { target_version?: string }; Returns: string };
      postgis_full_version: { Args: Record<PropertyKey, never>; Returns: string };
      postgis_geos_compiled_version: { Args: Record<PropertyKey, never>; Returns: string };
      postgis_geos_version: { Args: Record<PropertyKey, never>; Returns: string };
      postgis_lib_build_date: { Args: Record<PropertyKey, never>; Returns: string };
      postgis_lib_revision: { Args: Record<PropertyKey, never>; Returns: string };
      postgis_lib_version: { Args: Record<PropertyKey, never>; Returns: string };
      postgis_libjson_version: { Args: Record<PropertyKey, never>; Returns: string };
      postgis_liblwgeom_version: { Args: Record<PropertyKey, never>; Returns: string };
      postgis_libprotobuf_version: { Args: Record<PropertyKey, never>; Returns: string };
      postgis_libxml_version: { Args: Record<PropertyKey, never>; Returns: string };
      postgis_proj_version: { Args: Record<PropertyKey, never>; Returns: string };
      postgis_scripts_build_date: { Args: Record<PropertyKey, never>; Returns: string };
      postgis_scripts_installed: { Args: Record<PropertyKey, never>; Returns: string };
      postgis_scripts_released: { Args: Record<PropertyKey, never>; Returns: string };
      postgis_srs: {
        Args: { auth_name: string; auth_srid: string };
        Returns: {
          auth_name: string;
          auth_srid: string;
          point_ne: unknown;
          point_sw: unknown;
          proj4text: string;
          srname: string;
          srtext: string;
        }[];
      };
      postgis_srs_all: {
        Args: Record<PropertyKey, never>;
        Returns: {
          auth_name: string;
          auth_srid: string;
          point_ne: unknown;
          point_sw: unknown;
          proj4text: string;
          srname: string;
          srtext: string;
        }[];
      };
      postgis_srs_codes: { Args: { auth_name: string }; Returns: string[] };
      postgis_srs_search: {
        Args: { authname?: string; bounds: unknown };
        Returns: {
          auth_name: string;
          auth_srid: string;
          point_ne: unknown;
          point_sw: unknown;
          proj4text: string;
          srname: string;
          srtext: string;
        }[];
      };
      postgis_svn_version: { Args: Record<PropertyKey, never>; Returns: string };
      postgis_transform_pipeline_geometry: {
        Args: { forward: boolean; geom: unknown; pipeline: string; to_srid: number };
        Returns: unknown;
      };
      postgis_type_name: {
        Args: { coord_dimension: number; geomname: string; use_new_name?: boolean };
        Returns: string;
      };
      postgis_version: { Args: Record<PropertyKey, never>; Returns: string };
      postgis_wagyu_version: { Args: Record<PropertyKey, never>; Returns: string };
      provision_tow_driver: {
        Args: {
          p_email: string;
          p_full_name: string;
          p_phone?: string;
          p_tenant_id: string;
          p_tow_company_id: string;
          p_user_id: string;
        };
        Returns: string;
      };
      record_tow_dispatch_attempt: {
        Args: { p_error?: string; p_job: string };
        Returns: {
          attempts: number;
          job_status: Database["public"]["Enums"]["tow_job_status"];
        }[];
      };
      replace_tow_price_list: {
        Args: { p_actor_user: string; p_price: Json; p_tenant: string; p_tow_company: string };
        Returns: string;
      };
      settle_delivery: {
        Args: {
          p_error?: string;
          p_id: string;
          p_next_attempt_at?: string;
          p_provider_message_id?: string;
          p_queue: string;
          p_response_body?: string;
          p_response_status?: number;
          p_status: string;
          p_token: string;
        };
        Returns: boolean;
      };
      st_3dclosestpoint: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown };
      st_3ddistance: { Args: { geom1: unknown; geom2: unknown }; Returns: number };
      st_3dintersects: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_3dlongestline: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown };
      st_3dmakebox: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown };
      st_3dmaxdistance: { Args: { geom1: unknown; geom2: unknown }; Returns: number };
      st_3dshortestline: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown };
      st_addpoint: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown };
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | { Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }; Returns: number };
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number };
      st_asencodedpolyline: { Args: { geom: unknown; nprecision?: number }; Returns: string };
      st_asewkt: { Args: { "": string }; Returns: string };
      st_asgeojson:
        | { Args: { geog: unknown; maxdecimaldigits?: number; options?: number }; Returns: string }
        | { Args: { geom: unknown; maxdecimaldigits?: number; options?: number }; Returns: string }
        | {
            Args: {
              geom_column?: string;
              maxdecimaldigits?: number;
              pretty_bool?: boolean;
              r: Record<string, unknown>;
            };
            Returns: string;
          }
        | { Args: { "": string }; Returns: string };
      st_asgml:
        | {
            Args: {
              geog: unknown;
              id?: string;
              maxdecimaldigits?: number;
              nprefix?: string;
              options?: number;
            };
            Returns: string;
          }
        | { Args: { geom: unknown; maxdecimaldigits?: number; options?: number }; Returns: string }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown;
              id?: string;
              maxdecimaldigits?: number;
              nprefix?: string;
              options?: number;
              version: number;
            };
            Returns: string;
          }
        | {
            Args: {
              geom: unknown;
              id?: string;
              maxdecimaldigits?: number;
              nprefix?: string;
              options?: number;
              version: number;
            };
            Returns: string;
          };
      st_askml:
        | { Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }; Returns: string }
        | { Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }; Returns: string }
        | { Args: { "": string }; Returns: string };
      st_aslatlontext: { Args: { geom: unknown; tmpl?: string }; Returns: string };
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string };
      st_asmvtgeom: {
        Args: {
          bounds: unknown;
          buffer?: number;
          clip_geom?: boolean;
          extent?: number;
          geom: unknown;
        };
        Returns: unknown;
      };
      st_assvg:
        | { Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }; Returns: string }
        | { Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }; Returns: string }
        | { Args: { "": string }; Returns: string };
      st_astext: { Args: { "": string }; Returns: string };
      st_astwkb:
        | {
            Args: {
              geom: unknown;
              prec?: number;
              prec_m?: number;
              prec_z?: number;
              with_boxes?: boolean;
              with_sizes?: boolean;
            };
            Returns: string;
          }
        | {
            Args: {
              geom: unknown[];
              ids: number[];
              prec?: number;
              prec_m?: number;
              prec_z?: number;
              with_boxes?: boolean;
              with_sizes?: boolean;
            };
            Returns: string;
          };
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number };
        Returns: string;
      };
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number };
      st_boundingdiagonal: { Args: { fits?: boolean; geom: unknown }; Returns: unknown };
      st_buffer:
        | { Args: { geom: unknown; options?: string; radius: number }; Returns: unknown }
        | { Args: { geom: unknown; quadsegs: number; radius: number }; Returns: unknown };
      st_centroid: { Args: { "": string }; Returns: unknown };
      st_clipbybox2d: { Args: { box: unknown; geom: unknown }; Returns: unknown };
      st_closestpoint: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown };
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown };
      st_concavehull: {
        Args: { param_allow_holes?: boolean; param_geom: unknown; param_pctconvex: number };
        Returns: unknown;
      };
      st_contains: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_containsproperly: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_coorddim: { Args: { geometry: unknown }; Returns: number };
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number };
        Returns: unknown;
      };
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number };
        Returns: unknown;
      };
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number };
        Returns: unknown;
      };
      st_disjoint: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_distance:
        | { Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number };
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown; radius: number }; Returns: number };
      st_distancespheroid: { Args: { geom1: unknown; geom2: unknown }; Returns: number };
      st_dwithin: {
        Args: { geog1: unknown; geog2: unknown; tolerance: number; use_spheroid?: boolean };
        Returns: boolean;
      };
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | { Args: { box: unknown; dx: number; dy: number; dz?: number }; Returns: unknown }
        | {
            Args: { dm?: number; dx: number; dy: number; dz?: number; geom: unknown };
            Returns: unknown;
          };
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown };
      st_force3dm: { Args: { geom: unknown; mvalue?: number }; Returns: unknown };
      st_force3dz: { Args: { geom: unknown; zvalue?: number }; Returns: unknown };
      st_force4d: { Args: { geom: unknown; mvalue?: number; zvalue?: number }; Returns: unknown };
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | { Args: { area: unknown; npoints: number; seed: number }; Returns: unknown };
      st_geogfromtext: { Args: { "": string }; Returns: unknown };
      st_geographyfromtext: { Args: { "": string }; Returns: unknown };
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string };
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown };
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean;
          g: unknown;
          max_iter?: number;
          tolerance?: number;
        };
        Returns: unknown;
      };
      st_geometryfromtext: { Args: { "": string }; Returns: unknown };
      st_geomfromewkt: { Args: { "": string }; Returns: unknown };
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown };
      st_geomfromgml: { Args: { "": string }; Returns: unknown };
      st_geomfromkml: { Args: { "": string }; Returns: unknown };
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown };
      st_geomfromtext: { Args: { "": string }; Returns: unknown };
      st_gmltosql: { Args: { "": string }; Returns: unknown };
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean };
      st_hausdorffdistance: { Args: { geom1: unknown; geom2: unknown }; Returns: number };
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number };
        Returns: unknown;
      };
      st_hexagongrid: {
        Args: { bounds: unknown; size: number };
        Returns: Record<string, unknown>[];
      };
      st_interpolatepoint: { Args: { line: unknown; point: unknown }; Returns: number };
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number };
        Returns: unknown;
      };
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_inversetransformpipeline: {
        Args: { geom: unknown; pipeline: string; to_srid?: number };
        Returns: unknown;
      };
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown };
        Returns: Database["public"]["CompositeTypes"]["valid_detail"];
        SetofOptions: {
          from: "*";
          to: "valid_detail";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      st_largestemptycircle: {
        Args: { boundary?: unknown; geom: unknown; tolerance?: number };
        Returns: Record<string, unknown>;
      };
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number };
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown };
      st_linecrossingdirection: { Args: { line1: unknown; line2: unknown }; Returns: number };
      st_lineextend: {
        Args: { distance_backward?: number; distance_forward: number; geom: unknown };
        Returns: unknown;
      };
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string };
        Returns: unknown;
      };
      st_linefromtext: { Args: { "": string }; Returns: unknown };
      st_linelocatepoint: { Args: { geom1: unknown; geom2: unknown }; Returns: number };
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown };
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number };
        Returns: unknown;
      };
      st_locatebetween: {
        Args: {
          frommeasure: number;
          geometry: unknown;
          leftrightoffset?: number;
          tomeasure: number;
        };
        Returns: unknown;
      };
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number };
        Returns: unknown;
      };
      st_longestline: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown };
      st_makebox2d: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown };
      st_makeline: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown };
      st_makevalid: { Args: { geom: unknown; params: string }; Returns: unknown };
      st_maxdistance: { Args: { geom1: unknown; geom2: unknown }; Returns: number };
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number };
        Returns: unknown;
      };
      st_mlinefromtext: { Args: { "": string }; Returns: unknown };
      st_mpointfromtext: { Args: { "": string }; Returns: unknown };
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown };
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown };
      st_multipointfromtext: { Args: { "": string }; Returns: unknown };
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown };
      st_node: { Args: { g: unknown }; Returns: unknown };
      st_normalize: { Args: { geom: unknown }; Returns: unknown };
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string };
        Returns: unknown;
      };
      st_orderingequals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_overlaps: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_perimeter: { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number };
      st_pointfromtext: { Args: { "": string }; Returns: unknown };
      st_pointm: {
        Args: { mcoordinate: number; srid?: number; xcoordinate: number; ycoordinate: number };
        Returns: unknown;
      };
      st_pointz: {
        Args: { srid?: number; xcoordinate: number; ycoordinate: number; zcoordinate: number };
        Returns: unknown;
      };
      st_pointzm: {
        Args: {
          mcoordinate: number;
          srid?: number;
          xcoordinate: number;
          ycoordinate: number;
          zcoordinate: number;
        };
        Returns: unknown;
      };
      st_polyfromtext: { Args: { "": string }; Returns: unknown };
      st_polygonfromtext: { Args: { "": string }; Returns: unknown };
      st_project:
        | { Args: { azimuth: number; distance: number; geog: unknown }; Returns: unknown }
        | { Args: { distance: number; geog_from: unknown; geog_to: unknown }; Returns: unknown }
        | { Args: { azimuth: number; distance: number; geom1: unknown }; Returns: unknown }
        | { Args: { distance: number; geom1: unknown; geom2: unknown }; Returns: unknown };
      st_quantizecoordinates: {
        Args: { g: unknown; prec_m?: number; prec_x: number; prec_y?: number; prec_z?: number };
        Returns: unknown;
      };
      st_reduceprecision: { Args: { geom: unknown; gridsize: number }; Returns: unknown };
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string };
      st_removerepeatedpoints: { Args: { geom: unknown; tolerance?: number }; Returns: unknown };
      st_segmentize: { Args: { geog: unknown; max_segment_length: number }; Returns: unknown };
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown };
      st_sharedpaths: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown };
      st_shortestline: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown };
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number };
        Returns: unknown;
      };
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown };
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number };
        Returns: unknown;
      };
      st_squaregrid: {
        Args: { bounds: unknown; size: number };
        Returns: Record<string, unknown>[];
      };
      st_srid:
        { Args: { geog: unknown }; Returns: number } | { Args: { geom: unknown }; Returns: number };
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number };
        Returns: unknown[];
      };
      st_swapordinates: { Args: { geom: unknown; ords: unknown }; Returns: unknown };
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number };
        Returns: unknown;
      };
      st_symmetricdifference: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown };
      st_tileenvelope: {
        Args: { bounds?: unknown; margin?: number; x: number; y: number; zoom: number };
        Returns: unknown;
      };
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_transform:
        | { Args: { from_proj: string; geom: unknown; to_proj: string }; Returns: unknown }
        | { Args: { from_proj: string; geom: unknown; to_srid: number }; Returns: unknown }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown };
      st_transformpipeline: {
        Args: { geom: unknown; pipeline: string; to_srid?: number };
        Returns: unknown;
      };
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown };
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | { Args: { geom1: unknown; geom2: unknown; gridsize: number }; Returns: unknown };
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number };
        Returns: unknown;
      };
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number };
        Returns: unknown;
      };
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown };
      st_wkttosql: { Args: { "": string }; Returns: unknown };
      st_wrapx: { Args: { geom: unknown; move: number; wrap: number }; Returns: unknown };
      tow_company_tenant: { Args: { p_company: string }; Returns: string };
      tow_drivers_within_radius: {
        Args: { p_lat: number; p_limit?: number; p_lng: number; p_radius_m: number };
        Returns: {
          distance_m: number;
          driver_id: string;
          last_lat: number;
          last_lng: number;
          tow_company_id: string;
        }[];
      };
      transition_incident_status: {
        Args: {
          p_actor_user: string;
          p_incident: string;
          p_reason?: string;
          p_tenant: string;
          p_to_status: string;
        };
        Returns: Json;
      };
      transition_tow_job_status: {
        Args: {
          p_actor_api_client: string;
          p_actor_user: string;
          p_actor_worker: string;
          p_expected_from: string;
          p_job: string;
          p_reason: string;
          p_to_status: string;
        };
        Returns: Json;
      };
      unlockrows: { Args: { "": string }; Returns: number };
      updategeometrysrid: {
        Args: {
          catalogn_name: string;
          column_name: string;
          new_srid_in: number;
          schema_name: string;
          table_name: string;
        };
        Returns: string;
      };
      user_can_act_for_tenant: { Args: { p_tenant: string; p_user: string }; Returns: boolean };
      user_tenant_ids: { Args: Record<PropertyKey, never>; Returns: string[] };
    };
    Enums: {
      bankid_env: "mock" | "test" | "production";
      bankid_status:
        "pending" | "started" | "user_sign" | "complete" | "failed" | "cancelled" | "expired";
      claim_status:
        "created" | "received" | "more_info_required" | "approved" | "rejected" | "closed";
      consent_type:
        | "insurance_connection"
        | "data_sharing"
        | "terms_of_service"
        | "privacy_policy"
        | "marketing";
      damage_type:
        | "parking_damage"
        | "glass_damage"
        | "stone_chip"
        | "collision_damage"
        | "wildlife_collision"
        | "vandalism"
        | "vehicle_break_in"
        | "stolen_vehicle"
        | "fire_damage"
        | "water_damage"
        | "mechanical_damage"
        | "puncture"
        | "misfueling"
        | "key_problem"
        | "battery_problem"
        | "towing_after_accident"
        | "transport_to_workshop"
        | "rental_car_need"
        | "workshop_booking";
      duty_status: "off_duty" | "on_duty" | "on_call" | "busy";
      fuel_type: "petrol" | "diesel" | "electric" | "hybrid" | "plugin_hybrid" | "gas" | "other";
      incident_status:
        | "draft"
        | "awaiting_bankid"
        | "bankid_verified"
        | "signed"
        | "submitted"
        | "received"
        | "more_info_required"
        | "in_progress"
        | "completed"
        | "closed"
        | "cancelled"
        | "rejected";
      incident_type: "towing" | "damage_claim" | "roadside_assistance";
      offer_status: "pending" | "accepted" | "rejected" | "expired" | "cancelled";
      risk_status: "low" | "medium" | "high" | "manual_review_required" | "blocked_until_verified";
      tenant_status: "active" | "suspended" | "pending" | "archived";
      tenant_type:
        | "insurance_company"
        | "tow_company"
        | "fleet_company"
        | "leasing_company"
        | "workshop_partner"
        | "platform_internal";
      tenant_user_status: "active" | "invited" | "suspended";
      tow_job_status:
        | "draft"
        | "awaiting_bankid"
        | "bankid_verified"
        | "signed"
        | "created"
        | "matching"
        | "offered"
        | "accepted"
        | "driver_en_route"
        | "driver_arrived"
        | "vehicle_loaded"
        | "transporting"
        | "delivered"
        | "completed"
        | "invoiced"
        | "closed"
        | "cancelled"
        | "failed"
        | "manual_review";
      tow_problem_type:
        | "car_does_not_start"
        | "puncture"
        | "accident"
        | "engine_failure"
        | "dead_battery"
        | "stuck_snow_mud"
        | "keys_locked_inside"
        | "misfueling"
        | "urgent_traffic_danger"
        | "transport_to_workshop"
        | "ev_out_of_battery"
        | "other";
      tow_vehicle_type:
        | "flatbed"
        | "wheel_lift"
        | "heavy_tow"
        | "motorcycle_tow"
        | "service_van"
        | "battery_service"
        | "tire_service"
        | "crane_truck"
        | "special_transport";
      vehicle_ownership: "private" | "company" | "leasing" | "rental";
    };
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null;
        geom: unknown;
      };
      valid_detail: {
        valid: boolean | null;
        reason: string | null;
        location: unknown;
      };
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      bankid_env: ["mock", "test", "production"],
      bankid_status: [
        "pending",
        "started",
        "user_sign",
        "complete",
        "failed",
        "cancelled",
        "expired",
      ],
      claim_status: ["created", "received", "more_info_required", "approved", "rejected", "closed"],
      consent_type: [
        "insurance_connection",
        "data_sharing",
        "terms_of_service",
        "privacy_policy",
        "marketing",
      ],
      damage_type: [
        "parking_damage",
        "glass_damage",
        "stone_chip",
        "collision_damage",
        "wildlife_collision",
        "vandalism",
        "vehicle_break_in",
        "stolen_vehicle",
        "fire_damage",
        "water_damage",
        "mechanical_damage",
        "puncture",
        "misfueling",
        "key_problem",
        "battery_problem",
        "towing_after_accident",
        "transport_to_workshop",
        "rental_car_need",
        "workshop_booking",
      ],
      duty_status: ["off_duty", "on_duty", "on_call", "busy"],
      fuel_type: ["petrol", "diesel", "electric", "hybrid", "plugin_hybrid", "gas", "other"],
      incident_status: [
        "draft",
        "awaiting_bankid",
        "bankid_verified",
        "signed",
        "submitted",
        "received",
        "more_info_required",
        "in_progress",
        "completed",
        "closed",
        "cancelled",
        "rejected",
      ],
      incident_type: ["towing", "damage_claim", "roadside_assistance"],
      offer_status: ["pending", "accepted", "rejected", "expired", "cancelled"],
      risk_status: ["low", "medium", "high", "manual_review_required", "blocked_until_verified"],
      tenant_status: ["active", "suspended", "pending", "archived"],
      tenant_type: [
        "insurance_company",
        "tow_company",
        "fleet_company",
        "leasing_company",
        "workshop_partner",
        "platform_internal",
      ],
      tenant_user_status: ["active", "invited", "suspended"],
      tow_job_status: [
        "draft",
        "awaiting_bankid",
        "bankid_verified",
        "signed",
        "created",
        "matching",
        "offered",
        "accepted",
        "driver_en_route",
        "driver_arrived",
        "vehicle_loaded",
        "transporting",
        "delivered",
        "completed",
        "invoiced",
        "closed",
        "cancelled",
        "failed",
        "manual_review",
      ],
      tow_problem_type: [
        "car_does_not_start",
        "puncture",
        "accident",
        "engine_failure",
        "dead_battery",
        "stuck_snow_mud",
        "keys_locked_inside",
        "misfueling",
        "urgent_traffic_danger",
        "transport_to_workshop",
        "ev_out_of_battery",
        "other",
      ],
      tow_vehicle_type: [
        "flatbed",
        "wheel_lift",
        "heavy_tow",
        "motorcycle_tow",
        "service_van",
        "battery_service",
        "tire_service",
        "crane_truck",
        "special_transport",
      ],
      vehicle_ownership: ["private", "company", "leasing", "rental"],
    },
  },
} as const;
