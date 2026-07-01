export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      brand_categories: {
        Row: {
          brand_id: string
          category_id: string
          created_at: string
          id: string
        }
        Insert: {
          brand_id: string
          category_id: string
          created_at?: string
          id?: string
        }
        Update: {
          brand_id?: string
          category_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_categories_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          segment: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          segment: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          segment?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      design_style_tags: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      designers: {
        Row: {
          bio: string | null
          created_at: string
          id: string
          name: string
          photo_url: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          id?: string
          name: string
          photo_url?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          id?: string
          name?: string
          photo_url?: string | null
        }
        Relationships: []
      }
      environments: {
        Row: {
          created_at: string
          icon: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          icon?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      featured_designers: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          name: string
          photo_url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name: string
          photo_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name?: string
          photo_url?: string | null
        }
        Relationships: []
      }
      featured_products: {
        Row: {
          created_at: string
          display_order: number
          id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          product_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "featured_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      finish_categories: {
        Row: {
          brand_id: string
          created_at: string
          display_order: number
          finish_group: string
          id: string
          name: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          display_order?: number
          finish_group?: string
          id?: string
          name: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          display_order?: number
          finish_group?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "finish_categories_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      finishes: {
        Row: {
          created_at: string
          display_order: number
          finish_category_id: string
          id: string
          image_url: string
          name: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          finish_category_id: string
          id?: string
          image_url: string
          name: string
        }
        Update: {
          created_at?: string
          display_order?: number
          finish_category_id?: string
          id?: string
          image_url?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "finishes_finish_category_id_fkey"
            columns: ["finish_category_id"]
            isOneToOne: false
            referencedRelation: "finish_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_images: {
        Row: {
          alt_text: string | null
          created_at: string
          display_order: number
          id: string
          image_url: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
        }
        Relationships: []
      }
      marketing_events: {
        Row: {
          created_at: string
          description: string | null
          event_date: string
          event_type: string
          id: string
          preview_image_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_date: string
          event_type?: string
          id?: string
          preview_image_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          event_date?: string
          event_type?: string
          id?: string
          preview_image_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      price_brands: {
        Row: {
          created_at: string
          default_markup_percent: number
          id: string
          name: string
          slug: string
          source_brand_name: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_markup_percent?: number
          id?: string
          name: string
          slug: string
          source_brand_name?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_markup_percent?: number
          id?: string
          name?: string
          slug?: string
          source_brand_name?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_brands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      price_categories: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          name: string
          slug: string
          source_category_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          name: string
          slug: string
          source_category_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          name?: string
          slug?: string
          source_category_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_categories_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "price_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      price_finishes: {
        Row: {
          brand_id: string
          code: string | null
          created_at: string
          finish_type: string | null
          id: string
          name: string
          slug: string
          source_finish_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          code?: string | null
          created_at?: string
          finish_type?: string | null
          id?: string
          name: string
          slug: string
          source_finish_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          code?: string | null
          created_at?: string
          finish_type?: string | null
          id?: string
          name?: string
          slug?: string
          source_finish_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_finishes_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "price_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_finishes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      price_product_variations: {
        Row: {
          brand_id: string
          category_id: string
          created_at: string
          description: string | null
          dimensions: string | null
          id: string
          module: string | null
          product_id: string
          source_variation_id: string | null
          tenant_id: string
          updated_at: string
          variation_code: string | null
          variation_name: string | null
        }
        Insert: {
          brand_id: string
          category_id: string
          created_at?: string
          description?: string | null
          dimensions?: string | null
          id?: string
          module?: string | null
          product_id: string
          source_variation_id?: string | null
          tenant_id: string
          updated_at?: string
          variation_code?: string | null
          variation_name?: string | null
        }
        Update: {
          brand_id?: string
          category_id?: string
          created_at?: string
          description?: string | null
          dimensions?: string | null
          id?: string
          module?: string | null
          product_id?: string
          source_variation_id?: string | null
          tenant_id?: string
          updated_at?: string
          variation_code?: string | null
          variation_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_product_variations_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "price_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_product_variations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "price_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_product_variations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "price_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_product_variations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      price_products: {
        Row: {
          brand_id: string
          category_id: string
          created_at: string
          description: string | null
          designer: string | null
          id: string
          markup_percent: number | null
          name: string
          reference_code: string | null
          slug: string
          source_product_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          category_id: string
          created_at?: string
          description?: string | null
          designer?: string | null
          id?: string
          markup_percent?: number | null
          name: string
          reference_code?: string | null
          slug: string
          source_product_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          category_id?: string
          created_at?: string
          description?: string | null
          designer?: string | null
          id?: string
          markup_percent?: number | null
          name?: string
          reference_code?: string | null
          slug?: string
          source_product_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "price_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "price_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      price_table: {
        Row: {
          brand_id: string
          category_id: string
          created_at: string
          currency: string
          finish_id: string
          id: string
          price: number
          product_id: string
          source_price_id: string | null
          source_reference: string | null
          tenant_id: string
          updated_at: string
          variation_id: string
        }
        Insert: {
          brand_id: string
          category_id: string
          created_at?: string
          currency?: string
          finish_id: string
          id?: string
          price: number
          product_id: string
          source_price_id?: string | null
          source_reference?: string | null
          tenant_id: string
          updated_at?: string
          variation_id: string
        }
        Update: {
          brand_id?: string
          category_id?: string
          created_at?: string
          currency?: string
          finish_id?: string
          id?: string
          price?: number
          product_id?: string
          source_price_id?: string | null
          source_reference?: string | null
          tenant_id?: string
          updated_at?: string
          variation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_table_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "price_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_table_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "price_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_table_finish_id_fkey"
            columns: ["finish_id"]
            isOneToOne: false
            referencedRelation: "price_finishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_table_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "price_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_table_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_table_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "price_product_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_downloads: {
        Row: {
          created_at: string
          display_order: number
          download_type: string
          id: string
          label: string
          product_id: string
          url: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          download_type: string
          id?: string
          label: string
          product_id: string
          url: string
        }
        Update: {
          created_at?: string
          display_order?: number
          download_type?: string
          id?: string
          label?: string
          product_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_downloads_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_environments: {
        Row: {
          created_at: string
          environment_id: string
          id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          environment_id: string
          id?: string
          product_id: string
        }
        Update: {
          created_at?: string
          environment_id?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_environments_environment_id_fkey"
            columns: ["environment_id"]
            isOneToOne: false
            referencedRelation: "environments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_environments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_finish_categories: {
        Row: {
          created_at: string
          finish_category_id: string
          id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          finish_category_id: string
          id?: string
          product_id: string
        }
        Update: {
          created_at?: string
          finish_category_id?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_finish_categories_finish_category_id_fkey"
            columns: ["finish_category_id"]
            isOneToOne: false
            referencedRelation: "finish_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_finish_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_style_tags: {
        Row: {
          created_at: string
          id: string
          product_id: string
          style_tag_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          style_tag_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          style_tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_style_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_style_tags_style_tag_id_fkey"
            columns: ["style_tag_id"]
            isOneToOne: false
            referencedRelation: "design_style_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          ambient_images: string[] | null
          brand_id: string
          category: string
          created_at: string
          description: string | null
          designer_id: string | null
          file_2d: string | null
          file_3d: string | null
          finish_link: string | null
          id: string
          images: string[] | null
          name: string
          tech_sheet: string | null
        }
        Insert: {
          ambient_images?: string[] | null
          brand_id: string
          category: string
          created_at?: string
          description?: string | null
          designer_id?: string | null
          file_2d?: string | null
          file_3d?: string | null
          finish_link?: string | null
          id?: string
          images?: string[] | null
          name: string
          tech_sheet?: string | null
        }
        Update: {
          ambient_images?: string[] | null
          brand_id?: string
          category?: string
          created_at?: string
          description?: string | null
          designer_id?: string | null
          file_2d?: string | null
          file_3d?: string | null
          finish_link?: string | null
          id?: string
          images?: string[] | null
          name?: string
          tech_sheet?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approved: boolean
          created_at: string
          full_name: string | null
          id: string
          seller_id: string | null
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          approved?: boolean
          created_at?: string
          full_name?: string | null
          id?: string
          seller_id?: string | null
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          approved?: boolean
          created_at?: string
          full_name?: string | null
          id?: string
          seller_id?: string | null
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_environment_images: {
        Row: {
          created_at: string
          display_order: number
          environment_name: string
          id: string
          image_url: string
          project_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          environment_name: string
          id?: string
          image_url: string
          project_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          environment_name?: string
          id?: string
          image_url?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_environment_images_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_item_checklist: {
        Row: {
          check_key: string
          checked: boolean
          created_at: string
          id: string
          project_item_id: string
        }
        Insert: {
          check_key: string
          checked?: boolean
          created_at?: string
          id?: string
          project_item_id: string
        }
        Update: {
          check_key?: string
          checked?: boolean
          created_at?: string
          id?: string
          project_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_item_checklist_project_item_id_fkey"
            columns: ["project_item_id"]
            isOneToOne: false
            referencedRelation: "project_items"
            referencedColumns: ["id"]
          },
        ]
      }
      project_items: {
        Row: {
          created_at: string
          discount_price: number | null
          environment_label: string | null
          id: string
          notes: string | null
          presentation_image_2_index: number | null
          presentation_dimensions: string | null
          price: number | null
          product_id: string
          project_id: string
          quantity: number
          selected_finish_id: string | null
          selected_finish_id_2: string | null
        }
        Insert: {
          created_at?: string
          discount_price?: number | null
          environment_label?: string | null
          id?: string
          notes?: string | null
          presentation_image_2_index?: number | null
          presentation_dimensions?: string | null
          price?: number | null
          product_id: string
          project_id: string
          quantity?: number
          selected_finish_id?: string | null
          selected_finish_id_2?: string | null
        }
        Update: {
          created_at?: string
          discount_price?: number | null
          environment_label?: string | null
          id?: string
          notes?: string | null
          presentation_image_2_index?: number | null
          presentation_dimensions?: string | null
          price?: number | null
          product_id?: string
          project_id?: string
          quantity?: number
          selected_finish_id?: string | null
          selected_finish_id_2?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_selected_finish_id_2_fkey"
            columns: ["selected_finish_id_2"]
            isOneToOne: false
            referencedRelation: "finishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_selected_finish_id_fkey"
            columns: ["selected_finish_id"]
            isOneToOne: false
            referencedRelation: "finishes"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          architect_name: string | null
          client_name: string | null
          consultant_name: string | null
          created_at: string
          id: string
          name: string
          share_token: string | null
          user_id: string
        }
        Insert: {
          architect_name?: string | null
          client_name?: string | null
          consultant_name?: string | null
          created_at?: string
          id?: string
          name: string
          share_token?: string | null
          user_id: string
        }
        Update: {
          architect_name?: string | null
          client_name?: string | null
          consultant_name?: string | null
          created_at?: string
          id?: string
          name?: string
          share_token?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          primary_color: string | null
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          primary_color?: string | null
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          slug?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      price_search_index: {
        Row: {
          base_price: number | null
          brand_id: string | null
          brand_markup_percent: number | null
          brand_name: string | null
          category_id: string | null
          category_name: string | null
          currency: string | null
          dimensions: string | null
          finish_code: string | null
          finish_id: string | null
          finish_name: string | null
          finish_type: string | null
          markup_percent: number | null
          module: string | null
          price: number | null
          price_id: string | null
          product_id: string | null
          product_markup_percent: number | null
          product_name: string | null
          reference_code: string | null
          source_product_id: string | null
          source_reference: string | null
          tenant_id: string | null
          variation_code: string | null
          variation_id: string | null
          variation_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_table_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "price_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_table_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "price_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_table_finish_id_fkey"
            columns: ["finish_id"]
            isOneToOne: false
            referencedRelation: "price_finishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_table_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "price_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_table_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_table_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "price_product_variations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_access_profile: {
        Args: { _profile_user_id: string; _viewer_id: string }
        Returns: boolean
      }
      current_tenant_id: { Args: never; Returns: string }
      get_shared_project_by_token: { Args: { _token: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
      is_seller: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      list_sellers: {
        Args: never
        Returns: {
          full_name: string
          user_id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user" | "vendedor"
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
  public: {
    Enums: {
      app_role: ["admin", "user", "vendedor"],
    },
  },
} as const
