import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { db } from "@erc/db";
import { requireAuth } from "../auth/auth.middleware.js";
import { sql } from "drizzle-orm";
import { z } from "zod";

type BankAccount = {
  bankName: string;
  accountName?: string | null;
  accountNumber: string;
  notes?: string | null;
};

type ShopSettingsRow = {
  id: string;
  settings_key: string;

  business_name: string | null;
  shop_name: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  tin: string | null;
  momo_code: string | null;
  logo_url: string | null;
  bank_accounts: unknown;

  report_business_name: string | null;
  report_footer_text: string | null;

  currency: string;

  require_open_cash_for_sales: boolean;
  require_open_cash_for_debt_payments: boolean;
  require_open_cash_for_paid_expenses: boolean;
  allow_owner_cash_reopen: boolean;

  created_at: Date | string;
  updated_at: Date | string;
};

type ShopSettings = {
  id: string;

  business: {
    businessName: string | null;
    shopName: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    address: string | null;
    tin: string | null;
    momoCode: string | null;
    logoUrl: string | null;
    bankAccounts: BankAccount[];
  };

  report: {
    reportBusinessName: string | null;
    reportFooterText: string | null;
  };

  system: {
    currency: string;
  };

  cashRules: {
    requireOpenCashForSales: boolean;
    requireOpenCashForDebtPayments: boolean;
    requireOpenCashForPaidExpenses: boolean;
    allowOwnerCashReopen: boolean;
  };

  createdAt: string;
  updatedAt: string;
};

const bankAccountSchema = z.object({
  bankName: z.string().trim().min(2).max(80),
  accountName: z.string().trim().max(120).optional(),
  accountNumber: z.string().trim().min(2).max(80),
  notes: z.string().trim().max(200).optional(),
});

const updateBusinessSettingsSchema = z.object({
  businessName: z.string().trim().min(2).max(140).optional(),
  shopName: z.string().trim().min(2).max(140).optional(),
  phone: z.string().trim().max(60).optional(),
  email: z.string().trim().max(140).optional(),
  website: z.string().trim().max(180).optional(),
  address: z.string().trim().max(220).optional(),
  tin: z.string().trim().max(80).optional(),
  momoCode: z.string().trim().max(80).optional(),
  logoUrl: z.string().trim().max(400).optional(),
  bankAccounts: z.array(bankAccountSchema).max(8).optional(),
});

const updateReportSettingsSchema = z.object({
  reportBusinessName: z.string().trim().min(2).max(140).optional(),
  reportFooterText: z.string().trim().min(2).max(260).optional(),
});

const updateCashRulesSchema = z.object({
  requireOpenCashForSales: z.boolean().optional(),
  requireOpenCashForDebtPayments: z.boolean().optional(),
  requireOpenCashForPaidExpenses: z.boolean().optional(),
  allowOwnerCashReopen: z.boolean().optional(),
});

const updateSystemSettingsSchema = z.object({
  currency: z.string().trim().min(1).max(20).optional(),
});

function cleanNullable(value: string | null | undefined) {
  if (value === undefined) return undefined;

  const clean = value?.trim();

  return clean ? clean : null;
}

function pick<T>(nextValue: T | undefined, currentValue: T) {
  return nextValue === undefined ? currentValue : nextValue;
}

function normalizeDate(value: Date | string) {
  return new Date(value).toISOString();
}

function normalizeBankAccounts(value: unknown): BankAccount[] {
  if (Array.isArray(value)) {
    return value as BankAccount[];
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);

      return Array.isArray(parsed) ? (parsed as BankAccount[]) : [];
    } catch {
      return [];
    }
  }

  return [];
}

function getRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray((result as { rows: unknown[] }).rows)
  ) {
    return (result as { rows: T[] }).rows;
  }

  return [];
}

