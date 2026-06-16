// =============================================================================
//  Gold SMC Analysis Engine  —  XAU/USD
// =============================================================================
//  مصادر البيانات:
//    • الشموع (OHLC): Yahoo Finance GC=F (عقود الذهب COMEX) — مجاني، بدون مفتاح.
//    • السعر السبوت: gold-api.com (XAU) — مجاني، بدون مفتاح.
//  الفكرة: نجيب شموع GC=F ونزحزها بفرق (basis = السبوت - آخر إغلاق فيوتشرز)
//  عشان كل المستويات تتعاير على السبوت الحقيقي.
//  معايرة يدوية: اضبط متغير البيئة GOLD_OFFSET (مثلاً 9) عشان يطابق رقم بروكرك.
//
//  المفاهيم (SMC):
//  • Swing High/Low (Fractal) • Market Structure (HH/HL/LH/LL)
//  • BOS (Break of Structure) • CHoCH (Change of Character)
//  • FVG (Fair Value Gap) • Order Block (OB)
//  • Liquidity (BSL/SSL) • Equal Highs/Lows
//  • Strong/Weak High & Low • Premium/Discount/Equilibrium
// =============================================================================

const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart";
const CANDLE_SYMBOL = "GC=F"; // عقود الذهب COMEX (شموع موثوقة)
const SPOT_URL = "https://api.gold-api.com/price/XAU"; // سبوت الذهب الحقيقي
const MANUAL_OFFSET = parseFloat(process.env.GOLD_OFFSET ?? "0") || 0; // معايرة يدوية لبروكرك

const FRAME: Record<string, { i: string; r: string }> = {
  "1m": { i: "1m", r: "1d" },
  "5m": { i: "5m", r: "5d" },
  "15m": { i: "15m", r: "5d" },
  "30m": { i: "30m", r: "5d" },
  "1h": { i: "60m", r: "1mo" },
  "4h": { i: "60m", r: "3mo" },
  "1d": { i: "1d", r: "1y" },
};

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  Accept: "application/json",
};

type YahooResult = {
  chart: {
    result: Array<{
      meta: { regularMarketPrice?: number };
      timestamp?: number[];
      indicators: {
        quote: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }>;
  };
};

async function fetchYahoo(interval: string): Promise<YahooResult> {
  const f = FRAME[interval] ?? FRAME["15m"];
  const url = `${YAHOO}/${CANDLE_SYMBOL}?interval=${f.i}&range=${f.r}`;
  const res = await fetch(url, { cache: "no-store", headers: HEADERS });
  if (!res.ok) throw new Error(`Yahoo error: ${res.status}`);
  return (await res.json()) as YahooResult;
}

// سعر السبوت الحقيقي (مع حماية — يرجع null لو فشل)
async function fetchSpot(): Promise<number | null> {
  try {
    const res = await fetch(SPOT_URL, {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "gold-mcp" },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { price?: number };
    return typeof j.price === "number" ? j.price : null;
  } catch {
    return null;
  }
}

// ===== جلب الشموع + معايرة على السبوت =====
export async function fetchKlines(interval = "15m", limit = 200): Promise<Candle[]> {
  const [data, spot] = await Promise.all([fetchYahoo(interval), fetchSpot()]);
  const r = data.chart?.result?.[0];
  if (!r || !r.timestamp) throw new Error("مفيش بيانات من Yahoo");
  const q = r.indicators.quote[0];
  let candles: Candle[] = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    candles.push({ time: r.timestamp[i] * 1000, open: o, high: h, low: l, close: c, volume: q.volume?.[i] ?? 0 });
  }
  candles = candles.slice(-limit);

  // معايرة: زحزحة كل الشموع بالفرق بين السبوت وآخر إغلاق
  if (candles.length > 0) {
    const lastClose = candles[candles.length - 1].close;
    const basis = (spot != null ? spot - lastClose : 0) + MANUAL_OFFSET;
    if (basis !== 0) {
      candles = candles.map((c) => ({
        time: c.time,
        open: round(c.open + basis),
        high: round(c.high + basis),
        low: round(c.low + basis),
        close: round(c.close + basis),
        volume: c.volume,
      }));
    }
  }
  return candles;
}

// ===== السعر الحالي =====
export async function getGoldPrice() {
  const spot = await fetchSpot();
  if (spot != null) {
    return {
      symbol: "XAU/USD",
      note: "سبوت الذهب الحقيقي",
      price: round(spot + MANUAL_OFFSET),
      source: "gold-api.com (spot)",
      offset: MANUAL_OFFSET,
      time: new Date().toISOString(),
    };
  }
  // احتياطي: آخر إغلاق من GC=F (بعد المعايرة)
  const candles = await fetchKlines("15m", 5);
  const last = candles[candles.length - 1]?.close;
  if (last == null) throw new Error("مفيش سعر متاح");
  return {
    symbol: "XAU/USD",
    note: "عقود COMEX (احتياطي — السبوت مش متاح)",
    price: round(last),
    source: "Yahoo GC=F",
    offset: MANUAL_OFFSET,
    time: new Date().toISOString(),
  };
}

// ===== Swing pivots (fractals) =====
type Pivot = { kind: "high" | "low"; price: number; index: number; time: number };

function findPivots(c: Candle[], strength = 2): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = strength; i < c.length - strength; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - strength; j <= i + strength; j++) {
      if (j === i) continue;
      if (c[j].high >= c[i].high) isHigh = false;
      if (c[j].low <= c[i].low) isLow = false;
    }
    if (isHigh) pivots.push({ kind: "high", price: c[i].high, index: i, time: c[i].time });
    if (isLow) pivots.push({ kind: "low", price: c[i].low, index: i, time: c[i].time });
  }
  return pivots.sort((a, b) => a.index - b.index);
}

