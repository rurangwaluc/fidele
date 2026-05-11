import { apiRequest } from "./api";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "owner" | "employee";
  permissions: string[];
};

export type LoginResponse = {
  ok: true;
  token: string;
  user: Omit<AuthUser, "permissions">;
};

export type MeResponse = {
  ok: true;
  user: AuthUser;
};

export function saveToken(token: string) {
  localStorage.setItem("erc_token", token);
}

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("erc_token");
}

export function clearToken() {
  localStorage.removeItem("erc_token");
}

export async function loginUser(email: string, password: string) {
  return apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function getCurrentUser(token: string) {
  return apiRequest<MeResponse>("/auth/me", {
    method: "GET",
    token,
  });
}

export async function logoutUser(token: string) {
  return apiRequest<{ ok: true; message: string }>("/auth/logout", {
    method: "POST",
    token,
  });
}
