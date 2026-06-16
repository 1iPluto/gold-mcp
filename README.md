# 🟡 Gold MCP Server

MCP server يجيب سعر الذهب لايف ويحسب المستويات والمناطق (SMC مبسّط) — مجاني عبر Binance PAXG/USDT.

## الأدوات (Tools)
- `get_gold_price` — السعر الحالي للذهب.
- `get_levels` — دعم/مقاومة، Premium/Discount، خط التوازن، FVG.
- `get_signal` — إشارة مبسّطة LONG/SHORT/WAIT.

## المصادقة (مهم)
التوصيل من Notion لازم يكون فيه نوع مصادقة. السيرفر بيستخدم **Bearer token**:

1. على Vercel → Project Settings → **Environment Variables**.
2. أضف متغير:
   - **Name:** `MCP_TOKEN`
   - **Value:** أي نص سري (مثال: `5e67219a192bbab8a2744ecb58cf5615844590a270d82f49`)
3. **Redeploy** المشروع (Deployments → آخر deployment → Redeploy).
4. في Notion اختر Authentication = **Bearer token** وحط نفس القيمة.

> لو ماحطتش `MCP_TOKEN` خالص، السيرفر بيفضل مفتوح (مناسب للتجربة فقط).

## التشغيل محليًا
```bash
npm install
npm run dev
# http://localhost:3000  —  MCP: http://localhost:3000/mcp
```

## النشر على Vercel
1. ارفع الفولدر على GitHub.
2. vercel.com → New Project → اختر الريبو → أضف `MCP_TOKEN` → Deploy.
3. رابط الـ MCP: `https://اسم-مشروعك.vercel.app/mcp`

## مصدر البيانات
- Binance public API — الرمز `PAXGUSDT` (توكن مدعوم بالذهب ≈ XAU/USD)، بدون مفتاح ومجاني.

> تحليل تعليمي احتمالي — مش توصية مالية.
