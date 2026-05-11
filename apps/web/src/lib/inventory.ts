import { apiRequest } from "./api";

export type StockArrival = {
  id: string;
  referenceCode: string;
  sourceName: string | null;
  shipmentReference: string | null;
  notes: string | null;
  status: string;
  receivedAt: string;
  createdAt: string;
  receivedByName: string | null;
  itemCount: number;
  totalQuantityReceived: number;
  totalDamagedQuantity: number;
  totalCostRwf: number;
};

export type StockArrivalItem = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  brand: string | null;
  model: string | null;
  quantityReceived: number;
  damagedQuantity: number;
  unitCostRwf: number;
  totalCostRwf: number;
  note: string | null;
};

export type StockMovement = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  movementType: string;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  sourceType: string;
  sourceId: string | null;
  reason: string | null;
  actorName: string | null;
  createdAt: string;
};

export type CreateStockArrivalInput = {
  referenceCode?: string;
  sourceName?: string;
  shipmentReference?: string;
  notes?: string;
  receivedAt?: string;
  items: {
    productId: string;
    quantityReceived: number;
    damagedQuantity: number;
    unitCostRwf: number;
    note?: string;
  }[];
};

export async function getNextShipmentReference(token: string) {
  return apiRequest<{ ok: true; shipmentReference: string }>(
    "/inventory/next-shipment-reference",
    {
      method: "GET",
      token,
    },
  );
}

export async function getStockArrivals(token: string) {
  return apiRequest<{ ok: true; arrivals: StockArrival[] }>(
    "/inventory/arrivals",
    {
      method: "GET",
      token,
    },
  );
}

export async function getStockArrival(token: string, id: string) {
  return apiRequest<{
    ok: true;
    arrival: Omit<
      StockArrival,
      | "itemCount"
      | "totalQuantityReceived"
      | "totalDamagedQuantity"
      | "totalCostRwf"
    >;
    items: StockArrivalItem[];
  }>(`/inventory/arrivals/${id}`, {
    method: "GET",
    token,
  });
}

export async function createStockArrival(
  token: string,
  input: CreateStockArrivalInput,
) {
  return apiRequest<{
    ok: true;
    arrival: StockArrival;
    items: StockArrivalItem[];
  }>("/inventory/arrivals", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export async function getStockMovements(token: string, productId?: string) {
  const query = productId ? `?productId=${encodeURIComponent(productId)}` : "";

  return apiRequest<{ ok: true; movements: StockMovement[] }>(
    `/inventory/movements${query}`,
    {
      method: "GET",
      token,
    },
  );
}
