import { apiRequest } from "./api";

export type ResponsibilityGroupOption = {
  key: string;
  label: string;
};

export type StaffUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "owner" | "employee";
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  responsibilityGroups: {
    key: string;
    name: string;
  }[];
  extraPermissions: string[];
};

export type StaffListResponse = {
  ok: true;
  staff: StaffUser[];
};

export type AccessOptionsResponse = {
  ok: true;
  responsibilityGroups: ResponsibilityGroupOption[];
  permissions: string[];
};

export type CreateStaffInput = {
  name: string;
  email: string;
  phone?: string;
  password: string;
  responsibilityGroupKeys: string[];
  extraPermissionKeys: string[];
};

export type UpdateStaffDetailsInput = {
  name?: string;
  email?: string;
  phone?: string;
};

export type UpdateStaffAccessInput = {
  responsibilityGroupKeys: string[];
  extraPermissionKeys: string[];
};

export type ResetStaffPasswordInput = {
  password: string;
};

export async function getStaff(token: string) {
  return apiRequest<StaffListResponse>("/staff", {
    method: "GET",
    token,
  });
}

export async function getStaffAccessOptions(token: string) {
  return apiRequest<AccessOptionsResponse>("/staff/access-options", {
    method: "GET",
    token,
  });
}

export async function createStaff(token: string, input: CreateStaffInput) {
  return apiRequest<{ ok: true; staff: StaffUser }>("/staff", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export async function updateStaffDetails(
  token: string,
  id: string,
  input: UpdateStaffDetailsInput,
) {
  return apiRequest<{ ok: true; staff: StaffUser }>(`/staff/${id}/details`, {
    method: "PATCH",
    token,
    body: JSON.stringify(input),
  });
}

export async function updateStaffAccess(
  token: string,
  id: string,
  input: UpdateStaffAccessInput,
) {
  return apiRequest<{ ok: true; message: string }>(`/staff/${id}/access`, {
    method: "PATCH",
    token,
    body: JSON.stringify(input),
  });
}

export async function resetStaffPassword(
  token: string,
  id: string,
  input: ResetStaffPasswordInput,
) {
  return apiRequest<{ ok: true; message: string }>(
    `/staff/${id}/reset-password`,
    {
      method: "PATCH",
      token,
      body: JSON.stringify(input),
    },
  );
}

export async function deactivateStaff(token: string, id: string) {
  return apiRequest<{ ok: true; message: string }>(`/staff/${id}/deactivate`, {
    method: "PATCH",
    token,
  });
}

export async function activateStaff(token: string, id: string) {
  return apiRequest<{ ok: true; message: string }>(`/staff/${id}/activate`, {
    method: "PATCH",
    token,
  });
}
