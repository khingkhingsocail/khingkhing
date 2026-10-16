export const hedgeFollowReference = {
  home: "https://hedgefollow.com/",
  guide: "https://hedgefollow.com/hedge-funds-101.php",
  terms: "https://hedgefollow.com/terms.php",
  secGuide: "https://www.sec.gov/divisions/investment/13ffaq",
  checkedAt: "2026-10-09",
} as const;

export function hedgeFollowStockUrl(ticker: string): string | null {
  const symbol = ticker.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) return null;
  return `https://hedgefollow.com/stocks/${encodeURIComponent(symbol)}`;
}

export function hedgeFollowEntityLink(id: string) {
  if (id === "warren-buffett" || id === "berkshire-hathaway") {
    return {
      url: "https://hedgefollow.com/funds/Berkshire+Hathaway",
      label: "ดูพอร์ต Berkshire Hathaway บน HedgeFollow",
      note: "เป็นข้อมูลพอร์ตของ Berkshire Hathaway ไม่ใช่พอร์ตส่วนตัวหรือผลตอบแทนส่วนบุคคลของ Warren Buffett",
    };
  }
  if (id === "apple") {
    return {
      url: "https://hedgefollow.com/stocks/AAPL",
      label: "ดูผู้ถือหุ้น Apple บน HedgeFollow",
      note: "รายชื่อผู้ถือหุ้นตามข้อมูลที่เว็บรวบรวม ไม่ใช่ทะเบียนผู้ถือหุ้นครบทุกคนหรือข้อมูลเรียลไทม์",
    };
  }
  return null;
}
