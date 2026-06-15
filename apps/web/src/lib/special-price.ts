import { apiRequest } from "./api";

export type SpecialPriceRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired";

export type SpecialPriceRequest = {
  id: string;
  productId: string;
  sellerId: string;
  approverId: string | null;
  requestedPriceRwf: number;
  normalPriceRwf: number;
  minimumPriceRwf: number;
  quantity: number;
  reason: string;
  status: SpecialPriceRequestStatus;
  decisionNote: string | null;
  expiresAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PendingSpecialPriceRequest = {
  id: string;
  productId: string;
  productName: string | null;
  productSku: string | null;
  sellerId: string;
  sellerName: string | null;
  requestedPriceRwf: number;
  normalPriceRwf: number;
  minimumPriceRwf: number;
  quantity: number;
  reason: string;
  status: "pending";
  expiresAt: string | null;
  createdAt: string;
};

export async function requestSpecialPrice(
  token: string,
  input: {
    productId: string;
    requestedPriceRwf: number;
    quantity: number;
    reason: string;
  },
) {
  return apiRequest<{ ok: true; request: SpecialPriceRequest }>(
    "/special-price/request",
    {
      method: "POST",
      token,
      body: JSON.stringify(input),
    },
  );
}

export async function getPendingSpecialPriceRequests(token: string) {
  return apiRequest<{ ok: true; requests: PendingSpecialPriceRequest[] }>(
    "/special-price/pending",
    {
      method: "GET",
      token,
    },
  );
}

export async function approveSpecialPriceRequest(
  token: string,
  id: string,
  decisionNote?: string,
) {
  return apiRequest<{ ok: true; request: SpecialPriceRequest }>(
    `/special-price/${id}/approve`,
    {
      method: "POST",
      token,
      body: JSON.stringify({ decisionNote }),
    },
  );
}

export async function rejectSpecialPriceRequest(
  token: string,
  id: string,
  decisionNote?: string,
) {
  return apiRequest<{ ok: true; request: SpecialPriceRequest }>(
    `/special-price/${id}/reject`,
    {
      method: "POST",
      token,
      body: JSON.stringify({ decisionNote }),
    },
  );
}
