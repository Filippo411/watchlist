import { useState, useEffect, useCallback, useRef } from "react";

// ─── Device detection ──────────────────────────────────────────────
function useDevice() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return isMobile;
}

// ─── Sector config ──────────────────────────────────────────────────
const SECTORS = [
  { id: "all", label: "All" },
  { id: "tech", label: "Tech & AI" },
  { id: "finance", label: "Finance" },
  { id: "energy", label: "Energy" },
  { id: "space", label: "Space & Def" },
  { id: "health", label: "Health" },
];

const SM = {
  tech:    { color: "#818cf8", bg: "rgba(129,140,248,0.07)", border: "rgba(129,140,248,0.2)" },
  finance: { color: "#34d399", bg: "rgba(52,211,153,0.07)",  border: "rgba(52,211,153,0.2)"  },
  energy:  { color: "#fbbf24", bg: "rgba(251,191,36,0.07)",  border: "rgba(251,191,36,0.2)"  },
  space:   { color: "#f472b6", bg: "rgba(244,114,182,0.07)", border: "rgba(244,114,182,0.2)" },
  health:  { color: "#4ade80", bg: "rgba(74,222,128,0.07)",  border: "rgba(74,222,128,0.2)"  },
  unknown: { color: "#64748b", bg: "rgba(100,116,139,0.07)", border: "rgba(100,116,139,0.2)" },
};

const SECTOR_MAP = {
  NVDA:"tech", AMD:"tech", AMAT:"tech", ASML:"tech", MRVL:"tech", SMCI:"tech",
  DDOG:"tech", PLTR:"tech", MSFT:"tech", AAPL:"tech", GOOGL:"tech", META:"tech",
  AMZN:"tech", CRM:"tech", INTC:"tech", QCOM:"tech", ARM:"tech", TSM:"tech",
  MU:"tech", SNDK:"tech", LRCX:"tech", KLAC:"tech", AVGO:"tech", NOW:"tech",
  SNOW:"tech", ADBE:"tech", ORCL:"tech", IBM:"tech",
  "UCG.MI":"finance", "ISP.MI":"finance", "BMPS.MI":"finance",
  JPM:"finance", GS:"finance", BAC:"finance", C:"finance",
  "BNP.PA":"finance", "GLE.PA":"finance", HSBC:"finance", BBVA:"finance",
  V:"finance", MA:"finance", MS:"finance",
  GEV:"energy", ENPH:"energy", NEE:"energy",
  "ENEL.MI":"energy", "ENI.MI":"energy", XOM:"energy", CVX:"energy", VRT:"energy",
  RKLB:"space", LUNR:"space", ASTS:"space", FLY:"space", RCAT:"space",
  KTOS:"space", LHX:"space", LMT:"space", NOC:"space", RTX:"space", BA:"space",
  LLY:"health", NVO:"health", JNJ:"health", PFE:"health", MRK:"health",
  ABBV:"health", AMGN:"health", UNH:"health",
};

function detectSector(symbol, yahooSector) {
  if (SECTOR_MAP[symbol]) return SECTOR_MAP[symbol];
  if (!yahooSector) return "unknown";
  const s = yahooSector.toLowerCase();
  if (s.includes("tech") || s.includes("semi") || s.includes("software") || s.includes("internet")) return "tech";
  if (s.includes("financ") || s.includes("bank") || s.includes("insur")) return "finance";
  if (s.includes("energy") || s.includes("utility") || s.includes("oil")) return "energy";
  if (s.includes("aero") || s.includes("defense") || s.includes("industrial")) return "space";
  if (s.includes("health") || s.includes("pharma") || s.includes("bio")) return "health";
  return "unknown";
}

// ─── Yahoo Finance API ─────────────────────────────────────────────
const PROXY = "https://api.allorigins.win/get?url=";

