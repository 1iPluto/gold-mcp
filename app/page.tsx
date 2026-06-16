import type { CSSProperties } from "react";

const pageStyle: CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  padding: 32,
  lineHeight: 1.8,
};

export default function Home() {
  return (
    <main style={pageStyle}>
      <h1>🟡 Gold MCP Server</h1>
      <p>السيرفر شغّال ✅</p>
      <p>
        نقطة اتصال الـ MCP: <code>/mcp</code>
      </p>
      <ul>
        <li><code>get_gold_price</code> — السعر الحالي</li>
        <li><code>get_levels</code> — المستويات والمناطق</li>
        <li><code>get_signal</code> — إشارة مبسّطة</li>
      </ul>
    </main>
  );
}
