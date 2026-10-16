import { z } from "zod";
import { validDate } from "./arena";

export const investmentKinds = ["investor", "fund", "company"] as const;
export const investmentKindLabels = {
  investor: "นักลงทุน",
  fund: "กองทุน",
  company: "บริษัท",
};
const day = z.string().refine(validDate, "วันที่ไม่ถูกต้อง");
const source = {
  sourceUrl: z
    .string()
    .url()
    .max(1000)
    .refine(value => {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    }),
  sourceTitle: z.string().trim().min(1).max(300),
  excerpt: z.string().trim().min(1).max(4000),
  asOf: day,
};
export const investmentMetricSchema = z
  .object({
    key: z.enum(["expense-ratio", "net-assets"]),
    value: z.number().finite().nonnegative().max(1e15),
    unit: z.enum(["%", "USD"]),
    basis: z.string().trim().min(1).max(200),
    ...source,
  })
  .strict()
  .superRefine((row, ctx) => {
    if (row.key === "expense-ratio" && (row.unit !== "%" || row.value > 100))
      ctx.addIssue({
        code: "custom",
        message: "Expense ratio requires percent units",
      });
    if (row.key === "net-assets" && row.unit !== "USD")
      ctx.addIssue({ code: "custom", message: "Net assets require USD units" });
  });
export const investmentReferenceSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{3,80}$/),
    name: z.string().trim().min(1).max(120),
    kind: z.enum(investmentKinds),
    summary: z.string().trim().min(1).max(2000),
    ticker: z.string().max(60),
    role: z.string().trim().min(1).max(300),
    facts: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(100),
            text: z.string().trim().min(1).max(2000),
            ...source,
          })
          .strict()
      )
      .min(1)
      .max(10),
    metrics: z.array(investmentMetricSchema).max(5),
    holdings: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(120),
            ticker: z.string().max(30),
            weightPercent: z.number().finite().min(0).max(100).nullable(),
            ...source,
          })
          .strict()
      )
      .max(10),
    gaps: z.string().max(3000),
    retrievedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((record, ctx) => {
    for (const item of [...record.facts, ...record.metrics, ...record.holdings])
      if (item.asOf > record.retrievedAt.slice(0, 10))
        ctx.addIssue({ code: "custom", message: "Future evidence date" });
    if (record.kind !== "fund" && record.metrics.length)
      ctx.addIssue({
        code: "custom",
        message: "Fund metrics cannot stand in for personal or company returns",
      });
    const keys = record.metrics.map(investmentMetricGroup);
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({
        code: "custom",
        message: "Duplicate metric per comparison group",
      });
  });
export type InvestmentReference = z.infer<typeof investmentReferenceSchema>;
export type InvestmentMetric = z.infer<typeof investmentMetricSchema>;
export function investmentMetricGroup(metric: InvestmentMetric) {
  return JSON.stringify([metric.key, metric.unit, metric.basis, metric.asOf]);
}
export const investmentMetricLabels = {
  "expense-ratio": "ค่าธรรมเนียมกองทุนต่อปี",
  "net-assets": "สินทรัพย์สุทธิที่รายงาน",
};
export function rankInvestmentMetrics(
  records: readonly InvestmentReference[],
  group: string
) {
  const rows = records
    .filter(r => r.kind === "fund")
    .flatMap(entity =>
      entity.metrics
        .filter(metric => investmentMetricGroup(metric) === group)
        .map(metric => ({ entity, metric }))
    );
  rows.sort(
    (a, b) =>
      (a.metric.key === "expense-ratio"
        ? a.metric.value - b.metric.value
        : b.metric.value - a.metric.value) ||
      a.entity.id.localeCompare(b.entity.id)
  );
  let rank = 0;
  return rows.map((row, index) => {
    if (index === 0 || row.metric.value !== rows[index - 1].metric.value)
      rank = index + 1;
    return { ...row, rank };
  });
}
export function filterInvestmentReferences(
  records: readonly InvestmentReference[],
  kind: InvestmentReference["kind"],
  query: string,
  descending = false
) {
  const term = query.trim().toLocaleLowerCase();
  const rows = records.filter(
    row =>
      row.kind === kind &&
      `${row.name} ${row.ticker} ${row.role}`.toLocaleLowerCase().includes(term)
  );
  return rows.sort(
    (a, b) => (descending ? -1 : 1) * a.name.localeCompare(b.name, "th")
  );
}