async function fetchYF(url) {
  const r = await fetch(PROXY + encodeURIComponent(url));
  const j = await r.json();
  return JSON.parse(j.contents);
}
async function getQuote(sym) {
  const d = await fetchYF(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${sym}`);
  return d?.quoteResponse?.result?.[0];
}
async function getChart(sym, range, interval) {
  const d = await fetchYF(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=${range}&interval=${interval}`);
  return d?.chart?.result?.[0];
}
async function getSummary(sym) {
  try {
    const d = await fetchYF(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=financialData,defaultKeyStatistics`);
    return d?.quoteSummary?.result?.[0];
  } catch { return null; }
}

// ─── Math helpers ──────────────────────────────────────────────────
function calcSMA(arr, p) {
  if (!arr || arr.length < p) return null;
  return arr.slice(-p).reduce((a, b) => a + b, 0) / p;
}
function calcEMA(arr, p) {
  if (!arr || arr.length < p) return null;
  const k = 2 / (p + 1);
  let ema = arr.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < arr.length; i++) ema = arr[i] * k + ema * (1 - k);
  return ema;
}
function calcRSI(arr, p = 14) {
  if (!arr || arr.length < p + 1) return null;
  const sl = arr.slice(-p - 1);
  let g = 0, l = 0;
  for (let i = 1; i < sl.length; i++) {
    const d = sl[i] - sl[i - 1];
    d > 0 ? (g += d) : (l += Math.abs(d));
  }
  const ag = g / p, al = l / p;
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}
function calcMACD(arr) {
  if (!arr || arr.length < 26) return null;
  const e12 = calcEMA(arr, 12), e26 = calcEMA(arr, 26);
  if (!e12 || !e26) return null;
  const macd = e12 - e26;
  const sigArr = arr.slice(-35).map((_, i, a) => {
    if (i < 12) return null;
    const sl = a.slice(0, i + 1);
    const m = calcEMA(sl, 12), n = calcEMA(sl, 26);
    return m && n ? m - n : null;
  }).filter(Boolean);
  const signal = calcEMA(sigArr, 9);
  return { macd, signal, histogram: signal ? macd - signal : null };
}
function pct(a, b) { if (!b || b === 0) return null; return ((a - b) / b) * 100; }

// ─── Main data fetcher ─────────────────────────────────────────────
async function fetchStockData(symbol) {
  try {
    const [q, chart, sum] = await Promise.all([
      getQuote(symbol),
      getChart(symbol, "6mo", "1d"),
      getSummary(symbol),
    ]);
    if (!q) throw new Error("Ticker non trovato");
    const price = q.regularMarketPrice;
    const raw = chart?.indicators?.quote?.[0];
    const closes = raw?.close?.filter(Boolean) || [];
    const vols = raw?.volume?.filter(Boolean) || [];
    const ts = chart?.timestamps || [];
    const now = Date.now() / 1000;
    const gc = (target) => {
      let best = null, bd = Infinity;
      ts.forEach((t, i) => { const d = Math.abs(t - target); if (d < bd && closes[i]) { bd = d; best = closes[i]; } });
      return best;
    };
    const macdD = calcMACD(closes);
    const avgVol = vols.length > 20 ? vols.slice(-20).reduce((a, b) => a + b, 0) / 20 : null;
    const lastVol = vols[vols.length - 1];
    const pos52 = q.fiftyTwoWeekHigh && q.fiftyTwoWeekLow && q.fiftyTwoWeekHigh !== q.fiftyTwoWeekLow
      ? ((price - q.fiftyTwoWeekLow) / (q.fiftyTwoWeekHigh - q.fiftyTwoWeekLow)) * 100 : null;
    const fd = sum?.financialData, ks = sum?.defaultKeyStatistics;
    const earningsTs = q.earningsTimestamp || q.earningsTimestampStart;
    const sector = detectSector(symbol, q.sector || q.industry || "");
    return {
      symbol: q.symbol || symbol, name: q.shortName || symbol,
      price, currency: q.currency || "USD",
      change: q.regularMarketChangePercent, mktCap: q.marketCap,
      high52: q.fiftyTwoWeekHigh, low52: q.fiftyTwoWeekLow,
      p1w: pct(price, gc(now - 7 * 86400)),
      p1m: pct(price, gc(now - 30 * 86400)),
      p3m: pct(price, gc(now - 91 * 86400)),
      sma50: calcSMA(closes, 50),
      sma100: calcSMA(closes, 100),
      sma200: calcSMA(closes, Math.min(200, closes.length)),
      rsi: calcRSI(closes),
      macdSignal: macdD ? (macdD.macd > (macdD.signal || 0) ? "bull" : "bear") : null,
      distSma50: calcSMA(closes, 50) ? pct(price, calcSMA(closes, 50)) : null,
      distSma200: calcSMA(closes, Math.min(200, closes.length)) ? pct(price, calcSMA(closes, Math.min(200, closes.length))) : null,
      pos52, relVol: avgVol && lastVol ? lastVol / avgVol : null,
      pe: q.trailingPE || null,
      ps: ks?.priceToSalesTrailing12Months?.raw || null,
      grossMargin: fd?.grossMargins?.raw != null ? fd.grossMargins.raw * 100 : null,
      revenueGrowth: fd?.revenueGrowth?.raw != null ? fd.revenueGrowth.raw * 100 : null,
      debtEquity: fd?.debtToEquity?.raw || null,
      analystTP: q.targetMeanPrice || fd?.targetMeanPrice?.raw || null,
      upside: q.targetMeanPrice ? pct(q.targetMeanPrice, price) : null,
      earningsDate: earningsTs ? new Date(earningsTs * 1000).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" }) : null,
      sector: SECTOR_MAP[symbol] || sector,
      lastUpdated: new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
      error: null,
    };
  } catch (e) {
    return { symbol, name: symbol, error: e.message, sector: SECTOR_MAP[symbol] || "unknown" };
  }
}

// ─── Format helpers ────────────────────────────────────────────────
const fmt = (n, d = 2) => (n == null || isNaN(n) ? "—" : Number(n).toFixed(d));
const fmtP = (n) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${Number(n).toFixed(2)}%`);
const fmtCap = (n) => !n ? "—" : n >= 1e12 ? `${(n / 1e12).toFixed(2)}T` : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : `${(n / 1e6).toFixed(0)}M`;
const pc = (v) => v == null ? "#94a3b8" : v >= 0 ? "#22c55e" : "#f87171";
const pb = (v) => v == null ? "rgba(148,163,184,0.08)" : v >= 0 ? "rgba(34,197,94,0.08)" : "rgba(248,113,113,0.08)";
const cur = (c) => c === "EUR" ? "€" : "$";
const fmtPrice = (p, c) => `${cur(c)}${p < 10 ? fmt(p, 3) : fmt(p, 2)}`;

const DEFAULT_LIST = ["NVDA", "AMD", "PLTR", "DDOG", "MRVL", "UCG.MI", "GEV", "RKLB", "LUNR", "RCAT", "AMAT"];

// ─── Chart component (shared) ──────────────────────────────────────
const RANGES = ["1D", "1W", "1M", "3M", "YTD", "1Y", "5Y", "MAX"];
const RANGE_MAP = {
  "1D": ["1d", "5m"], "1W": ["5d", "15m"], "1M": ["1mo", "1h"],
  "3M": ["3mo", "1d"], "YTD": ["ytd", "1d"], "1Y": ["1y", "1d"],
  "5Y": ["5y", "1wk"], "MAX": ["max", "1mo"]
};

function StockChart({ symbol, color, currency, height = 140 }) {
  const [range, setRange] = useState("1M");
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef(null);

  const loadChart = async (r) => {
    setLoading(true);
    try {
      const [rv, iv] = RANGE_MAP[r];
      const d = await getChart(symbol, rv, iv);
      const closes = d?.indicators?.quote?.[0]?.close?.filter(Boolean) || [];
      const ts = d?.timestamps || [];
      setChartData({ closes, timestamps: ts });
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadChart(range); }, [symbol, range]);

  useEffect(() => {
    if (!chartData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { closes, timestamps } = chartData;
    if (!closes.length) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const min = Math.min(...closes), max = Math.max(...closes);
    const range_ = max - min || 1;
    const pad = { t: 12, b: 22, l: 8, r: 8 };
    const w = W - pad.l - pad.r, h = H - pad.t - pad.b;
    const toX = (i) => pad.l + (i / (closes.length - 1)) * w;
    const toY = (v) => pad.t + (1 - (v - min) / range_) * h;
    const isUp = closes[closes.length - 1] >= closes[0];
    const lineCol = isUp ? "#22c55e" : "#f87171";
    const gradStr = isUp ? "rgba(34,197,94," : "rgba(248,113,113,";
    const grad = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
    grad.addColorStop(0, gradStr + "0.18)");
    grad.addColorStop(1, gradStr + "0.01)");
    ctx.beginPath();
    closes.forEach((v, i) => i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v)));
    ctx.lineTo(toX(closes.length - 1), H - pad.b);
    ctx.lineTo(pad.l, H - pad.b);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.beginPath();
    closes.forEach((v, i) => i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v)));
    ctx.strokeStyle = lineCol;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.beginPath(); ctx.arc(pad.l, toY(closes[0]), 3, 0, Math.PI * 2); ctx.fillStyle = "#475569"; ctx.fill();
    ctx.beginPath(); ctx.arc(toX(closes.length - 1), toY(closes[closes.length - 1]), 4, 0, Math.PI * 2); ctx.fillStyle = lineCol; ctx.fill();
    ctx.fillStyle = "#475569"; ctx.font = "9px 'DM Mono', monospace";
    const c = cur(currency);
    ctx.fillText(`${c}${max < 10 ? max.toFixed(3) : max.toFixed(1)}`, pad.l + 3, pad.t + 9);
    ctx.fillText(`${c}${min < 10 ? min.toFixed(3) : min.toFixed(1)}`, pad.l + 3, H - pad.b - 3);
    if (timestamps.length > 1) {
      const fmtTs = range === "1D"
        ? (t) => new Date(t * 1000).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
        : ["1W", "1M"].includes(range)
        ? (t) => new Date(t * 1000).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })
        : (t) => new Date(t * 1000).toLocaleDateString("it-IT", { month: "short", year: "2-digit" });
      ctx.fillStyle = "#475569";
      ctx.fillText(fmtTs(timestamps[0]), pad.l, H - 3);
      ctx.fillText(fmtTs(timestamps[Math.floor(timestamps.length / 2)]), W / 2 - 18, H - 3);
      ctx.fillText(fmtTs(timestamps[timestamps.length - 1]), W - pad.r - 36, H - 3);
    }
  }, [chartData, range]);

  return (
    <div>
      <div style={{ display: "flex", gap: 3, marginBottom: 8, flexWrap: "wrap" }}>
        {RANGES.map(r => (
          <button key={r} onClick={() => setRange(r)}
            style={{ padding: "2px 7px", borderRadius: 4, border: `1px solid ${range === r ? color : "rgba(255,255,255,0.06)"}`, background: range === r ? `${color}18` : "transparent", color: range === r ? color : "#475569", fontSize: 10, fontFamily: "'DM Mono'", fontWeight: 700, cursor: "pointer", transition: "all 0.1s" }}>
            {r}
          </button>
        ))}
      </div>
      <div style={{ position: "relative", height }}>
        {loading && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.08)", borderTopColor: color, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          </div>
        )}
        <canvas ref={canvasRef} width={700} height={height} style={{ width: "100%", height }} />
      </div>
    </div>
  );
}

