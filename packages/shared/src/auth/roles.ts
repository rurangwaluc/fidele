export const USER_ROLES = {
  OWNER: "owner",
  EMPLOYEE: "employee",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const RESPONSIBILITY_GROUPS = {
  ADMIN_HELPER: "admin_helper",
  MANAGER: "manager",
  SELLER: "seller",
  CASHIER: "cashier",
  STOREKEEPER: "storekeeper",
} as const;

export type ResponsibilityGroup =
  (typeof RESPONSIBILITY_GROUPS)[keyof typeof RESPONSIBILITY_GROUPS];

export const RESPONSIBILITY_GROUP_LABELS: Record<ResponsibilityGroup, string> =
  {
    admin_helper: "Admin Helper",
    manager: "Manager",
    seller: "Seller",
    cashier: "Cashier",
    storekeeper: "Storekeeper",
  };
