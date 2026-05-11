import { apiRequest } from "./api";

export type ProblemSeverity = "critical" | "warning" | "info";
export type ProblemCategory = "cash" | "debt" | "expense" | "stock" | "sales";

export type ShopProblem = {
  id: string;
  category: ProblemCategory;
  severity: ProblemSeverity;
  title: string;
  message: string;
  actionLabel: string;
  actionHref: string;
  detectedAt: string;
};

export type ProblemsSummary = {
  total: number;
  critical: number;
  warning: number;
  info: number;
  cleanAreas: string[];
};

export type ProblemsResponse = {
  ok: true;
  businessDate: string;
  summary: ProblemsSummary;
  problems: ShopProblem[];
  groups: {
    cashProblems: ShopProblem[];
    debtProblems: ShopProblem[];
    expenseProblems: ShopProblem[];
    stockProblems: ShopProblem[];
    salesProblems: ShopProblem[];
  };
};

export async function getProblems(token: string, date?: string) {
  const query = new URLSearchParams();

  if (date) {
    query.set("date", date);
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";

  return apiRequest<ProblemsResponse>(`/problems${suffix}`, {
    method: "GET",
    token,
  });
}