function toSettings(row: ShopSettingsRow): ShopSettings {
  return {
    id: row.id,

    business: {
      businessName: row.business_name,
      shopName: row.shop_name,
      phone: row.phone,
      email: row.email,
      website: row.website,
      address: row.address,
      tin: row.tin,
      momoCode: row.momo_code,
      logoUrl: row.logo_url,
      bankAccounts: normalizeBankAccounts(row.bank_accounts),
    },

    report: {
      reportBusinessName: row.report_business_name,
      reportFooterText: row.report_footer_text,
    },

    system: {
      currency: row.currency,
    },

    cashRules: {
      requireOpenCashForSales: row.require_open_cash_for_sales,
      requireOpenCashForDebtPayments: row.require_open_cash_for_debt_payments,
      requireOpenCashForPaidExpenses: row.require_open_cash_for_paid_expenses,
      allowOwnerCashReopen: row.allow_owner_cash_reopen,
    },

    createdAt: normalizeDate(row.created_at),
    updatedAt: normalizeDate(row.updated_at),
  };
}

async function requireOwnerOnly(request: FastifyRequest, reply: FastifyReply) {
  const auth = request.authUser!;

  if (auth.role !== "owner") {
    return reply.code(403).send({
      ok: false,
      message: "Only the owner can change shop settings.",
    });
  }
}

async function getSettingsRow() {
  const result = await db.execute(sql`
    select *
    from shop_settings
    where settings_key = 'main'
    limit 1
  `);

  const rows = getRows<ShopSettingsRow>(result);

  return rows[0] || null;
}

async function ensureSettingsRow() {
  const existing = await getSettingsRow();

  if (existing) return existing;

  await db.execute(sql`
    insert into shop_settings (
      settings_key,
      business_name,
      shop_name,
      report_business_name,
      report_footer_text,
      currency
    )
    values (
      'main',
      'Electronic Retail Business Control System',
      'Main Shop',
      'Electronic Retail Business Control System',
      'Daily shop proof generated from saved shop records.',
      'Rwf'
    )
    on conflict (settings_key) do nothing
  `);

  const created = await getSettingsRow();

  if (!created) {
    throw new Error("Could not create shop settings.");
  }

  return created;
}

async function saveSettings(settings: ShopSettings) {
  await db.execute(sql`
    update shop_settings
    set
      business_name = ${settings.business.businessName},
      shop_name = ${settings.business.shopName},
      phone = ${settings.business.phone},
      email = ${settings.business.email},
      website = ${settings.business.website},
      address = ${settings.business.address},
      tin = ${settings.business.tin},
      momo_code = ${settings.business.momoCode},
      logo_url = ${settings.business.logoUrl},
      bank_accounts = ${JSON.stringify(settings.business.bankAccounts)}::jsonb,

      report_business_name = ${settings.report.reportBusinessName},
      report_footer_text = ${settings.report.reportFooterText},

      currency = ${settings.system.currency},

      require_open_cash_for_sales = ${settings.cashRules.requireOpenCashForSales},
      require_open_cash_for_debt_payments = ${settings.cashRules.requireOpenCashForDebtPayments},
      require_open_cash_for_paid_expenses = ${settings.cashRules.requireOpenCashForPaidExpenses},
      allow_owner_cash_reopen = ${settings.cashRules.allowOwnerCashReopen},

      updated_at = now()
    where settings_key = 'main'
  `);

  const updated = await ensureSettingsRow();

  return toSettings(updated);
}

