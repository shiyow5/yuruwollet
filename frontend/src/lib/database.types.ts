export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_openings: {
        Row: {
          account_id: string
          created_at: string
          household_id: string
          member_id: string
          opening_balance: number
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          household_id: string
          member_id: string
          opening_balance?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          household_id?: string
          member_id?: string
          opening_balance?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_openings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_openings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "account_openings_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_openings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "account_openings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "account_openings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "v_member_balances"
            referencedColumns: ["member_id"]
          },
        ]
      }
      accounts: {
        Row: {
          created_at: string
          household_id: string
          icon: string | null
          id: string
          is_archived: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          household_id: string
          icon?: string | null
          id?: string
          is_archived?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          household_id?: string
          icon?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      balance_checkpoints: {
        Row: {
          actual: number | null
          checkpoint_month: string
          computed: number | null
          created_at: string
          diff: number | null
          household_id: string
          id: string
          member_id: string
          status: Database["public"]["Enums"]["checkpoint_status"]
          updated_at: string
        }
        Insert: {
          actual?: number | null
          checkpoint_month: string
          computed?: number | null
          created_at?: string
          diff?: number | null
          household_id: string
          id?: string
          member_id: string
          status: Database["public"]["Enums"]["checkpoint_status"]
          updated_at?: string
        }
        Update: {
          actual?: number | null
          checkpoint_month?: string
          computed?: number | null
          created_at?: string
          diff?: number | null
          household_id?: string
          id?: string
          member_id?: string
          status?: Database["public"]["Enums"]["checkpoint_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "balance_checkpoints_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_checkpoints_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "balance_checkpoints_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "balance_checkpoints_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "v_member_balances"
            referencedColumns: ["member_id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          household_id: string
          icon: string | null
          id: string
          is_archived: boolean
          is_default: boolean
          is_system: boolean
          kind: Database["public"]["Enums"]["category_kind"]
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          household_id: string
          icon?: string | null
          id?: string
          is_archived?: boolean
          is_default?: boolean
          is_system?: boolean
          kind: Database["public"]["Enums"]["category_kind"]
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          household_id?: string
          icon?: string | null
          id?: string
          is_archived?: boolean
          is_default?: boolean
          is_system?: boolean
          kind?: Database["public"]["Enums"]["category_kind"]
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          base: string
          created_at: string
          quote: string
          rate: number
          rate_date: string
        }
        Insert: {
          base?: string
          created_at?: string
          quote?: string
          rate: number
          rate_date: string
        }
        Update: {
          base?: string
          created_at?: string
          quote?: string
          rate?: number
          rate_date?: string
        }
        Relationships: []
      }
      households: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          email: string | null
          household_id: string
          member_id: string
          opening_balance: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          email?: string | null
          household_id: string
          member_id: string
          opening_balance?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string | null
          household_id?: string
          member_id?: string
          opening_balance?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_goals: {
        Row: {
          created_at: string
          household_id: string
          id: string
          member_id: string
          period_month: string
          target_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          member_id: string
          period_month: string
          target_amount: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          member_id?: string
          period_month?: string
          target_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_goals_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_goals_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "savings_goals_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "savings_goals_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "v_member_balances"
            referencedColumns: ["member_id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount_jpy: number
          created_at: string
          currency: Database["public"]["Enums"]["sub_currency"]
          cycle: Database["public"]["Enums"]["sub_cycle"]
          fx_rate: number | null
          fx_rate_date: string | null
          household_id: string
          id: string
          monthly_amount_jpy: number | null
          name: string
          next_renewal_date: string
          original_amount: number
          owner_member_id: string
          renewal_anchor_day: number | null
          status: Database["public"]["Enums"]["sub_status"]
          updated_at: string
        }
        Insert: {
          amount_jpy: number
          created_at?: string
          currency?: Database["public"]["Enums"]["sub_currency"]
          cycle?: Database["public"]["Enums"]["sub_cycle"]
          fx_rate?: number | null
          fx_rate_date?: string | null
          household_id: string
          id?: string
          monthly_amount_jpy?: number | null
          name: string
          next_renewal_date: string
          original_amount: number
          owner_member_id: string
          renewal_anchor_day?: number | null
          status?: Database["public"]["Enums"]["sub_status"]
          updated_at?: string
        }
        Update: {
          amount_jpy?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["sub_currency"]
          cycle?: Database["public"]["Enums"]["sub_cycle"]
          fx_rate?: number | null
          fx_rate_date?: string | null
          household_id?: string
          id?: string
          monthly_amount_jpy?: number | null
          name?: string
          next_renewal_date?: string
          original_amount?: number
          owner_member_id?: string
          renewal_anchor_day?: number | null
          status?: Database["public"]["Enums"]["sub_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "subscriptions_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "subscriptions_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "v_member_balances"
            referencedColumns: ["member_id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string | null
          amount: number
          category_id: string | null
          created_at: string
          household_id: string
          id: string
          is_system_generated: boolean
          memo: string
          occurred_on: string
          owner_member_id: string
          subscription_id: string | null
          type: Database["public"]["Enums"]["txn_type"]
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          category_id?: string | null
          created_at?: string
          household_id: string
          id?: string
          is_system_generated?: boolean
          memo?: string
          occurred_on: string
          owner_member_id: string
          subscription_id?: string | null
          type: Database["public"]["Enums"]["txn_type"]
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          category_id?: string | null
          created_at?: string
          household_id?: string
          id?: string
          is_system_generated?: boolean
          memo?: string
          occurred_on?: string
          owner_member_id?: string
          subscription_id?: string | null
          type?: Database["public"]["Enums"]["txn_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "transactions_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "transactions_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "v_member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "transactions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlist_items: {
        Row: {
          archived: boolean
          created_at: string
          genre: Database["public"]["Enums"]["wish_genre"]
          household_id: string
          id: string
          memo: string
          registrant_id: string
          status: Database["public"]["Enums"]["wish_status"]
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          archived?: boolean
          created_at?: string
          genre: Database["public"]["Enums"]["wish_genre"]
          household_id: string
          id?: string
          memo?: string
          registrant_id: string
          status?: Database["public"]["Enums"]["wish_status"]
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          archived?: boolean
          created_at?: string
          genre?: Database["public"]["Enums"]["wish_genre"]
          household_id?: string
          id?: string
          memo?: string
          registrant_id?: string
          status?: Database["public"]["Enums"]["wish_status"]
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_items_registrant_id_fkey"
            columns: ["registrant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "wishlist_items_registrant_id_fkey"
            columns: ["registrant_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "wishlist_items_registrant_id_fkey"
            columns: ["registrant_id"]
            isOneToOne: false
            referencedRelation: "v_member_balances"
            referencedColumns: ["member_id"]
          },
        ]
      }
    }
    Views: {
      v_account_balances: {
        Row: {
          account_icon: string | null
          account_id: string | null
          account_name: string | null
          balance: number | null
          household_id: string | null
          is_archived: boolean | null
          member_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      v_category_breakdown: {
        Row: {
          category_icon: string | null
          category_id: string | null
          category_name: string | null
          household_id: string | null
          member_id: string | null
          month: string | null
          total: number | null
          type: Database["public"]["Enums"]["txn_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_owner_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "transactions_owner_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "transactions_owner_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "v_member_balances"
            referencedColumns: ["member_id"]
          },
        ]
      }
      v_member_balances: {
        Row: {
          balance: number | null
          display_name: string | null
          household_id: string | null
          member_id: string | null
        }
        Insert: {
          balance?: never
          display_name?: string | null
          household_id?: string | null
          member_id?: string | null
        }
        Update: {
          balance?: never
          display_name?: string | null
          household_id?: string | null
          member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      v_monthly_summary: {
        Row: {
          expense: number | null
          household_id: string | null
          income: number | null
          member_id: string | null
          month: string | null
          net: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_owner_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "transactions_owner_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "transactions_owner_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "v_member_balances"
            referencedColumns: ["member_id"]
          },
        ]
      }
      v_savings_progress: {
        Row: {
          achieved: boolean | null
          household_id: string | null
          member_id: string | null
          period_month: string | null
          saved: number | null
          target_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "savings_goals_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_goals_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "savings_goals_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "savings_goals_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "v_member_balances"
            referencedColumns: ["member_id"]
          },
        ]
      }
      v_subscription_monthly_total: {
        Row: {
          household_id: string | null
          member_id: string | null
          monthly_total_jpy: number | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_owner_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "subscriptions_owner_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "subscriptions_owner_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "v_member_balances"
            referencedColumns: ["member_id"]
          },
        ]
      }
    }
    Functions: {
      adjust_balance_now: {
        Args: { p_actual: number; p_expected_computed: number }
        Returns: number
      }
      confirm_balance_checkpoint: {
        Args: { p_actual: number; p_expected_computed: number }
        Returns: {
          actual: number | null
          checkpoint_month: string
          computed: number | null
          created_at: string
          diff: number | null
          household_id: string
          id: string
          member_id: string
          status: Database["public"]["Enums"]["checkpoint_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "balance_checkpoints"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_subscription: {
        Args: { p_delete_payments?: boolean; p_subscription_id: string }
        Returns: number
      }
      jst_today: { Args: never; Returns: string }
      next_renewal_after: {
        Args: {
          p_anchor: number
          p_current: string
          p_cycle: Database["public"]["Enums"]["sub_cycle"]
        }
        Returns: string
      }
      settle_my_subscriptions: { Args: never; Returns: number }
      settle_subscription: {
        Args: { p_subscription_id: string }
        Returns: {
          needs_fx_on: string
          recorded: number
        }[]
      }
    }
    Enums: {
      category_kind: "expense" | "income" | "system"
      checkpoint_status: "skipped" | "confirmed"
      sub_currency: "JPY" | "USD"
      sub_cycle: "monthly" | "yearly"
      sub_status: "active" | "trial" | "considering_cancel"
      txn_type: "income" | "expense"
      wish_genre: "want" | "place"
      wish_status: "planned" | "done"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      category_kind: ["expense", "income", "system"],
      checkpoint_status: ["skipped", "confirmed"],
      sub_currency: ["JPY", "USD"],
      sub_cycle: ["monthly", "yearly"],
      sub_status: ["active", "trial", "considering_cancel"],
      txn_type: ["income", "expense"],
      wish_genre: ["want", "place"],
      wish_status: ["planned", "done"],
    },
  },
} as const

