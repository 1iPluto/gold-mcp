import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { getGoldPrice, getLevels, getSignal, getAnalysis } from "@/lib/gold";
import { positionSize, multiTimeframe, economicCalendar } from "@/lib/extras";

export const runtime = "nodejs";
export const maxDuration = 30;

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

const mcp = createMcpHandler(
  (server) => {
    server.tool(
      "get_gold_price",
      "السعر الحالي للذهب لايف (XAU/USD سبوت)",
      {},
      async () => json(await getGoldPrice()),
    );

    server.tool(
      "get_levels",
      "تحليل SMC كامل: هيكل، دعم/مقاومة، Premium/Discount، OB، FVG، Liquidity",
      {
        interval: z.string().optional().describe("15m, 1h, 4h, 1d"),
        limit: z.number().optional(),
      },
      async ({ interval, limit }) => json(await getLevels(interval ?? "15m", limit ?? 200)),
    );

    server.tool(
      "get_analysis",
      "نفس get_levels — تحليل SMC كامل بكل العناصر",
      {
        interval: z.string().optional().describe("15m, 1h, 4h, 1d"),
        limit: z.number().optional(),
      },
      async ({ interval, limit }) => json(await getAnalysis(interval ?? "15m", limit ?? 200)),
    );

    server.tool(
      "get_signal",
      "إشارة (LONG/SHORT/WAIT) بنظام confluence + خطة دخول/ستوب/هدف",
      { interval: z.string().optional().describe("15m, 1h, 4h, 1d") },
      async ({ interval }) => json(await getSignal(interval ?? "15m")),
    );

    // ===== الأدوات الجديدة =====
    server.tool(
      "position_size",
      "حاسبة حجم الصفقة وإدارة المخاطر: رأس المال + المخاطرة% + دخول + ستوب -> حجم اللوت",
      {
        capital: z.number().describe("رأس المال بالدولار"),
        riskPercent: z.number().describe("نسبة المخاطرة % (مثلاً 1)"),
        entry: z.number().describe("سعر الدخول"),
        stop: z.number().describe("سعر الستوب"),
        target: z.number().optional().describe("الهدف (اختياري — يحسب R:R)"),
        contractSize: z.number().optional().describe("أوقية لكل لوت (default 100)"),
      },
      async (a) => json(positionSize(a)),
    );

    server.tool(
      "multi_timeframe",
      "تحليل توب-داون: يجمع بياس 4h + 1h + 15m ويدي توصية اتجاه",
      {},
      async () => json(await multiTimeframe()),
    );

    server.tool(
      "economic_calendar",
      "الأخبار الاقتصادية عالية التأثير (NFP/CPI/FOMC) مع تحذير لو فيه خبر قريب",
      {
        currency: z.string().optional().describe("العملة (default USD، أو ALL)"),
        impact: z.string().optional().describe("High / Medium / Low / ALL (default High)"),
      },
      async ({ currency, impact }) => json(await economicCalendar({ currency, impact })),
    );
  },
  {},
  { basePath: "" },
);

// ===== مصادقة Bearer token =====
const TOKEN = process.env.MCP_TOKEN;

function unauthorized() {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null }),
    { status: 401, headers: { "content-type": "application/json" } },
  );
}

async function handler(req: Request) {
  if (TOKEN) {
    const header = req.headers.get("authorization") ?? "";
    const provided = header.replace(/^Bearer\s+/i, "").trim();
    if (provided !== TOKEN) return unauthorized();
  }
  return mcp(req);
}

export { handler as GET, handler as POST };
