// =============================================================================
//  أدوات إضافية: Position Size • Multi-Timeframe • Economic Calendar
// =============================================================================
import { getAnalysis } from "./gold";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// =============================================================================
//  1) Position Size & Risk Management  (حسابات رياضية بحتة — بدون نت)
// =============================================================================
//  الفكرة: الذهب (XAUUSD) — 1 لوت ستاندرد = 100 أوقية،
//  وكل حركة $1 في السعر = $100 لكل لوت.
export function positionSize(args: {
  capital: number;
  riskPercent: number;
  entry: number;
  stop: number;
  target?: number;
  contractSize?: number; // أوقية لكل لوت (default 100)
}) {
  const { capital, riskPercent, entry, stop, target } = args;
  const contractSize = args.contractSize ?? 100;
  if (!capital || !riskPercent) throw new Error("لازم capital و riskPercent");
  const stopDistance = Math.abs(entry - stop);
  if (stopDistance <= 0) throw new Error("الستوب لازم يختلف عن الدخول");

  const riskAmount = capital * (riskPercent / 100);
  const lossPerLot = stopDistance * contractSize; // $ خسارة لكل لوت واحد
  const lots = riskAmount / lossPerLot;
  const direction = entry > stop ? "LONG" : "SHORT";

  let reward: number | null = null;
  let riskReward: number | null = null;
  if (target != null) {
    const targetDistance = Math.abs(target - entry);
    reward = round2(targetDistance * contractSize * lots);
    riskReward = round2(targetDistance / stopDistance);
  }

  return {
    direction,
    capital,
    riskPercent,
    riskAmount: round2(riskAmount),
    entry,
    stop,
    target: target ?? null,
    stopDistanceUSD: round2(stopDistance),
    contractSize,
    standardLots: round2(lots),
    miniLots: round2(lots * 10),
    microLots: round2(lots * 100),
    unitsOz: round2(lots * contractSize),
    potentialReward: reward,
    riskReward,
    note: "1 لوت = 100 أوقية، وكل $1 حركة = $100/لوت. عدّل contractSize حسب بروكرك لو مختلف.",
    disclaimer: "إدارة المخاطر مسئوليتك — ما تخاطرش بأكتر من 1-2% في الصفقة.",
  };
}

// =============================================================================
//  2) Multi-Timeframe Analysis (Top-Down: 4h -> 1h -> 15m)
// =============================================================================
type Brief = {
  interval: string;
  trend: string;
  zone: string;
  price: number;
  lastBOS: string | null;
  lastCHoCH: string | null;
};

export async function multiTimeframe() {
  const [h4, h1, m15] = await Promise.all([
    getAnalysis("4h", 200),
    getAnalysis("1h", 200),
    getAnalysis("15m", 200),
  ]);

  const brief = (a: Awaited<ReturnType<typeof getAnalysis>>): Brief => ({
    interval: a.interval,
    trend: a.trend,
    zone: a.currentZone,
    price: a.currentPrice,
    lastBOS: a.lastBOS?.direction ?? null,
    lastCHoCH: a.lastCHoCH?.direction ?? null,
  });

  const htfBias = h4.trend; // بياس الفريم الكبير
  const aligned = h4.trend === h1.trend && h4.trend !== "ranging";

  let recommendation: string;
  if (htfBias === "bullish" && aligned) {
    recommendation =
      "البياس صاعد (4h+1h) — دوّر على LONG فقط على 15m عند Discount/OB صاعد.";
  } else if (htfBias === "bearish" && aligned) {
    recommendation =
      "البياس هابط (4h+1h) — دوّر على SHORT فقط على 15m عند Premium/OB هابط.";
  } else {
    recommendation =
      "الفريمات متضاربة — الأفضل الانتظار لحد ما 4h و 1h يتفقوا.";
  }

  return {
    symbol: "XAU/USD",
    htfBias,
    aligned,
    recommendation,
    h4: brief(h4),
    h1: brief(h1),
    m15: brief(m15),
    note: "القاعدة: اتجاه الدخول من الفريم الكبير (4h)، والتوقيت من الصغير (15m).",
    disclaimer: "تحليل تعليمي احتمالي — مش توصية مالية.",
  };
}

// =============================================================================
//  3) Economic Calendar (الأخبار عالية التأثير)
// =============================================================================
//  المصدر: ForexFactory عبر FairEconomy (JSON مجاني بدون مفتاح).
type FFEvent = {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast: string;
  previous: string;
};

export async function economicCalendar(args?: {
  currency?: string; // default USD (الأهم للذهب)، أو ALL
  impact?: string; // default High، أو ALL
}) {
  const currency = (args?.currency ?? "USD").toUpperCase();
  const impact = (args?.impact ?? "High");
  const url = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "gold-mcp", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Calendar error: ${res.status}`);
  const all = (await res.json()) as FFEvent[];

  const now = Date.now();
  const filtered = all.filter(
    (e) =>
      (currency === "ALL" || (e.country ?? "").toUpperCase() === currency) &&
      (impact === "ALL" || e.impact === impact),
  );
  const upcoming = filtered
    .filter((e) => new Date(e.date).getTime() >= now - 3600 * 1000)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const soon = upcoming.find((e) => {
    const t = new Date(e.date).getTime();
    return t >= now && t - now <= 2 * 3600 * 1000;
  });

  return {
    currency,
    impact,
    count: upcoming.length,
    warning: soon
      ? `⚠️ خبر مؤثر خلال ساعتين: ${soon.title} (${soon.date}) — تجنّب الدخول!`
      : null,
    events: upcoming.slice(0, 15).map((e) => ({
      title: e.title,
      currency: e.country,
      time: e.date,
      impact: e.impact,
      forecast: e.forecast,
      previous: e.previous,
    })),
    note: "المصدر: ForexFactory. التوقيت بصيغة ISO مع المنطقة الزمنية — حوّله لتوقيتك.",
  };
}
