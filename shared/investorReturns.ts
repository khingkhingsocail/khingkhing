import { z } from "zod";
import { validDate } from "./arena";
const sourceUrl = z
  .string()
  .url()
  .max(1200)
  .refine(value => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  });
export const investorReturnSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{3,80}$/),
    investor: z.string().min(1).max(120),
    organization: z.string().min(1).max(180),
    submitted: z
      .object({
        value: z.number().finite().min(-100).max(1000),
        period: z.string().min(1).max(100),
        basis: z.string().min(1).max(250),
        sourceUrl,
      })
      .strict(),
    reportedValue: z.number().finite().min(-100).max(1000).nullable(),
    reportedPeriod: z.string().min(1).max(150),
    reportedBasis: z.string().min(1).max(400),
    status: z.enum(["confirmed", "partial", "unverified", "corrected"]),
    summary: z.string().min(1).max(2500),
    caveats: z.string().max(3000),
    sources: z
      .array(
        z
          .object({
            url: sourceUrl,
            title: z.string().min(1).max(500),
            excerpt: z.string().max(2000),
            retrievedAt: z.union([
              z.string().refine(validDate),
              z.string().datetime({ offset: true }),
            ]),
            supports: z.string().min(1).max(1000),
          })
          .strict()
      )
      .max(8),
    extras: z
      .array(
        z
          .object({
            label: z.string().min(1).max(200),
            text: z.string().min(1).max(1500),
            sourceUrl,
            confirmed: z.boolean(),
          })
          .strict()
      )
      .max(8),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (
      row.status === "confirmed" &&
      (!row.sources.length || row.reportedValue === null)
    )
      ctx.addIssue({
        code: "custom",
        message: "Confirmed requires retrieved supporting source and value",
      });
    if (row.status === "unverified" && row.reportedValue !== null)
      ctx.addIssue({
        code: "custom",
        message: "Unverified must not assert a reported value",
      });
    if (row.status === "corrected" && !row.sources.length)
      ctx.addIssue({ code: "custom", message: "Corrected requires evidence" });
  });
export type InvestorReturn = z.infer<typeof investorReturnSchema>;
export const returnStatusLabels = {
  confirmed: "ตรวจแหล่งอ้างอิงแล้ว",
  partial: "ยืนยันได้บางส่วน",
  unverified: "ข้อมูลที่ส่งมา · ยังตรวจยืนยันไม่ได้",
  corrected: "ปรับตามแหล่งอ้างอิง",
};
export type ReturnSort = "name" | "value-desc" | "value-asc";
export function filterInvestorReturns(
  rows: readonly InvestorReturn[],
  query: string,
  sort: ReturnSort
) {
  const term = query.trim().toLocaleLowerCase();
  return rows
    .filter(row =>
      `${row.investor} ${row.organization}`.toLocaleLowerCase().includes(term)
    )
    .sort((a, b) => {
      if (sort === "name") return a.investor.localeCompare(b.investor);
      // Unverified submissions never enter numerical return sorting as if established facts.
      if (a.reportedValue === null)
        return b.reportedValue === null ? a.id.localeCompare(b.id) : 1;
      if (b.reportedValue === null) return -1;
      return (
        (sort === "value-asc" ? 1 : -1) * (a.reportedValue - b.reportedValue) ||
        a.id.localeCompare(b.id)
      );
    });
}
