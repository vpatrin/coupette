// API response types — mirrors backend Pydantic *Out schemas

export interface ProductOut {
  sku: string
  name: string | null
  category: string | null
  country: string | null
  size: string | null
  price: string | null // Decimal serialized as string
  online_availability: boolean | null
  rating: number | null
  review_count: number | null
  region: string | null
  appellation: string | null
  designation: string | null
  classification: string | null
  grape: string | null
  grape_blend: Record<string, unknown>[] | null
  alcohol: string | null
  sugar: string | null
  producer: string | null
  vintage: string | null
  taste_tag: string | null
  created_at: string
  updated_at: string
}

export interface WatchOut {
  id: number
  user_id: string
  sku: string
  created_at: string
}

export interface WatchWithProduct {
  watch: WatchOut
  product: ProductOut | null
}
