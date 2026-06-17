export type Product = {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  unit: string;
  low_stock_threshold: number;
  is_active: boolean;
  created_at: string;
};

export type ProductPage = {
  items: Product[];
  total: number;
  limit: number;
  offset: number;
};

export type ProductBatch = {
  id: string;
  product_id: string;
  manufacturer_id: string;
  batch_number: string;
  quantity: number;
  status: "DRAFT" | "RELEASED_TO_WAREHOUSE" | "RECEIVED_AT_WAREHOUSE" | "CANCELLED";
  produced_at: string;
  released_at: string | null;
  received_at: string | null;
  created_at: string;
};

export type WarehouseRecord = {
  id: string;
  name: string;
  location: string | null;
  manager_id: string | null;
  is_active: boolean;
  created_at: string;
};

export type HubRecord = {
  id: string;
  name: string;
  location: string | null;
  warehouse_id: string;
  manager_id: string | null;
  is_active: boolean;
  created_at: string;
};

export type AllocationRequest = {
  id: string;
  product_id: string;
  requested_by: string;
  approved_by: string | null;
  warehouse_id: string | null;
  hub_id: string | null;
  quantity: number;
  approved_quantity: number | null;
  reviewed_by: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "FULFILLED" | "CANCELLED";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DispatchOrder = {
  id: string;
  allocation_request_id: string | null;
  product_id: string;
  dispatched_by: string | null;
  quantity: number;
  status: "DRAFT" | "DISPATCHED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";
  from_location_type: string;
  from_location_id: string;
  to_location_type: string;
  to_location_id: string;
  dispatched_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryBalance = {
  id: string;
  product_id: string;
  location_type: "MANUFACTURER" | "WAREHOUSE" | "HUB" | "AGENT";
  location_id: string;
  quantity: number;
  reserved_quantity: number;
  updated_at: string;
};

export type InventoryTransaction = {
  id: string;
  product_id: string;
  transaction_type: string;
  quantity: number;
  from_location_type: string | null;
  from_location_id: string | null;
  to_location_type: string | null;
  to_location_id: string | null;
  reference_id: string | null;
  reference_type: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
};

export type AgentRecord = {
  id: string;
  name: string;
  phone: string | null;
  hub_id: string;
  agent_code: string;
  is_active: boolean;
};

export type AgentAllocationRecord = {
  id: string;
  agent_id: string;
  product_id: string;
  quantity: number;
  status: "PENDING" | "HANDED_OVER";
  created_at: string;
};