// ─── Shared KPI components ─────────────────────────────────────────
const KPIItem = ({ label, value, unit = "", color }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
    <span style={{ fontSize: 11, color: "#64748b" }}>{label}</span>
    <span style={{ fontSize: 12, fontFamily: "'DM Mono'", fontWeight: 600, color: color || "#cbd5e1" }}>{value}{unit && value !== "—" ? unit : ""}</span>
  </div>
);

const PctBadge = ({ v, size = 11 }) => (
  <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 5, background: pb(v), color: pc(v), fontSize: size, fontWeight: 700, fontFamily: "'DM Mono'", minWidth: 64, textAlign: "center" }}>
    {fmtP(v)}
  </span>
);

const SMADot = ({ price, sma, label }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
    <div style={{ width: 7, height: 7, borderRadius: "50%", background: !sma ? "#1e293b" : price > sma ? "#22c55e" : "#f87171", boxShadow: sma ? `0 0 5px ${price > sma ? "#22c55e" : "#f87171"}50` : "none" }} />
    <span style={{ fontSize: 8.5, color: !sma ? "#334155" : price > sma ? "#22c55e" : "#f87171", fontFamily: "'DM Mono'", fontWeight: 600 }}>{label}</span>
  </div>
);

const RSIBar = ({ rsi }) => {
  if (rsi == null) return <span style={{ fontSize: 11, color: "#475569" }}>—</span>;
  const col = rsi < 30 ? "#22c55e" : rsi > 70 ? "#f87171" : "#fbbf24";
  const lbl = rsi < 30 ? "OVS" : rsi > 70 ? "OVB" : "NEU";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 60, height: 5, background: "#1e293b", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(rsi, 100)}%`, height: "100%", background: col, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color: col, fontFamily: "'DM Mono'", fontWeight: 700 }}>{fmt(rsi, 0)} <span style={{ fontSize: 8 }}>{lbl}</span></span>
    </div>
  );
};

// ─── Detail Panel (shared between mobile/desktop) ──────────────────
function DetailPanel({ data, isMobile }) {
  if (!data || data.loading || data.error) return null;
  const sm = SM[data.sector || "unknown"] || SM.unknown;
  const c = cur(data.currency);

  return (
    <div style={{ padding: isMobile ? "14px" : "20px", overflowY: "auto", height: "100%" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: "'Outfit'", fontSize: isMobile ? 22 : 26, fontWeight: 900, color: "#f1f5f9", letterSpacing: "-0.5px" }}>{data.symbol}</div>
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>{data.name}</div>
          </div>
          <span style={{ fontSize: 9, padding: "3px 9px", borderRadius: 5, background: sm.bg, color: sm.color, fontWeight: 700, border: `1px solid ${sm.border}` }}>
            {SECTORS.find(s => s.id === data.sector)?.label || "Other"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 10 }}>
          <span style={{ fontFamily: "'DM Mono'", fontSize: isMobile ? 26 : 32, fontWeight: 700, color: "#f1f5f9" }}>
            {fmtPrice(data.price, data.currency)}
          </span>
          <span style={{ fontSize: 14, fontFamily: "'DM Mono'", fontWeight: 700, color: pc(data.change) }}>
            {data.change != null ? `${data.change >= 0 ? "+" : ""}${fmt(data.change)}%` : ""}
          </span>
        </div>
        <div style={{ fontSize: 9.5, color: "#475569", marginTop: 2 }}>Cap: {fmtCap(data.mktCap)} · upd. {data.lastUpdated}</div>
      </div>

      {/* Chart */}
      <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 10, padding: "12px", border: "1px solid rgba(255,255,255,0.05)", marginBottom: 14 }}>
        <StockChart symbol={data.symbol} color={sm.color} currency={data.currency} height={isMobile ? 120 : 140} />
      </div>

      {/* Performance */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7, marginBottom: 14 }}>
        {[["1 Sett.", data.p1w], ["1 Mese", data.p1m], ["3 Mesi", data.p3m]].map(([l, v]) => (
          <div key={l} style={{ background: pb(v), border: `1px solid ${pc(v)}22`, borderRadius: 8, padding: "7px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 8.5, color: "#64748b", marginBottom: 2 }}>{l}</div>
            <div style={{ fontFamily: "'DM Mono'", fontSize: 13, fontWeight: 800, color: pc(v) }}>{fmtP(v)}</div>
          </div>
        ))}
      </div>

      {/* KPIs grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 9, padding: "11px 12px", border: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ fontSize: 9.5, color: sm.color, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>FONDAMENTALI</div>
          <KPIItem label="P/E" value={data.pe ? fmt(data.pe, 1) : "—"} color={data.pe && data.pe < 20 ? "#22c55e" : data.pe && data.pe > 50 ? "#f87171" : "#cbd5e1"} />
          <KPIItem label="P/S" value={data.ps ? fmt(data.ps, 1) : "—"} color={data.ps && data.ps < 5 ? "#22c55e" : data.ps && data.ps > 20 ? "#f87171" : "#cbd5e1"} />
          <KPIItem label="Marg. Lordo" value={data.grossMargin != null ? fmt(data.grossMargin, 1) : "—"} unit="%" color={data.grossMargin > 40 ? "#22c55e" : data.grossMargin < 15 ? "#f87171" : "#cbd5e1"} />
          <KPIItem label="Cresc. Ricavi" value={data.revenueGrowth != null ? fmtP(data.revenueGrowth) : "—"} color={data.revenueGrowth > 15 ? "#22c55e" : data.revenueGrowth < 0 ? "#f87171" : "#fbbf24"} />
          <KPIItem label="Debt/Equity" value={data.debtEquity != null ? fmt(data.debtEquity / 100, 2) : "—"} color={data.debtEquity && data.debtEquity < 50 ? "#22c55e" : data.debtEquity && data.debtEquity > 200 ? "#f87171" : "#cbd5e1"} />
        </div>
        <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 9, padding: "11px 12px", border: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ fontSize: 9.5, color: sm.color, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>TECNICA</div>
          <div style={{ padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.03)", marginBottom: 2 }}>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 3 }}>RSI 14</div>
            <RSIBar rsi={data.rsi} />
          </div>
          <KPIItem label="MACD" value={data.macdSignal === "bull" ? "▲ Bullish" : data.macdSignal === "bear" ? "▼ Bearish" : "—"} color={data.macdSignal === "bull" ? "#22c55e" : data.macdSignal === "bear" ? "#f87171" : "#64748b"} />
          <KPIItem label="vs SMA 50" value={data.distSma50 != null ? fmtP(data.distSma50) : "—"} color={pc(data.distSma50)} />
          <KPIItem label="vs SMA 200" value={data.distSma200 != null ? fmtP(data.distSma200) : "—"} color={pc(data.distSma200)} />
          <KPIItem label="Vol. Relativo" value={data.relVol != null ? `${fmt(data.relVol, 2)}x` : "—"} color={data.relVol > 1.5 ? "#22c55e" : data.relVol < 0.5 ? "#f87171" : "#cbd5e1"} />
        </div>
      </div>

      {/* SMA dots */}
      <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 9, padding: "10px 14px", border: "1px solid rgba(255,255,255,0.04)", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 9.5, color: "#475569", fontWeight: 700, letterSpacing: 0.8 }}>MEDIE MOBILI</span>
          <div style={{ display: "flex", gap: 20 }}>
            <SMADot price={data.price} sma={data.sma50} label="SMA 50" />
            <SMADot price={data.price} sma={data.sma100} label="SMA 100" />
            <SMADot price={data.price} sma={data.sma200} label="SMA 200" />
          </div>
        </div>
      </div>

      {/* 52w bar */}
      {data.high52 && data.low52 && (
        <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 9, padding: "10px 14px", border: "1px solid rgba(255,255,255,0.04)", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 9.5, color: "#475569", fontWeight: 700, letterSpacing: 0.8 }}>RANGE 52 SETTIMANE</span>
            <span style={{ fontSize: 10, color: sm.color, fontFamily: "'DM Mono'", fontWeight: 700 }}>{fmt(data.pos52, 0)}%</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 9.5, color: "#64748b" }}>Min {cur(data.currency)}{fmt(data.low52, 2)}</span>
            <span style={{ fontSize: 9.5, color: "#64748b" }}>Max {cur(data.currency)}{fmt(data.high52, 2)}</span>
          </div>
          <div style={{ height: 6, background: "#1e293b", borderRadius: 3, position: "relative" }}>
            <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${data.pos52 || 0}%`, background: "linear-gradient(90deg,#22c55e,#fbbf24,#f87171)", borderRadius: 3 }} />
            <div style={{ position: "absolute", top: -3, left: `${data.pos52 || 0}%`, transform: "translateX(-50%)", width: 12, height: 12, background: "#f1f5f9", borderRadius: "50%", border: `2px solid ${sm.color}` }} />
          </div>
        </div>
      )}

      {/* Target Price */}
      {data.analystTP && (
        <div style={{ background: data.upside > 0 ? "rgba(34,197,94,0.06)" : "rgba(248,113,113,0.06)", border: `1px solid ${pc(data.upside)}25`, borderRadius: 9, padding: "14px 16px" }}>
          <div style={{ fontSize: 9.5, color: "#64748b", fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>TARGET PRICE ANALYST</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontFamily: "'DM Mono'", fontSize: isMobile ? 20 : 24, fontWeight: 800, color: "#f1f5f9" }}>{cur(data.currency)}{fmt(data.analystTP, 2)}</span>
            <span style={{ fontFamily: "'DM Mono'", fontSize: 15, fontWeight: 700, color: pc(data.upside) }}>{fmtP(data.upside)}</span>
          </div>
          {data.earningsDate && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 6 }}>
              <span>📅</span>
              <span style={{ fontSize: 11, color: "#a5b4fc", fontFamily: "'DM Mono'" }}>Earnings: {data.earningsDate}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared state hook ─────────────────────────────────────────────
function useWatchlist() {
  const [watchlist, setWatchlist] = useState(() => {
    try { const s = localStorage.getItem("wl_unified"); return s ? JSON.parse(s) : DEFAULT_LIST; } catch { return DEFAULT_LIST; }
  });
  const [stockData, setStockData] = useState({});
  const [newTicker, setNewTicker] = useState("");
  const [newSector, setNewSector] = useState("auto");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [activeTab, setActiveTab] = useState("all");
  const [selected, setSelected] = useState(null);

  useEffect(() => { try { localStorage.setItem("wl_unified", JSON.stringify(watchlist)); } catch {} }, [watchlist]);

  const loadStock = useCallback(async (sym) => {
    setStockData(prev => ({ ...prev, [sym]: { symbol: sym, loading: true, sector: SECTOR_MAP[sym] || "unknown" } }));
    const data = await fetchStockData(sym);
    if (SECTOR_MAP[sym]) data.sector = SECTOR_MAP[sym];
    setStockData(prev => ({ ...prev, [sym]: data }));
    return data;
  }, []);

  useEffect(() => {
    watchlist.forEach(s => loadStock(s));
    setLastRefresh(new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }));
    if (watchlist.length) setSelected(watchlist[0]);
  }, []);

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all(watchlist.map(s => loadStock(s)));
    setLastRefresh(new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }));
    setRefreshing(false);
  };

  const addTicker = async () => {
    const sym = newTicker.trim().toUpperCase();
    if (!sym) return;
    if (watchlist.includes(sym)) { setAddError("Già in watchlist"); setTimeout(() => setAddError(""), 2000); return; }
    setAdding(true); setAddError("");
    if (newSector !== "auto") SECTOR_MAP[sym] = newSector;
    const data = await fetchStockData(sym);
    if (data.error) { setAddError("Ticker non trovato"); setAdding(false); delete SECTOR_MAP[sym]; setTimeout(() => setAddError(""), 3000); return; }
    setWatchlist(prev => [...prev, sym]);
    setStockData(prev => ({ ...prev, [sym]: data }));
    setSelected(sym); setNewTicker(""); setAdding(false);
  };

  const removeTicker = useCallback((sym) => {
    setWatchlist(prev => {
      const n = prev.filter(s => s !== sym);
      setSelected(prev_ => prev_ === sym ? (n[0] || null) : prev_);
      return n;
    });
    setStockData(prev => { const n = { ...prev }; delete n[sym]; return n; });
  }, []);

  const visible = watchlist.filter(s => activeTab === "all" || (stockData[s]?.sector || "unknown") === activeTab);
  const loaded = watchlist.filter(s => stockData[s] && !stockData[s]?.loading && !stockData[s]?.error);
  const up1w = loaded.filter(s => (stockData[s]?.p1w || 0) >= 0).length;
  const sc = {};
  loaded.forEach(s => { const sec = stockData[s]?.sector || "unknown"; sc[sec] = (sc[sec] || 0) + 1; });

  return { watchlist, stockData, newTicker, setNewTicker, newSector, setNewSector, adding, addError, refreshing, lastRefresh, activeTab, setActiveTab, selected, setSelected, loadStock, refreshAll, addTicker, removeTicker, visible, loaded, up1w, sc };
}