// ===== Market structure: BOS / CHoCH + Strong/Weak points =====
type StructureEvent = { event: "BOS" | "CHoCH"; direction: "bullish" | "bearish"; level: number; index: number; time: number };

function marketStructure(c: Candle[], pivots: Pivot[]) {
  const events: StructureEvent[] = [];
  let trend: "bullish" | "bearish" | "ranging" = "ranging";
  let refHigh: Pivot | null = null;
  let refLow: Pivot | null = null;
  let strongHigh: Pivot | null = null, weakHigh: Pivot | null = null;
  let strongLow: Pivot | null = null, weakLow: Pivot | null = null;

  let pIdx = 0;
  for (let i = 0; i < c.length; i++) {
    while (pIdx < pivots.length && pivots[pIdx].index < i) {
      const p = pivots[pIdx];
      if (p.kind === "high") refHigh = p;
      else refLow = p;
      pIdx++;
    }
    const close = c[i].close;
    if (refHigh && close > refHigh.price) {
      const direction = "bullish" as const;
      const event = trend === "bearish" ? "CHoCH" : "BOS";
      events.push({ event, direction, level: refHigh.price, index: i, time: c[i].time });
      weakHigh = refHigh;
      if (refLow) strongLow = refLow;
      trend = "bullish";
      refHigh = null;
    } else if (refLow && close < refLow.price) {
      const direction = "bearish" as const;
      const event = trend === "bullish" ? "CHoCH" : "BOS";
      events.push({ event, direction, level: refLow.price, index: i, time: c[i].time });
      weakLow = refLow;
      if (refHigh) strongHigh = refHigh;
      trend = "bearish";
      refLow = null;
    }
  }
  return { trend, events, strongHigh, weakHigh, strongLow, weakLow };
}

// ===== FVG =====
function findFVG(c: Candle[]) {
  const gaps: Array<{ type: "bullish" | "bearish"; from: number; to: number; index: number; mitigated: boolean }> = [];
  for (let i = 2; i < c.length; i++) {
    const a = c[i - 2], d = c[i];
    if (d.low > a.high) {
      const top = d.low, bottom = a.high;
      const mitigated = c.slice(i + 1).some((x) => x.low <= top);
      gaps.push({ type: "bullish", from: round(bottom), to: round(top), index: i, mitigated });
    }
    if (d.high < a.low) {
      const top = a.low, bottom = d.high;
      const mitigated = c.slice(i + 1).some((x) => x.high >= bottom);
      gaps.push({ type: "bearish", from: round(bottom), to: round(top), index: i, mitigated });
    }
  }
  return gaps.slice(-6);
}

// ===== Order Blocks =====
function findOrderBlocks(c: Candle[], events: StructureEvent[]) {
  const obs: Array<{ type: "bullish" | "bearish"; top: number; bottom: number; index: number; mitigated: boolean }> = [];
  for (const ev of events.slice(-6)) {
    if (ev.direction === "bullish") {
      for (let i = ev.index; i >= Math.max(0, ev.index - 10); i--) {
        if (c[i].close < c[i].open) {
          const top = c[i].high, bottom = c[i].low;
          const mitigated = c.slice(i + 1).some((x) => x.low <= top && x.high >= bottom);
          obs.push({ type: "bullish", top: round(top), bottom: round(bottom), index: i, mitigated });
          break;
        }
      }
    } else {
      for (let i = ev.index; i >= Math.max(0, ev.index - 10); i--) {
        if (c[i].close > c[i].open) {
          const top = c[i].high, bottom = c[i].low;
          const mitigated = c.slice(i + 1).some((x) => x.low <= top && x.high >= bottom);
          obs.push({ type: "bearish", top: round(top), bottom: round(bottom), index: i, mitigated });
          break;
        }
      }
    }
  }
  return obs.slice(-4);
}

