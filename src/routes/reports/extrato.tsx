import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/finance/AppShell";
import { AnalyticsTabs } from "@/components/finance/AnalyticsTabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchAccounts, fetchCategories } from "@/lib/finance/data";
import { formatDateBR, localToday, startOfMonthDateOnly } from "@/lib/finance/date-utils";
import { accountKindLabel, formatCurrency, type TxnRow } from "@/lib/finance/types";
import {
  entrySourceLabel,
  paymentMethodLabel,
  type EntrySource,
  type PaymentMethod,
} from "@/lib/finance/transactionIcons";
import { useActiveOrganization } from "@/lib/supabase/organization";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/reports/extrato")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Ticlio — Extrato interno" }] }),
  component: InternalStatementRoute,
});

const REPORT_LIMIT = 1000;

function csvEscape(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

async function fetchInternalStatementRows(
  orgId: string,
  filters: {
    start: string;
    end: string;
    accountId: string;
    categoryId: string;
    type: string;
    reconciliation: string;
    paymentMethod: string;
    entrySource: string;
    recurring: string;
  },
): Promise<TxnRow[]> {
  let query = supabase
    .from("transactions")
    .select(
      "id, description, amount, posted_at, type, account_id, account_kind, payment_method, entry_source, currency, category_id, created_by, spent_by_member_id, statement_import_id, reconciled_statement_item_id, recurring_bill_occurrence_id, installment_number, installment_plan_id, classification_method, classification_confidence, needs_review, original_text, consolidation_status, period_closure_id, transfer_group_id",
    )
    .eq("organization_id", orgId)
    .gte("posted_at", `${filters.start}T00:00:00.000Z`)
    .lte("posted_at", `${filters.end}T23:59:59.999Z`);

  if (filters.accountId !== "all") query = query.eq("account_id", filters.accountId);
  if (filters.categoryId !== "all") query = query.eq("category_id", filters.categoryId);
  if (filters.type === "income") query = query.gt("amount", 0).neq("type", "MANUAL_TRANSFER");
  if (filters.type === "expense") query = query.lt("amount", 0).neq("type", "MANUAL_TRANSFER");
  if (filters.type === "transfer") query = query.eq("type", "MANUAL_TRANSFER");
  if (filters.reconciliation === "reconciled") {
    query = query.not("reconciled_statement_item_id", "is", null);
  }
  if (filters.reconciliation === "unreconciled") {
    query = query.is("reconciled_statement_item_id", null);
  }
  if (filters.paymentMethod !== "all") {
    query = query.eq("payment_method", filters.paymentMethod);
  }
  if (filters.entrySource !== "all") query = query.eq("entry_source", filters.entrySource);
  if (filters.recurring === "recurring") {
    query = query.not("recurring_bill_occurrence_id", "is", null);
  }
  if (filters.recurring === "single") query = query.is("recurring_bill_occurrence_id", null);

  const { data, error } = await query.order("posted_at", { ascending: false }).limit(REPORT_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []) as TxnRow[];
}

function InternalStatementRoute() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [start, setStart] = useState(() => startOfMonthDateOnly(localToday()));
  const [end, setEnd] = useState(localToday());
  const [accountId, setAccountId] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [type, setType] = useState("all");
  const [reconciliation, setReconciliation] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [entrySource, setEntrySource] = useState("all");
  const [recurring, setRecurring] = useState("all");

  useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);
      return user;
    },
  });

  const { orgId } = useActiveOrganization(currentUserId);
  const transactionsQuery = useQuery({
    queryKey: [
      "internal-statement-report",
      orgId,
      start,
      end,
      accountId,
      categoryId,
      type,
      reconciliation,
      paymentMethod,
      entrySource,
      recurring,
    ],
    enabled: !!orgId,
    queryFn: () =>
      fetchInternalStatementRows(orgId!, {
        start,
        end,
        accountId,
        categoryId,
        type,
        reconciliation,
        paymentMethod,
        entrySource,
        recurring,
      }),
  });
  const accountsQuery = useQuery({
    queryKey: ["accounts", orgId],
    enabled: !!orgId,
    queryFn: () => fetchAccounts(orgId!),
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories", orgId],
    enabled: !!orgId,
    queryFn: () => fetchCategories(orgId!),
  });

  const accounts = accountsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const accountByKey = new Map(accounts.map((account) => [account.account_key, account]));

  const rows = useMemo(() => transactionsQuery.data ?? [], [transactionsQuery.data]);

  const summaryRows = rows.filter((row) => row.type !== "MANUAL_TRANSFER");
  const income = summaryRows
    .filter((row) => row.amount > 0)
    .reduce((sum, row) => sum + row.amount, 0);
  const expenses = rows
    .filter((row) => row.type !== "MANUAL_TRANSFER" && row.amount < 0)
    .reduce((sum, row) => sum + Math.abs(row.amount), 0);
  const transferCount = rows.filter((row) => row.type === "MANUAL_TRANSFER").length;

  function exportCsv() {
    const header = [
      "Data",
      "Descricao",
      "Valor",
      "Tipo",
      "Conta",
      "Categoria",
      "Forma",
      "Origem",
      "Conciliado",
      "Conta fixa",
    ];
    const lines = rows.map((row) => [
      row.posted_at.slice(0, 10),
      row.description,
      row.amount,
      row.type,
      accountByKey.get(row.account_id)?.name ?? row.account_id,
      categoryById.get(row.category_id ?? "")?.name ?? "",
      row.payment_method,
      row.entry_source,
      row.reconciled_statement_item_id ? "sim" : "nao",
      row.recurring_bill_occurrence_id ? "sim" : "nao",
    ]);
    const csv = [header, ...lines].map((line) => line.map(csvEscape).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `extrato-${start}-a-${end}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell activeSection="analytics" title="Extrato interno" subtitle="Consulta e exportação">
      <AnalyticsTabs value="reports" />
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Filtros</CardTitle>
          <Button type="button" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            CSV
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
          <Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as contas</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.account_key}>
                  {account.name} · {accountKindLabel[account.kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="income">Receitas</SelectItem>
              <SelectItem value="expense">Despesas</SelectItem>
              <SelectItem value="transfer">Transferências</SelectItem>
            </SelectContent>
          </Select>
          <Select value={reconciliation} onValueChange={setReconciliation}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="reconciled">Conciliados</SelectItem>
              <SelectItem value="unreconciled">Não conciliados</SelectItem>
            </SelectContent>
          </Select>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as formas</SelectItem>
              {(Object.keys(paymentMethodLabel) as PaymentMethod[]).map((method) => (
                <SelectItem key={method} value={method}>
                  {paymentMethodLabel[method]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={entrySource} onValueChange={setEntrySource}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as origens</SelectItem>
              {(Object.keys(entrySourceLabel) as EntrySource[]).map((source) => (
                <SelectItem key={source} value={source}>
                  {entrySourceLabel[source]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={recurring} onValueChange={setRecurring}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Fixas e avulsas</SelectItem>
              <SelectItem value="recurring">Contas fixas</SelectItem>
              <SelectItem value="single">Avulsas</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
      <section className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Entradas</p>
            <strong className="text-emerald-700">{formatCurrency(income)}</strong>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Saídas</p>
            <strong className="text-red-700">{formatCurrency(expenses)}</strong>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Saldo</p>
            <strong>{formatCurrency(income - expenses)}</strong>
          </CardContent>
        </Card>
      </section>
      {rows.length >= REPORT_LIMIT || transferCount > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {rows.length >= REPORT_LIMIT
            ? `Mostrando os ${REPORT_LIMIT} lançamentos mais recentes para os filtros atuais. Refine o período para exportar tudo.`
            : null}
          {transferCount > 0
            ? ` ${transferCount} transferência(s) aparecem na lista, mas ficam fora dos totais de entradas, saídas e saldo.`
            : null}
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{rows.length} lançamento(s)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-2 font-medium">Data</th>
                <th className="py-2 pr-2 font-medium">Descrição</th>
                <th className="py-2 pr-2 font-medium">Conta</th>
                <th className="py-2 pr-2 font-medium">Categoria</th>
                <th className="py-2 pr-2 font-medium">Status</th>
                <th className="py-2 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-b-0">
                  <td className="whitespace-nowrap py-2 pr-2 text-muted-foreground">
                    {formatDateBR(row.posted_at)}
                  </td>
                  <td className="max-w-[260px] truncate py-2 pr-2">{row.description}</td>
                  <td className="py-2 pr-2">
                    {accountByKey.get(row.account_id)?.name ?? row.account_id}
                  </td>
                  <td className="py-2 pr-2">
                    {categoryById.get(row.category_id ?? "")?.name ?? "Sem categoria"}
                  </td>
                  <td className="py-2 pr-2">
                    {row.reconciled_statement_item_id ? "Conciliado" : "Não conciliado"}
                    {row.recurring_bill_occurrence_id ? " · Conta fixa" : ""}
                  </td>
                  <td className="whitespace-nowrap py-2 text-right tabular-nums">
                    {formatCurrency(row.amount, row.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