// ─── MOBILE VIEW ───────────────────────────────────────────────────
function MobileView(props) {
  const { watchlist, stockData, newTicker, setNewTicker, newSector, setNewSector, adding, addError, refreshing, lastRefresh, activeTab, setActiveTab, selected, setSelected, refreshAll, addTicker, removeTicker, visible, loaded, up1w, sc } = props;
  const [detailOpen, setDetailOpen] = useState(false);

  const handleSelect = (sym) => {
    setSelected(sym);
    setDetailOpen(true);
  };

  return (
    <div style={{ fontFamily: "'DM Mono', monospace", background: "#080b12", color: "#e2e8f0", minHeight: "100vh", maxWidth: 430, margin: "0 auto", paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ padding: "14px 14px 8px", position: "sticky", top: 0, background: "#080b12", zIndex: 100, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <div style={{ fontFamily: "'Outfit'", fontSize: 21, fontWeight: 900, letterSpacing: "-0.7px" }}>
              WATCH<span style={{ color: "#6366f1" }}>LIST</span>
            </div>
            <div style={{ fontSize: 9, color: "#334155" }}>{loaded.length} titoli {lastRefresh && `· upd. ${lastRefresh}`}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 700 }}>▲{up1w}</span>
            <span style={{ fontSize: 11, color: "#f87171", fontWeight: 700 }}>▼{loaded.length - up1w}</span>
            <button onClick={refreshAll} disabled={refreshing}
              style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)", color: "#818cf8", borderRadius: 8, padding: "6px 11px", fontSize: 11, fontFamily: "'Outfit'", fontWeight: 700, cursor: "pointer", opacity: refreshing ? 0.5 : 1 }}>
              {refreshing ? "..." : "↻"}
            </button>
          </div>
        </div>
        {/* Add */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input value={newTicker} onChange={e => setNewTicker(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && addTicker()}
            placeholder="Ticker (es. NVDA, UCG.MI)"
            style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: `1px solid ${addError ? "rgba(248,113,113,0.4)" : "rgba(255,255,255,0.07)"}`, borderRadius: 8, padding: "8px 11px", color: "#e2e8f0", fontSize: 13, fontFamily: "'DM Mono'" }} />
          <select value={newSector} onChange={e => setNewSector(e.target.value)}
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "8px", color: "#94a3b8", fontSize: 11, cursor: "pointer" }}>
            <option value="auto">Auto</option>
            {SECTORS.filter(s => s.id !== "all").map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button onClick={addTicker} disabled={adding || !newTicker.trim()}
            style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)", border: "none", color: "white", borderRadius: 8, padding: "8px 13px", fontSize: 14, fontFamily: "'Outfit'", fontWeight: 900, cursor: "pointer", opacity: adding || !newTicker.trim() ? 0.5 : 1 }}>+</button>
        </div>
        {addError && <div style={{ fontSize: 10, color: "#f87171", marginBottom: 6 }}>{addError}</div>}
        {/* Tabs */}
        <div style={{ display: "flex", gap: 5, overflowX: "auto" }}>
          {SECTORS.map(s => {
            const cnt = s.id === "all" ? loaded.length : (sc[s.id] || 0);
            const active = activeTab === s.id;
            const sm_ = SM[s.id] || SM.unknown;
            return (
              <button key={s.id} onClick={() => setActiveTab(s.id)}
                style={{ flexShrink: 0, padding: "4px 10px", borderRadius: 7, border: `1px solid ${active ? sm_.color : "rgba(255,255,255,0.06)"}`, background: active ? sm_.bg : "transparent", color: active ? sm_.color : "#475569", fontSize: 10.5, fontFamily: "'Outfit'", fontWeight: 700, cursor: "pointer" }}>
                {s.label} {cnt > 0 && <span style={{ fontSize: 8.5 }}>{cnt}</span>}
              </button>
            );
          })}
        </div>
      </div>
      {/* Cards */}
      <div style={{ padding: "8px 14px" }}>
        {visible.map(sym => {
          const d = stockData[sym] || { symbol: sym, loading: true, sector: SECTOR_MAP[sym] || "unknown" };
          const sm_ = SM[d.sector || "unknown"] || SM.unknown;
          if (d.loading) return (
            <div key={sym} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: "13px 14px", marginBottom: 7, display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "'Outfit'", fontSize: 15, fontWeight: 800, color: "#64748b" }}>{sym}</span>
              <div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
            </div>
          );
          if (d.error) return (
            <div key={sym} style={{ background: "rgba(248,113,113,0.04)", border: "1px solid rgba(248,113,113,0.12)", borderRadius: 12, padding: "11px 14px", marginBottom: 7, display: "flex", justifyContent: "space-between" }}>
              <div><div style={{ fontFamily: "'Outfit'", fontSize: 14, fontWeight: 800, color: "#f87171" }}>{sym}</div><div style={{ fontSize: 10, color: "#64748b" }}>{d.error}</div></div>
              <button onClick={() => removeTicker(sym)} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 18 }}>×</button>
            </div>
          );
          return (
            <div key={sym} onClick={() => handleSelect(sym)}
              style={{ background: selected === sym ? sm_.bg : "rgba(255,255,255,0.02)", border: `1px solid ${selected === sym ? sm_.border : "rgba(255,255,255,0.05)"}`, borderRadius: 13, padding: "12px 14px", marginBottom: 7, cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontFamily: "'Outfit'", fontSize: 15, fontWeight: 900, color: "#f1f5f9" }}>{d.symbol}</span>
                    <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: sm_.bg, color: sm_.color, fontWeight: 700 }}>{SECTORS.find(s => s.id === d.sector)?.label || "Other"}</span>
                  </div>
                  <div style={{ fontSize: 9.5, color: "#475569", marginTop: 1, maxWidth: 180, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "'DM Mono'", fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>{fmtPrice(d.price, d.currency)}</div>
                    <div style={{ fontSize: 10.5, color: pc(d.change), fontWeight: 700, fontFamily: "'DM Mono'" }}>{d.change != null ? `${d.change >= 0 ? "+" : ""}${fmt(d.change)}%` : ""}</div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); removeTicker(sym); }} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", color: "#475569", cursor: "pointer", fontSize: 13, width: 22, height: 22, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5, marginBottom: 8 }}>
                {[["1S", d.p1w], ["1M", d.p1m], ["3M", d.p3m]].map(([l, v]) => (
                  <div key={l} style={{ textAlign: "center", background: "rgba(255,255,255,0.02)", borderRadius: 7, padding: "4px 0" }}>
                    <div style={{ fontSize: 8, color: "#475569", marginBottom: 2 }}>{l}</div>
                    <PctBadge v={v} />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 8.5, color: "#334155", minWidth: 26 }}>SMA</span>
                <div style={{ display: "flex", gap: 16 }}>
                  <SMADot price={d.price} sma={d.sma50} label="50" />
                  <SMADot price={d.price} sma={d.sma100} label="100" />
                  <SMADot price={d.price} sma={d.sma200} label="200" />
                </div>
                {d.analystTP && (
                  <div style={{ marginLeft: "auto", textAlign: "right" }}>
                    <span style={{ fontSize: 9.5, color: "#475569" }}>TP </span>
                    <span style={{ fontSize: 10.5, fontFamily: "'DM Mono'", fontWeight: 700, color: pc(d.upside) }}>{cur(d.currency)}{fmt(d.analystTP, 2)} ({fmtP(d.upside)})</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {visible.length === 0 && (
          <div style={{ textAlign: "center", padding: "50px 20px", color: "#334155" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
            <div style={{ fontSize: 12 }}>{watchlist.length === 0 ? "Aggiungi il primo ticker" : "Nessun titolo in questo settore"}</div>
          </div>
        )}
      </div>
      {/* Detail modal */}
      {detailOpen && selected && stockData[selected] && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200, backdropFilter: "blur(4px)" }} onClick={() => setDetailOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "90vh", background: "#0d1117", borderRadius: "16px 16px 0 0", overflowY: "auto", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ fontSize: 12, color: "#475569" }}>Dettaglio</span>
              <button onClick={() => setDetailOpen(false)} style={{ background: "rgba(255,255,255,0.06)", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16, width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>
            <DetailPanel data={stockData[selected]} isMobile={true} />
          </div>
        </div>
      )}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Outfit:wght@600;700;800;900&display=swap');*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}@keyframes spin{to{transform:rotate(360deg)}}::-webkit-scrollbar{display:none}input:focus,select:focus{outline:none}input::placeholder{color:#334155}`}</style>
    </div>
  );
}

// ─── DESKTOP VIEW ──────────────────────────────────────────────────
function DesktopView(props) {
  const { watchlist, stockData, newTicker, setNewTicker, newSector, setNewSector, adding, addError, refreshing, lastRefresh, activeTab, setActiveTab, selected, setSelected, refreshAll, addTicker, removeTicker, visible, loaded, up1w, sc } = props;

  return (
    <div style={{ fontFamily: "'DM Mono', monospace", background: "#060810", color: "#e2e8f0", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Top bar */}
      <div style={{ padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 16, flexShrink: 0, background: "#080b12" }}>
        <div style={{ fontFamily: "'Outfit'", fontSize: 18, fontWeight: 900, letterSpacing: "-0.5px" }}>
          WATCH<span style={{ color: "#6366f1" }}>LIST</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 12, borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
          <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 700 }}>▲{up1w}</span>
          <span style={{ fontSize: 11, color: "#f87171", fontWeight: 700 }}>▼{loaded.length - up1w}</span>
          <span style={{ fontSize: 9.5, color: "#334155" }}>{loaded.length} titoli{lastRefresh && ` · ${lastRefresh}`}</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {SECTORS.map(s => {
            const cnt = s.id === "all" ? loaded.length : (sc[s.id] || 0);
            const active = activeTab === s.id;
            const sm_ = SM[s.id] || SM.unknown;
            return (
              <button key={s.id} onClick={() => setActiveTab(s.id)}
                style={{ padding: "4px 11px", borderRadius: 6, border: `1px solid ${active ? sm_.color : "rgba(255,255,255,0.06)"}`, background: active ? sm_.bg : "transparent", color: active ? sm_.color : "#475569", fontSize: 10.5, fontFamily: "'Outfit'", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, transition: "all 0.15s" }}>
                {s.label} {cnt > 0 && <span style={{ fontSize: 9 }}>{cnt}</span>}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto", alignItems: "center" }}>
          <input value={newTicker} onChange={e => setNewTicker(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && addTicker()}
            placeholder="Aggiungi ticker..."
            style={{ width: 155, background: "rgba(255,255,255,0.04)", border: `1px solid ${addError ? "rgba(248,113,113,0.4)" : "rgba(255,255,255,0.07)"}`, borderRadius: 7, padding: "6px 10px", color: "#e2e8f0", fontSize: 12, fontFamily: "'DM Mono'" }} />
          <select value={newSector} onChange={e => setNewSector(e.target.value)}
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 7, padding: "6px 7px", color: "#94a3b8", fontSize: 11, cursor: "pointer" }}>
            <option value="auto">Auto</option>
            {SECTORS.filter(s => s.id !== "all").map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button onClick={addTicker} disabled={adding || !newTicker.trim()}
            style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)", border: "none", color: "white", borderRadius: 7, padding: "6px 14px", fontSize: 12, fontFamily: "'Outfit'", fontWeight: 800, cursor: "pointer", opacity: adding || !newTicker.trim() ? 0.5 : 1 }}>
            {adding ? "..." : "+ Add"}
          </button>
          <button onClick={refreshAll} disabled={refreshing}
            style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", color: "#818cf8", borderRadius: 7, padding: "6px 12px", fontSize: 11, fontFamily: "'Outfit'", fontWeight: 700, cursor: "pointer", opacity: refreshing ? 0.5 : 1 }}>
            {refreshing ? "..." : "↻ Refresh"}
          </button>
        </div>
      </div>
      {addError && <div style={{ padding: "3px 20px", fontSize: 10, color: "#f87171", background: "rgba(248,113,113,0.05)" }}>{addError}</div>}
      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Table */}
        <div style={{ flex: "0 0 60%", overflowY: "auto", borderRight: "1px solid rgba(255,255,255,0.05)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, background: "#080b12", zIndex: 5 }}>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["Ticker","Settore","Prezzo","Giorno","1S","1M","3M","SMA","Target","Earnings",""].map((h, i) => (
                  <th key={i} style={{ padding: `8px 6px 8px ${i === 0 ? "16px" : "6px"}`, fontSize: 9, fontWeight: 700, color: "#475569", textAlign: "left", fontFamily: "'DM Mono'", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(sym => {
                const d = stockData[sym] || { symbol: sym, loading: true, sector: SECTOR_MAP[sym] || "unknown" };
                const sm_ = SM[d.sector || "unknown"] || SM.unknown;
                if (d.loading) return (
                  <tr key={sym} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <td colSpan={11} style={{ padding: "10px 16px", fontSize: 11, color: "#475569" }}>
                      <span style={{ display: "inline-block", width: 11, height: 11, border: "1.5px solid rgba(255,255,255,0.08)", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 0.7s linear infinite", marginRight: 8, verticalAlign: "middle" }} />
                      {sym}
                    </td>
                  </tr>
                );
                if (d.error) return (
                  <tr key={sym} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <td style={{ padding: "10px 16px", fontFamily: "'DM Mono'", fontSize: 12, color: "#f87171" }}>{sym}</td>
                    <td colSpan={9} style={{ fontSize: 10, color: "#64748b" }}>{d.error}</td>
                    <td><button onClick={() => removeTicker(sym)} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer" }}>×</button></td>
                  </tr>
                );
                const isActive = selected === sym;
                return (
                  <tr key={sym} onClick={() => setSelected(sym)} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)", background: isActive ? sm_.bg : "transparent", cursor: "pointer", transition: "background 0.1s" }}
                    onMouseEnter={e => !isActive && (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                    onMouseLeave={e => !isActive && (e.currentTarget.style.background = "transparent")}>
                    <td style={{ padding: "9px 6px 9px 16px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <div style={{ width: 3, height: 30, borderRadius: 2, background: sm_.color }} />
                        <div>
                          <div style={{ fontFamily: "'Outfit'", fontSize: 13, fontWeight: 900, color: "#f1f5f9" }}>{d.symbol}</div>
                          <div style={{ fontSize: 8.5, color: "#475569", maxWidth: 110, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "9px 6px" }}><span style={{ fontSize: 8.5, padding: "1px 6px", borderRadius: 4, background: sm_.bg, color: sm_.color, fontWeight: 700, whiteSpace: "nowrap" }}>{SECTORS.find(s => s.id === d.sector)?.label || "Other"}</span></td>
                    <td style={{ padding: "9px 6px", fontFamily: "'DM Mono'", fontSize: 13, fontWeight: 700, color: "#f1f5f9", whiteSpace: "nowrap" }}>{fmtPrice(d.price, d.currency)}</td>
                    <td style={{ padding: "9px 6px" }}><span style={{ fontSize: 11, fontFamily: "'DM Mono'", fontWeight: 700, color: pc(d.change) }}>{d.change != null ? `${d.change >= 0 ? "+" : ""}${fmt(d.change)}%` : "—"}</span></td>
                    {[d.p1w, d.p1m, d.p3m].map((v, i) => (
                      <td key={i} style={{ padding: "9px 4px" }}>
                        <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 4, background: pb(v), color: pc(v), fontSize: 10.5, fontFamily: "'DM Mono'", fontWeight: 700, minWidth: 54, textAlign: "center" }}>{fmtP(v)}</span>
                      </td>
                    ))}
                    <td style={{ padding: "9px 8px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        {[["50", d.sma50], ["100", d.sma100], ["200", d.sma200]].map(([l, s]) => (
                          <div key={l} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                            <div style={{ width: 6, height: 6, borderRadius: "50%", background: !s ? "#1e293b" : d.price > s ? "#22c55e" : "#f87171" }} />
                            <span style={{ fontSize: 7.5, color: "#475569" }}>{l}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: "9px 6px", whiteSpace: "nowrap" }}>
                      {d.analystTP ? <div><div style={{ fontFamily: "'DM Mono'", fontSize: 11.5, fontWeight: 700, color: "#f1f5f9" }}>{cur(d.currency)}{fmt(d.analystTP, 2)}</div><div style={{ fontSize: 9.5, fontFamily: "'DM Mono'", color: pc(d.upside) }}>{fmtP(d.upside)}</div></div> : <span style={{ color: "#334155" }}>—</span>}
                    </td>
                    <td style={{ padding: "9px 6px", whiteSpace: "nowrap" }}>
                      {d.earningsDate ? <span style={{ fontSize: 9.5, color: "#a5b4fc", fontFamily: "'DM Mono'" }}>📅 {d.earningsDate}</span> : <span style={{ color: "#334155" }}>—</span>}
                    </td>
                    <td style={{ padding: "9px 8px 9px 4px" }}>
                      <button onClick={e => { e.stopPropagation(); removeTicker(sym); }} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", color: "#475569", cursor: "pointer", fontSize: 12, width: 20, height: 20, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visible.length === 0 && (
            <div style={{ padding: "60px 20px", textAlign: "center", color: "#334155" }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>📊</div>
              <div>{watchlist.length === 0 ? "Aggiungi il primo ticker" : "Nessun titolo in questo settore"}</div>
            </div>
          )}
        </div>
        {/* Detail */}
        <div style={{ flex: 1, overflowY: "auto", borderLeft: `1px solid ${selected && stockData[selected] ? (SM[stockData[selected]?.sector || "unknown"] || SM.unknown).border : "rgba(255,255,255,0.04)"}` }}>
          {selected && stockData[selected] && !stockData[selected]?.loading && !stockData[selected]?.error
            ? <div style={{ animation: "fadeIn 0.2s ease" }}><DetailPanel data={stockData[selected]} isMobile={false} /></div>
            : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#1e293b", flexDirection: "column", gap: 8 }}><div style={{ fontSize: 36 }}>◎</div><div style={{ fontSize: 13 }}>Seleziona un titolo</div></div>
          }
        </div>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Outfit:wght@600;700;800;900&display=swap');*{box-sizing:border-box}@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:#0d1117}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}input:focus,select:focus{outline:none}input::placeholder{color:#334155}`}</style>
    </div>
  );
}

// ─── ROOT COMPONENT ────────────────────────────────────────────────
export default function App() {
  const isMobile = useDevice();
  const state = useWatchlist();
  return isMobile ? <MobileView {...state} /> : <DesktopView {...state} />;
}