export async function settingsRoutes(app: FastifyInstance) {
  app.get(
    "/",
    {
      preHandler: [requireAuth, requireOwnerOnly],
    },
    async () => {
      const row = await ensureSettingsRow();

      return {
        ok: true,
        settings: toSettings(row),
      };
    },
  );

  app.patch(
    "/business",
    {
      preHandler: [requireAuth, requireOwnerOnly],
    },
    async (request, reply) => {
      const parsed = updateBusinessSettingsSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Please check business settings.",
          errors: parsed.error.flatten(),
        });
      }

      const current = toSettings(await ensureSettingsRow());
      const data = parsed.data;

      const nextSettings: ShopSettings = {
        ...current,
        business: {
          businessName:
            cleanNullable(
              pick(data.businessName, current.business.businessName ?? ""),
            ) ?? null,
          shopName:
            cleanNullable(
              pick(data.shopName, current.business.shopName ?? ""),
            ) ?? null,
          phone:
            cleanNullable(pick(data.phone, current.business.phone ?? "")) ??
            null,
          email:
            cleanNullable(pick(data.email, current.business.email ?? "")) ??
            null,
          website:
            cleanNullable(pick(data.website, current.business.website ?? "")) ??
            null,
          address:
            cleanNullable(pick(data.address, current.business.address ?? "")) ??
            null,
          tin:
            cleanNullable(pick(data.tin, current.business.tin ?? "")) ?? null,
          momoCode:
            cleanNullable(
              pick(data.momoCode, current.business.momoCode ?? ""),
            ) ?? null,
          logoUrl:
            cleanNullable(pick(data.logoUrl, current.business.logoUrl ?? "")) ??
            null,
          bankAccounts: data.bankAccounts ?? current.business.bankAccounts,
        },
      };

      const settings = await saveSettings(nextSettings);

      return {
        ok: true,
        message: "Business settings updated.",
        settings,
      };
    },
  );

  app.patch(
    "/report",
    {
      preHandler: [requireAuth, requireOwnerOnly],
    },
    async (request, reply) => {
      const parsed = updateReportSettingsSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Please check report settings.",
          errors: parsed.error.flatten(),
        });
      }

      const current = toSettings(await ensureSettingsRow());
      const data = parsed.data;

      const nextSettings: ShopSettings = {
        ...current,
        report: {
          reportBusinessName:
            cleanNullable(
              pick(
                data.reportBusinessName,
                current.report.reportBusinessName ?? "",
              ),
            ) ?? null,
          reportFooterText:
            cleanNullable(
              pick(
                data.reportFooterText,
                current.report.reportFooterText ?? "",
              ),
            ) ?? null,
        },
      };

      const settings = await saveSettings(nextSettings);

      return {
        ok: true,
        message: "Report settings updated.",
        settings,
      };
    },
  );

  app.patch(
    "/cash-rules",
    {
      preHandler: [requireAuth, requireOwnerOnly],
    },
    async (request, reply) => {
      const parsed = updateCashRulesSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Please check cash rules.",
          errors: parsed.error.flatten(),
        });
      }

      const current = toSettings(await ensureSettingsRow());
      const data = parsed.data;

      const nextSettings: ShopSettings = {
        ...current,
        cashRules: {
          requireOpenCashForSales: pick(
            data.requireOpenCashForSales,
            current.cashRules.requireOpenCashForSales,
          ),
          requireOpenCashForDebtPayments: pick(
            data.requireOpenCashForDebtPayments,
            current.cashRules.requireOpenCashForDebtPayments,
          ),
          requireOpenCashForPaidExpenses: pick(
            data.requireOpenCashForPaidExpenses,
            current.cashRules.requireOpenCashForPaidExpenses,
          ),
          allowOwnerCashReopen: pick(
            data.allowOwnerCashReopen,
            current.cashRules.allowOwnerCashReopen,
          ),
        },
      };

      const settings = await saveSettings(nextSettings);

      return {
        ok: true,
        message: "Cash rules updated.",
        settings,
      };
    },
  );

  app.patch(
    "/system",
    {
      preHandler: [requireAuth, requireOwnerOnly],
    },
    async (request, reply) => {
      const parsed = updateSystemSettingsSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Please check system settings.",
          errors: parsed.error.flatten(),
        });
      }

      const current = toSettings(await ensureSettingsRow());
      const data = parsed.data;

      const nextSettings: ShopSettings = {
        ...current,
        system: {
          currency: pick(data.currency, current.system.currency),
        },
      };

      const settings = await saveSettings(nextSettings);

      return {
        ok: true,
        message: "System settings updated.",
        settings,
      };
    },
  );
}