// ===== Liquidity (BSL/SSL) + Equal Highs/Lows =====
function findLiquidity(c: Candle[], pivots: Pivot[]) {
  const highs = pivots.filter((p) => p.kind === "high");
  const lows = pivots.filter((p) => p.kind === "low");
  // tolerance للتجميع: ~0.05% من السعر (≈ $2 على الذهب) عشان نلتقط Equal Highs/Lows صح
  const avg = c.reduce((s, x) => s + x.close, 0) / c.length;
  const tol = Math.max(avg * 0.0005, 0.5);

  function clusters(ps: Pivot[]) {
    const used = new Array(ps.length).fill(false);
    const out: Array<{ level: number; count: number }> = [];
    for (let i = 0; i < ps.length; i++) {
      if (used[i]) continue;
      const group = [ps[i].price];
      used[i] = true;
      for (let j = i + 1; j < ps.length; j++) {
        if (!used[j] && Math.abs(ps[j].price - ps[i].price) <= tol) { group.push(ps[j].price); used[j] = true; }
      }
      out.push({ level: round(group.reduce((a, b) => a + b, 0) / group.length), count: group.length });
    }
    return out.sort((a, b) => b.count - a.count);
  }

  const bslClusters = clusters(highs);
  const sslClusters = clusters(lows);
  return {
    BSL: bslClusters.slice(0, 4),
    SSL: sslClusters.slice(0, 4),
    equalHighs: bslClusters.filter((x) => x.count >= 2).slice(0, 3),
    equalLows: sslClusters.filter((x) => x.count >= 2).slice(0, 3),
  };
}

// ===== Support / Resistance =====
function supportResistance(c: Candle[], pivots: Pivot[], last: number) {
  const res = Array.from(new Set(pivots.filter((p) => p.kind === "high" && p.price > last).map((p) => round(p.price))))
    .sort((a, b) => a - b).slice(0, 4);
  const sup = Array.from(new Set(pivots.filter((p) => p.kind === "low" && p.price < last).map((p) => round(p.price))))
    .sort((a, b) => b - a).slice(0, 4);
  return { resistances: res, supports: sup };
}

// ===== Full analysis =====
export async function getAnalysis(interval = "15m", limit = 200) {
  const candles = await fetchKlines(interval, limit);
  if (candles.length < 10) throw new Error("بيانات قليلة للتحليل");
  const last = candles[candles.length - 1].close;
  const rangeHigh = Math.max(...candles.map((c) => c.high));
  const rangeLow = Math.min(...candles.map((c) => c.low));
  const equilibrium = (rangeHigh + rangeLow) / 2;

  const pivots = findPivots(candles, 2);
  const ms = marketStructure(candles, pivots);
  const fvg = findFVG(candles);
  const obs = findOrderBlocks(candles, ms.events);
  const liquidity = findLiquidity(candles, pivots);
  const sr = supportResistance(candles, pivots, last);

  return {
    symbol: "XAU/USD",
    interval,
    currentPrice: round(last),
    candlesAnalyzed: candles.length,
    trend: ms.trend,
    structureEvents: ms.events.slice(-6).map((e) => ({ ...e, level: round(e.level) })),
    lastBOS: [...ms.events].reverse().find((e) => e.event === "BOS") ?? null,
    lastCHoCH: [...ms.events].reverse().find((e) => e.event === "CHoCH") ?? null,
    strongHigh: ms.strongHigh ? round(ms.strongHigh.price) : null,
    weakHigh: ms.weakHigh ? round(ms.weakHigh.price) : null,
    strongLow: ms.strongLow ? round(ms.strongLow.price) : null,
    weakLow: ms.weakLow ? round(ms.weakLow.price) : null,
    range: { high: round(rangeHigh), low: round(rangeLow), equilibrium: round(equilibrium) },
    premiumZone: { from: round(equilibrium), to: round(rangeHigh), meaning: "منطقة بيع" },
    discountZone: { from: round(rangeLow), to: round(equilibrium), meaning: "منطقة شراء" },
    currentZone: last >= equilibrium ? "Premium (بيع)" : "Discount (شراء)",
    supports: sr.supports,
    resistances: sr.resistances,
    orderBlocks: obs,
    fairValueGaps: fvg,
    liquidity,
  };
}

export async function getLevels(interval = "15m", limit = 200) {
  return getAnalysis(interval, limit);
}

// ===== Signal: تجميع كل العوامل =====
export async function getSignal(interval = "15m") {
  const a = await getAnalysis(interval, 200);
  const price = a.currentPrice;

  let score = 0;
  const reasons: string[] = [];

  if (a.trend === "bullish") { score += 2; reasons.push("الهيكل صاعد (BOS صاعد)"); }
  if (a.trend === "bearish") { score -= 2; reasons.push("الهيكل هابط (BOS هابط)"); }
  if (a.lastCHoCH) {
    if (a.lastCHoCH.direction === "bullish") { score += 1; reasons.push("CHoCH صاعد — احتمال انعكاس لفوق"); }
    else { score -= 1; reasons.push("CHoCH هابط — احتمال انعكاس لتحت"); }
  }

  if (a.currentZone.startsWith("Discount")) { score += 1; reasons.push("السعر في Discount (منطقة شراء)"); }
  else { score -= 1; reasons.push("السعر في Premium (منطقة بيع)"); }

  const bullOB = a.orderBlocks.find((o) => o.type === "bullish" && !o.mitigated && price >= o.bottom && price <= o.top * 1.002);
  const bearOB = a.orderBlocks.find((o) => o.type === "bearish" && !o.mitigated && price <= o.top && price >= o.bottom * 0.998);
  if (bullOB) { score += 1; reasons.push(`السعر داخل Bullish OB (${bullOB.bottom}-${bullOB.top})`); }
  if (bearOB) { score -= 1; reasons.push(`السعر داخل Bearish OB (${bearOB.bottom}-${bearOB.top})`); }

  const bullFVG = a.fairValueGaps.find((g) => g.type === "bullish" && !g.mitigated);
  const bearFVG = a.fairValueGaps.find((g) => g.type === "bearish" && !g.mitigated);
  if (bullFVG && !bearFVG) { score += 1; reasons.push("FVG صاعد غير مملوء — دعم للصعود"); }
  if (bearFVG && !bullFVG) { score -= 1; reasons.push("FVG هابط غير مملوء — ضغط للهبوط"); }

  // اختيار المستويات بالاتجاه الصح: الهدف فوق السعر للونج وتحت السعر للشورت
  const above = (arr: number[]) => arr.filter((x) => Number.isFinite(x) && x > price).sort((a, b) => a - b)[0];
  const below = (arr: number[]) => arr.filter((x) => Number.isFinite(x) && x < price).sort((a, b) => b - a)[0];

  const bslLevels = a.liquidity.BSL.map((x) => x.level);
  const sslLevels = a.liquidity.SSL.map((x) => x.level);
  // BSL/SSL الأقرب في الاتجاه الصح (فوق/تحت السعر)
  const nearestBSL = above([...bslLevels, ...a.resistances, a.weakHigh ?? NaN, a.range.high]) ?? a.range.high;
  const nearestSSL = below([...sslLevels, ...a.supports, a.weakLow ?? NaN, a.range.low]) ?? a.range.low;

  let signal: string;
  if (score >= 2) signal = "LONG";
  else if (score <= -2) signal = "SHORT";
  else signal = "WAIT";

  let entryZone: string | null = null, stop: number | null = null, target: number | null = null;
  if (signal === "LONG") {
    entryZone = bullOB ? `${bullOB.bottom}-${bullOB.top}` : `قرب الدعم ${below([...a.supports, a.strongLow ?? NaN]) ?? a.range.low}`;
    stop = below([...a.supports, a.strongLow ?? NaN, ...sslLevels]) ?? a.range.low; // الستوب تحت السعر
    target = nearestBSL; // الهدف فوق السعر
  } else if (signal === "SHORT") {
    entryZone = bearOB ? `${bearOB.bottom}-${bearOB.top}` : `قرب المقاومة ${above([...a.resistances, a.strongHigh ?? NaN]) ?? a.range.high}`;
    stop = above([...a.resistances, a.strongHigh ?? NaN, ...bslLevels]) ?? a.range.high; // الستوب فوق السعر
    target = nearestSSL; // الهدف تحت السعر
  }

  return {
    ...a,
    signal,
    score,
    reasons,
    plan: { entryZone, stop, target, nearestBSL, nearestSSL },
    disclaimer: "تحليل تعليمي احتمالي مبني على بيانات تاريخية — مش توصية مالية. الستوب إجباري وإدارة المخاطر مسئوليتك.",
  };
}
