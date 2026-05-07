import { useState, useEffect, useCallback, useRef } from "react";

// ─── CONFIG ────────────────────────────────────────────────────────
const API_KEY = "d7ub66pr01qnv95mut3gd7ub66pr01qnv95mut40";
const FH_PROXY = "https://watchlistfinance.filo411.workers.dev";

// ─── Device detection ──────────────────────────────────────────────
function useDevice() {
  const [mob, setMob] = useState(window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMob(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mob;
}

// ─── Sector config ──────────────────────────────────────────────────
const SECTORS = [
  { id: "all",     label: "All" },
  { id: "tech",    label: "Tech & AI" },
  { id: "finance", label: "Finance" },
  { id: "energy",  label: "Energy" },
  { id: "space",   label: "Space & Def" },
  { id: "health",  label: "Health" },
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
  NVDA:"tech",AMD:"tech",AMAT:"tech",ASML:"tech",MRVL:"tech",SMCI:"tech",
  DDOG:"tech",PLTR:"tech",MSFT:"tech",AAPL:"tech",GOOGL:"tech",META:"tech",
  AMZN:"tech",CRM:"tech",INTC:"tech",QCOM:"tech",ARM:"tech",TSM:"tech",
  MU:"tech",SNDK:"tech",LRCX:"tech",KLAC:"tech",AVGO:"tech",NOW:"tech",
  SNOW:"tech",ADBE:"tech",ORCL:"tech",IBM:"tech",
  "UCG.MI":"finance","ISP.MI":"finance","BMPS.MI":"finance",
  JPM:"finance",GS:"finance",BAC:"finance",C:"finance",
  "BNP.PA":"finance","GLE.PA":"finance",HSBC:"finance",BBVA:"finance",
  V:"finance",MA:"finance",MS:"finance",
  GEV:"energy",ENPH:"energy",NEE:"energy",
  "ENEL.MI":"energy","ENI.MI":"energy",XOM:"energy",CVX:"energy",VRT:"energy",
  RKLB:"space",LUNR:"space",ASTS:"space",FLY:"space",RCAT:"space",
  KTOS:"space",LHX:"space",LMT:"space",NOC:"space",RTX:"space",BA:"space",
  LLY:"health",NVO:"health",JNJ:"health",PFE:"health",MRK:"health",
  ABBV:"health",AMGN:"health",UNH:"health",
};

function detectSector(symbol, industry) {
  if (SECTOR_MAP[symbol]) return SECTOR_MAP[symbol];
  if (!industry) return "unknown";
  const s = industry.toLowerCase();
  if (s.includes("tech") || s.includes("semi") || s.includes("software") || s.includes("internet")) return "tech";
  if (s.includes("financ") || s.includes("bank") || s.includes("insur")) return "finance";
  if (s.includes("energy") || s.includes("utility") || s.includes("oil")) return "energy";
  if (s.includes("aero") || s.includes("defense") || s.includes("industrial")) return "space";
  if (s.includes("health") || s.includes("pharma") || s.includes("bio")) return "health";
  return "unknown";
}

// ─── Finnhub API calls ─────────────────────────────────────────────
const fh = async (path) => {
  const target = encodeURIComponent(`https://finnhub.io/api/v1${path}&token=X`);
  const r = await fetch(`${FH_PROXY}?url=${target}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

// Finnhub uses exchange:ticker for non-US (e.g. "MIL:UCG" for UCG.MI)
function toFinnhubSymbol(symbol) {
  if (symbol.endsWith(".MI")) return `MIL:${symbol.replace(".MI", "")}`;
  if (symbol.endsWith(".PA")) return `EPA:${symbol.replace(".PA", "")}`;
  if (symbol.endsWith(".AS")) return `AMS:${symbol.replace(".AS", "")}`;
  if (symbol.endsWith(".DE")) return `XETR:${symbol.replace(".DE", "")}`;
  if (symbol.endsWith(".L"))  return `LSE:${symbol.replace(".L", "")}`;
  return symbol;
}

// ─── Math helpers ──────────────────────────────────────────────────
function calcSMA(arr, p) {
  if (!arr || arr.length < p) return null;
  return arr.slice(-p).reduce((a, b) => a + b, 0) / p;
}
function calcEMA(arr, p) {
  if (!arr || arr.length < p) return null;
  const k = 2 / (p + 1);
  let e = arr.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
  return e;
}
function calcRSI(arr, p = 14) {
  if (!arr || arr.length < p + 1) return null;
  const sl = arr.slice(-p - 1);
  let g = 0, l = 0;
  for (let i = 1; i < sl.length; i++) { const d = sl[i] - sl[i-1]; d > 0 ? g += d : l += Math.abs(d); }
  const ag = g/p, al = l/p;
  return al === 0 ? 100 : 100 - 100/(1 + ag/al);
}
function calcMACD(arr) {
  if (!arr || arr.length < 26) return null;
  const e12 = calcEMA(arr, 12), e26 = calcEMA(arr, 26);
  if (!e12 || !e26) return null;
  const macd = e12 - e26;
  const sigArr = [];
  for (let i = 14; i <= arr.length; i++) {
    const sl = arr.slice(0, i);
    const m = calcEMA(sl, 12), n = calcEMA(sl, 26);
    if (m && n) sigArr.push(m - n);
  }
  const signal = calcEMA(sigArr, 9);
  return { macd, signal, bull: macd > (signal || 0) };
}
function pct(a, b) { if (!b || b === 0) return null; return ((a - b) / b) * 100; }

// ─── Main data fetcher ─────────────────────────────────────────────
async function fetchStock(symbol) {
  try {
    const fhSym = toFinnhubSymbol(symbol);

    // Fetch in parallel: quote, profile, basic financials
    const [quote, profile, financials] = await Promise.all([
      fh(`/quote?symbol=${fhSym}`),
      fh(`/stock/profile2?symbol=${fhSym}`),
      fh(`/stock/metric?symbol=${fhSym}&metric=all`),
    ]);

    if (!quote || (quote.c === 0 && quote.pc === 0)) throw new Error("Ticker non trovato");
    const price = quote.c || quote.pc;

    const price = quote.c;
    const m = financials?.metric || {};

    // Historical data for SMA + performance (6 months daily)
    const now = Math.floor(Date.now() / 1000);
    const from6m = now - 180 * 86400;
    const candles = await fh(`/stock/candle?symbol=${fhSym}&resolution=D&from=${from6m}&to=${now}`);
    const closes = candles?.c?.filter(Boolean) || [];
    const times  = candles?.t || [];

    // Earnings calendar (next 3 months)
    const today = new Date().toISOString().split("T")[0];
    const in90  = new Date(Date.now() + 90*86400*1000).toISOString().split("T")[0];
    let earningsDate = null;
    try {
      const cal = await fh(`/calendar/earnings?from=${today}&to=${in90}&symbol=${fhSym}`);
      const upcoming = cal?.earningsCalendar?.filter(e => e.date >= today);
      if (upcoming?.length) earningsDate = upcoming[0].date;
    } catch {}

    // Price target
    let analystTP = null, upside = null;
    try {
      const pt = await fh(`/stock/price-target?symbol=${fhSym}`);
      if (pt?.targetMean) {
        analystTP = pt.targetMean;
        upside = pct(pt.targetMean, price);
      }
    } catch {}

    // Performance
    const gc = (target) => {
      let best = null, bd = Infinity;
      times.forEach((t, i) => { const d = Math.abs(t - target); if (d < bd && closes[i]) { bd = d; best = closes[i]; } });
      return best;
    };
    const p1w = pct(price, gc(now - 7*86400));
    const p1m = pct(price, gc(now - 30*86400));
    const p3m = pct(price, gc(now - 91*86400));

    // SMAs
    const sma50  = calcSMA(closes, 50);
    const sma100 = calcSMA(closes, 100);
    const sma200 = calcSMA(closes, Math.min(200, closes.length));

    // Technical
    const rsi = calcRSI(closes);
    const macd = calcMACD(closes);
    const distSma50  = sma50  ? pct(price, sma50)  : null;
    const distSma200 = sma200 ? pct(price, sma200) : null;
    const pos52 = m["52WeekHigh"] && m["52WeekLow"] && m["52WeekHigh"] !== m["52WeekLow"]
      ? ((price - m["52WeekLow"]) / (m["52WeekHigh"] - m["52WeekLow"])) * 100 : null;

    // Fundamentals from metric
    const pe           = m.peBasicExclExtraTTM   || m.peNormalizedAnnual || null;
    const ps           = m.psTTM                 || null;
    const grossMargin  = m.grossMarginTTM != null ? m.grossMarginTTM * 100 : null;
    const revenueGrowth = m.revenueGrowthTTMYoy != null ? m.revenueGrowthTTMYoy * 100 : null;
    const debtEquity   = m.totalDebt_totalEquityAnnual || null;
    const mktCap       = profile?.marketCapitalization ? profile.marketCapitalization * 1e6 : null;

    const sector = detectSector(symbol, profile?.finnhubIndustry || "");

    return {
      symbol, name: profile?.name || symbol,
      price, currency: profile?.currency || "USD",
      change: quote.dp,
      mktCap,
      high52: m["52WeekHigh"], low52: m["52WeekLow"],
      p1w, p1m, p3m,
      sma50, sma100, sma200,
      rsi, macdSignal: macd ? (macd.bull ? "bull" : "bear") : null,
      distSma50, distSma200, pos52,
      pe, ps, grossMargin, revenueGrowth, debtEquity,
      analystTP, upside, earningsDate,
      sector,
      chartCloses: closes, chartTimes: times,
      lastUpdated: new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
      error: null,
    };
  } catch (e) {
    return { symbol, name: symbol, error: e.message, sector: SECTOR_MAP[symbol] || "unknown" };
  }
}

// ─── Chart component ───────────────────────────────────────────────
const RANGES = ["1D","1W","1M","3M","YTD","1Y","5Y","MAX"];
const RANGE_DAYS = { "1D":1,"1W":7,"1M":30,"3M":91,"YTD":-1,"1Y":365,"5Y":1825,"MAX":3650 };
const RANGE_RES  = { "1D":"5","1W":"15","1M":"60","3M":"D","YTD":"D","1Y":"D","5Y":"W","MAX":"M" };

function StockChart({ symbol, color, height = 140 }) {
  const [range, setRange] = useState("1M");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef(null);
  const fhSym = toFinnhubSymbol(symbol);

  const load = async (r) => {
    setLoading(true);
    try {
      const now = Math.floor(Date.now() / 1000);
      let fromTs;
      if (r === "YTD") { const y = new Date(); y.setMonth(0,1); fromTs = Math.floor(y/1000); }
      else fromTs = now - RANGE_DAYS[r] * 86400;
      const res = RANGE_RES[r];
      const d = await fh(`/stock/candle?symbol=${fhSym}&resolution=${res}&from=${fromTs}&to=${now}`);
      if (d?.s === "ok") setData({ closes: d.c, times: d.t });
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(range); }, [symbol, range]);

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { closes } = data;
    if (!closes?.length) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const min = Math.min(...closes), max = Math.max(...closes);
    const rng = max - min || 1;
    const pad = { t:12, b:22, l:8, r:8 };
    const w = W - pad.l - pad.r, h = H - pad.t - pad.b;
    const tx = (i) => pad.l + (i / (closes.length - 1)) * w;
    const ty = (v) => pad.t + (1 - (v - min) / rng) * h;
    const isUp = closes[closes.length-1] >= closes[0];
    const lc = isUp ? "#22c55e" : "#f87171";
    const gs = isUp ? "rgba(34,197,94," : "rgba(248,113,113,";
    const grad = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
    grad.addColorStop(0, gs + "0.15)"); grad.addColorStop(1, gs + "0.01)");
    ctx.beginPath();
    closes.forEach((v, i) => i === 0 ? ctx.moveTo(tx(i), ty(v)) : ctx.lineTo(tx(i), ty(v)));
    ctx.lineTo(tx(closes.length-1), H-pad.b); ctx.lineTo(pad.l, H-pad.b); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath();
    closes.forEach((v, i) => i === 0 ? ctx.moveTo(tx(i), ty(v)) : ctx.lineTo(tx(i), ty(v)));
    ctx.strokeStyle = lc; ctx.lineWidth = 1.8; ctx.lineJoin = "round"; ctx.stroke();
    ctx.beginPath(); ctx.arc(pad.l, ty(closes[0]), 3, 0, Math.PI*2); ctx.fillStyle = "#475569"; ctx.fill();
    ctx.beginPath(); ctx.arc(tx(closes.length-1), ty(closes[closes.length-1]), 4, 0, Math.PI*2); ctx.fillStyle = lc; ctx.fill();
    ctx.fillStyle = "#475569"; ctx.font = "9px 'DM Mono', monospace";
    ctx.fillText(`${max.toFixed(max<10?3:1)}`, pad.l+3, pad.t+9);
    ctx.fillText(`${min.toFixed(min<10?3:1)}`, pad.l+3, H-pad.b-3);
  }, [data]);

  return (
    <div>
      <div style={{ display:"flex", gap:3, marginBottom:8, flexWrap:"wrap" }}>
        {RANGES.map(r => (
          <button key={r} onClick={() => setRange(r)}
            style={{ padding:"2px 7px", borderRadius:4, border:`1px solid ${range===r?color:"rgba(255,255,255,0.06)"}`, background:range===r?`${color}18`:"transparent", color:range===r?color:"#475569", fontSize:10, fontFamily:"'DM Mono'", fontWeight:700, cursor:"pointer" }}>
            {r}
          </button>
        ))}
      </div>
      <div style={{ position:"relative", height }}>
        {loading && <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center" }}><div style={{ width:16,height:16,border:"2px solid rgba(255,255,255,0.08)",borderTopColor:color,borderRadius:"50%",animation:"spin 0.7s linear infinite" }}/></div>}
        <canvas ref={canvasRef} width={700} height={height} style={{ width:"100%", height }} />
      </div>
    </div>
  );
}

// ─── Format helpers ────────────────────────────────────────────────
const fmt   = (n,d=2) => n==null||isNaN(n) ? "—" : Number(n).toFixed(d);
const fmtP  = (n)     => n==null ? "—" : `${n>=0?"+":""}${Number(n).toFixed(2)}%`;
const fmtCap= (n)     => !n?"—":n>=1e12?`${(n/1e12).toFixed(2)}T`:n>=1e9?`${(n/1e9).toFixed(1)}B`:`${(n/1e6).toFixed(0)}M`;
const pc    = (v)     => v==null?"#94a3b8":v>=0?"#22c55e":"#f87171";
const pb    = (v)     => v==null?"rgba(148,163,184,0.08)":v>=0?"rgba(34,197,94,0.08)":"rgba(248,113,113,0.08)";
const cur   = (c)     => c==="EUR"?"€":"$";
const fmtPr = (p,c)   => `${cur(c)}${p<10?fmt(p,3):fmt(p,2)}`;

const DEFAULT_LIST = ["NVDA","AMD","PLTR","DDOG","MRVL","UCG.MI","GEV","RKLB","LUNR","RCAT","AMAT"];

// ─── Shared KPI components ─────────────────────────────────────────
const KPIItem = ({ label, value, unit="", color }) => (
  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,0.03)" }}>
    <span style={{ fontSize:11, color:"#64748b" }}>{label}</span>
    <span style={{ fontSize:12, fontFamily:"'DM Mono'", fontWeight:600, color:color||"#cbd5e1" }}>{value}{unit&&value!=="—"?unit:""}</span>
  </div>
);

const PctBadge = ({ v }) => (
  <span style={{ display:"inline-block",padding:"2px 8px",borderRadius:5,background:pb(v),color:pc(v),fontSize:11,fontWeight:700,fontFamily:"'DM Mono'",minWidth:64,textAlign:"center" }}>
    {fmtP(v)}
  </span>
);

const SMADot = ({ price, sma, label }) => (
  <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:2 }}>
    <div style={{ width:7,height:7,borderRadius:"50%",background:!sma?"#1e293b":price>sma?"#22c55e":"#f87171",boxShadow:sma?`0 0 5px ${price>sma?"#22c55e":"#f87171"}50`:"none" }}/>
    <span style={{ fontSize:8.5,color:!sma?"#334155":price>sma?"#22c55e":"#f87171",fontFamily:"'DM Mono'",fontWeight:600 }}>{label}</span>
  </div>
);

const RSIBar = ({ rsi }) => {
  if (rsi==null) return <span style={{ fontSize:11,color:"#475569" }}>—</span>;
  const col = rsi<30?"#22c55e":rsi>70?"#f87171":"#fbbf24";
  const lbl = rsi<30?"OVS":rsi>70?"OVB":"NEU";
  return (
    <div style={{ display:"flex",alignItems:"center",gap:6 }}>
      <div style={{ width:60,height:5,background:"#1e293b",borderRadius:3,overflow:"hidden" }}>
        <div style={{ width:`${Math.min(rsi,100)}%`,height:"100%",background:col,borderRadius:3 }}/>
      </div>
      <span style={{ fontSize:11,color:col,fontFamily:"'DM Mono'",fontWeight:700 }}>{fmt(rsi,0)} <span style={{ fontSize:8 }}>{lbl}</span></span>
    </div>
  );
};

// ─── Detail Panel ──────────────────────────────────────────────────
function DetailPanel({ data, mob }) {
  if (!data||data.loading||data.error) return null;
  const sm = SM[data.sector||"unknown"]||SM.unknown;
  const c = cur(data.currency);

  return (
    <div style={{ padding:mob?"14px":"20px", overflowY:"auto", height:"100%" }}>
      <div style={{ marginBottom:16 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
          <div>
            <div style={{ fontFamily:"'Outfit'",fontSize:mob?22:26,fontWeight:900,color:"#f1f5f9",letterSpacing:"-0.5px" }}>{data.symbol}</div>
            <div style={{ fontSize:10,color:"#64748b",marginTop:1 }}>{data.name}</div>
          </div>
          <span style={{ fontSize:9,padding:"3px 9px",borderRadius:5,background:sm.bg,color:sm.color,fontWeight:700,border:`1px solid ${sm.border}` }}>
            {SECTORS.find(s=>s.id===data.sector)?.label||"Other"}
          </span>
        </div>
        <div style={{ display:"flex",alignItems:"baseline",gap:10,marginTop:10 }}>
          <span style={{ fontFamily:"'DM Mono'",fontSize:mob?26:32,fontWeight:700,color:"#f1f5f9" }}>{fmtPr(data.price,data.currency)}</span>
          <span style={{ fontSize:14,fontFamily:"'DM Mono'",fontWeight:700,color:pc(data.change) }}>{data.change!=null?`${data.change>=0?"+":""}${fmt(data.change)}%`:""}</span>
        </div>
        <div style={{ fontSize:9.5,color:"#475569",marginTop:2 }}>Cap: {fmtCap(data.mktCap)} · upd. {data.lastUpdated}</div>
      </div>

      <div style={{ background:"rgba(255,255,255,0.02)",borderRadius:10,padding:"12px",border:"1px solid rgba(255,255,255,0.05)",marginBottom:14 }}>
        <StockChart symbol={data.symbol} color={sm.color} height={mob?120:140} />
      </div>

      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:14 }}>
        {[["1 Sett.",data.p1w],["1 Mese",data.p1m],["3 Mesi",data.p3m]].map(([l,v])=>(
          <div key={l} style={{ background:pb(v),border:`1px solid ${pc(v)}22`,borderRadius:8,padding:"7px 8px",textAlign:"center" }}>
            <div style={{ fontSize:8.5,color:"#64748b",marginBottom:2 }}>{l}</div>
            <div style={{ fontFamily:"'DM Mono'",fontSize:13,fontWeight:800,color:pc(v) }}>{fmtP(v)}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14 }}>
        <div style={{ background:"rgba(255,255,255,0.02)",borderRadius:9,padding:"11px 12px",border:"1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ fontSize:9.5,color:sm.color,fontWeight:700,letterSpacing:0.8,marginBottom:8 }}>FONDAMENTALI</div>
          <KPIItem label="P/E" value={data.pe?fmt(data.pe,1):"—"} color={data.pe&&data.pe<20?"#22c55e":data.pe&&data.pe>50?"#f87171":"#cbd5e1"} />
          <KPIItem label="P/S" value={data.ps?fmt(data.ps,1):"—"} color={data.ps&&data.ps<5?"#22c55e":data.ps&&data.ps>20?"#f87171":"#cbd5e1"} />
          <KPIItem label="Marg. Lordo" value={data.grossMargin!=null?fmt(data.grossMargin,1):"—"} unit="%" color={data.grossMargin>40?"#22c55e":data.grossMargin<15?"#f87171":"#cbd5e1"} />
          <KPIItem label="Cresc. Ricavi" value={data.revenueGrowth!=null?fmtP(data.revenueGrowth):"—"} color={data.revenueGrowth>15?"#22c55e":data.revenueGrowth<0?"#f87171":"#fbbf24"} />
          <KPIItem label="Debt/Equity" value={data.debtEquity!=null?fmt(data.debtEquity,2):"—"} color={data.debtEquity&&data.debtEquity<0.5?"#22c55e":data.debtEquity&&data.debtEquity>2?"#f87171":"#cbd5e1"} />
        </div>
        <div style={{ background:"rgba(255,255,255,0.02)",borderRadius:9,padding:"11px 12px",border:"1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ fontSize:9.5,color:sm.color,fontWeight:700,letterSpacing:0.8,marginBottom:8 }}>TECNICA</div>
          <div style={{ padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,0.03)",marginBottom:2 }}>
            <div style={{ fontSize:11,color:"#64748b",marginBottom:3 }}>RSI 14</div>
            <RSIBar rsi={data.rsi} />
          </div>
          <KPIItem label="MACD" value={data.macdSignal==="bull"?"▲ Bullish":data.macdSignal==="bear"?"▼ Bearish":"—"} color={data.macdSignal==="bull"?"#22c55e":data.macdSignal==="bear"?"#f87171":"#64748b"} />
          <KPIItem label="vs SMA 50"  value={data.distSma50!=null?fmtP(data.distSma50):"—"}  color={pc(data.distSma50)} />
          <KPIItem label="vs SMA 200" value={data.distSma200!=null?fmtP(data.distSma200):"—"} color={pc(data.distSma200)} />
          <KPIItem label="Pos. 52w"   value={data.pos52!=null?`${fmt(data.pos52,0)}%`:"—"} color={data.pos52>75?"#f87171":data.pos52<25?"#22c55e":"#fbbf24"} />
        </div>
      </div>

      <div style={{ background:"rgba(255,255,255,0.02)",borderRadius:9,padding:"10px 14px",border:"1px solid rgba(255,255,255,0.04)",marginBottom:14 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <span style={{ fontSize:9.5,color:"#475569",fontWeight:700,letterSpacing:0.8 }}>MEDIE MOBILI</span>
          <div style={{ display:"flex",gap:20 }}>
            <SMADot price={data.price} sma={data.sma50}  label="SMA 50" />
            <SMADot price={data.price} sma={data.sma100} label="SMA 100" />
            <SMADot price={data.price} sma={data.sma200} label="SMA 200" />
          </div>
        </div>
      </div>

      {data.high52&&data.low52&&(
        <div style={{ background:"rgba(255,255,255,0.02)",borderRadius:9,padding:"10px 14px",border:"1px solid rgba(255,255,255,0.04)",marginBottom:14 }}>
          <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6 }}>
            <span style={{ fontSize:9.5,color:"#475569",fontWeight:700,letterSpacing:0.8 }}>RANGE 52 SETTIMANE</span>
            <span style={{ fontSize:10,color:sm.color,fontFamily:"'DM Mono'",fontWeight:700 }}>{fmt(data.pos52,0)}%</span>
          </div>
          <div style={{ display:"flex",justifyContent:"space-between",marginBottom:5 }}>
            <span style={{ fontSize:9.5,color:"#64748b" }}>Min {c}{fmt(data.low52,2)}</span>
            <span style={{ fontSize:9.5,color:"#64748b" }}>Max {c}{fmt(data.high52,2)}</span>
          </div>
          <div style={{ height:6,background:"#1e293b",borderRadius:3,position:"relative" }}>
            <div style={{ position:"absolute",left:0,top:0,height:"100%",width:`${data.pos52||0}%`,background:"linear-gradient(90deg,#22c55e,#fbbf24,#f87171)",borderRadius:3 }}/>
            <div style={{ position:"absolute",top:-3,left:`${data.pos52||0}%`,transform:"translateX(-50%)",width:12,height:12,background:"#f1f5f9",borderRadius:"50%",border:`2px solid ${sm.color}` }}/>
          </div>
        </div>
      )}

      {data.analystTP&&(
        <div style={{ background:data.upside>0?"rgba(34,197,94,0.06)":"rgba(248,113,113,0.06)",border:`1px solid ${pc(data.upside)}25`,borderRadius:9,padding:"14px 16px" }}>
          <div style={{ fontSize:9.5,color:"#64748b",fontWeight:700,letterSpacing:0.8,marginBottom:8 }}>TARGET PRICE ANALYST</div>
          <div style={{ display:"flex",alignItems:"baseline",gap:10 }}>
            <span style={{ fontFamily:"'DM Mono'",fontSize:mob?20:24,fontWeight:800,color:"#f1f5f9" }}>{c}{fmt(data.analystTP,2)}</span>
            <span style={{ fontFamily:"'DM Mono'",fontSize:15,fontWeight:700,color:pc(data.upside) }}>{fmtP(data.upside)}</span>
          </div>
          {data.earningsDate&&(
            <div style={{ marginTop:10,paddingTop:10,borderTop:"1px solid rgba(255,255,255,0.05)",display:"flex",alignItems:"center",gap:6 }}>
              <span>📅</span>
              <span style={{ fontSize:11,color:"#a5b4fc",fontFamily:"'DM Mono'" }}>Earnings: {data.earningsDate}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared state ──────────────────────────────────────────────────
function useWatchlist() {
  const [watchlist, setWatchlist] = useState(() => {
    try { const s = localStorage.getItem("wl_fh"); return s ? JSON.parse(s) : DEFAULT_LIST; } catch { return DEFAULT_LIST; }
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

  useEffect(() => { try { localStorage.setItem("wl_fh", JSON.stringify(watchlist)); } catch {} }, [watchlist]);

  const loadStock = useCallback(async (sym) => {
    setStockData(prev => ({ ...prev, [sym]: { symbol:sym, loading:true, sector:SECTOR_MAP[sym]||"unknown" } }));
    const data = await fetchStock(sym);
    if (SECTOR_MAP[sym]) data.sector = SECTOR_MAP[sym];
    setStockData(prev => ({ ...prev, [sym]: data }));
    return data;
  }, []);

  useEffect(() => {
    watchlist.forEach(s => loadStock(s));
    setLastRefresh(new Date().toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"}));
    if (watchlist.length) setSelected(watchlist[0]);
  }, []);

  const refreshAll = async () => {
    setRefreshing(true);
    for (const s of watchlist) await loadStock(s);
    setLastRefresh(new Date().toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"}));
    setRefreshing(false);
  };

  const addTicker = async () => {
    const sym = newTicker.trim().toUpperCase();
    if (!sym) return;
    if (watchlist.includes(sym)) { setAddError("Già in watchlist"); setTimeout(()=>setAddError(""),2000); return; }
    setAdding(true); setAddError("");
    if (newSector!=="auto") SECTOR_MAP[sym] = newSector;
    const data = await fetchStock(sym);
    if (data.error) { setAddError(`Ticker non trovato — prova ${sym} o ${sym}.MI`); setAdding(false); setTimeout(()=>setAddError(""),4000); return; }
    setWatchlist(prev=>[...prev,sym]);
    setStockData(prev=>({...prev,[sym]:data}));
    setSelected(sym); setNewTicker(""); setAdding(false);
  };

  const removeTicker = useCallback((sym) => {
    setWatchlist(prev => { const n=prev.filter(s=>s!==sym); setSelected(p=>p===sym?(n[0]||null):p); return n; });
    setStockData(prev => { const n={...prev}; delete n[sym]; return n; });
  }, []);

  const visible = watchlist.filter(s => activeTab==="all"||(stockData[s]?.sector||"unknown")===activeTab);
  const loaded  = watchlist.filter(s => stockData[s]&&!stockData[s]?.loading&&!stockData[s]?.error);
  const up1w    = loaded.filter(s=>(stockData[s]?.p1w||0)>=0).length;
  const sc = {};
  loaded.forEach(s=>{ const sec=stockData[s]?.sector||"unknown"; sc[sec]=(sc[sec]||0)+1; });

  return { watchlist, stockData, newTicker, setNewTicker, newSector, setNewSector, adding, addError, refreshing, lastRefresh, activeTab, setActiveTab, selected, setSelected, refreshAll, addTicker, removeTicker, visible, loaded, up1w, sc };
}

// ─── MOBILE VIEW ───────────────────────────────────────────────────
function MobileView(p) {
  const { watchlist, stockData, newTicker, setNewTicker, newSector, setNewSector, adding, addError, refreshing, lastRefresh, activeTab, setActiveTab, selected, setSelected, refreshAll, addTicker, removeTicker, visible, loaded, up1w, sc } = p;
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <div style={{ background:"#080b12",color:"#e2e8f0",minHeight:"100vh",maxWidth:430,margin:"0 auto",paddingBottom:80 }}>
      <div style={{ padding:"14px 14px 8px",position:"sticky",top:0,background:"#080b12",zIndex:100,borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
          <div>
            <div style={{ fontFamily:"'Outfit'",fontSize:21,fontWeight:900,letterSpacing:"-0.7px" }}>WATCH<span style={{ color:"#6366f1" }}>LIST</span></div>
            <div style={{ fontSize:9,color:"#334155" }}>{loaded.length} titoli {lastRefresh&&`· upd. ${lastRefresh}`}</div>
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:8 }}>
            <span style={{ fontSize:11,color:"#22c55e",fontWeight:700 }}>▲{up1w}</span>
            <span style={{ fontSize:11,color:"#f87171",fontWeight:700 }}>▼{loaded.length-up1w}</span>
            <button onClick={refreshAll} disabled={refreshing} style={{ background:"rgba(99,102,241,0.12)",border:"1px solid rgba(99,102,241,0.2)",color:"#818cf8",borderRadius:8,padding:"6px 11px",fontSize:11,fontFamily:"'Outfit'",fontWeight:700,cursor:"pointer",opacity:refreshing?0.5:1 }}>
              {refreshing?"...":"↻"}
            </button>
          </div>
        </div>
        <div style={{ display:"flex",gap:6,marginBottom:8 }}>
          <input value={newTicker} onChange={e=>setNewTicker(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&addTicker()} placeholder="Ticker (es. NVDA, UCG.MI)"
            style={{ flex:1,background:"rgba(255,255,255,0.04)",border:`1px solid ${addError?"rgba(248,113,113,0.4)":"rgba(255,255,255,0.07)"}`,borderRadius:8,padding:"8px 11px",color:"#e2e8f0",fontSize:13,fontFamily:"'DM Mono'" }}/>
          <select value={newSector} onChange={e=>setNewSector(e.target.value)} style={{ background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:8,padding:"8px",color:"#94a3b8",fontSize:11,cursor:"pointer" }}>
            <option value="auto">Auto</option>
            {SECTORS.filter(s=>s.id!=="all").map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button onClick={addTicker} disabled={adding||!newTicker.trim()} style={{ background:"linear-gradient(135deg,#6366f1,#4f46e5)",border:"none",color:"white",borderRadius:8,padding:"8px 13px",fontSize:14,fontFamily:"'Outfit'",fontWeight:900,cursor:"pointer",opacity:adding||!newTicker.trim()?0.5:1 }}>+</button>
        </div>
        {addError&&<div style={{ fontSize:10,color:"#f87171",marginBottom:6 }}>{addError}</div>}
        <div style={{ display:"flex",gap:5,overflowX:"auto" }}>
          {SECTORS.map(s=>{ const cnt=s.id==="all"?loaded.length:(sc[s.id]||0); const act=activeTab===s.id; const sm_=SM[s.id]||SM.unknown;
            return <button key={s.id} onClick={()=>setActiveTab(s.id)} style={{ flexShrink:0,padding:"4px 10px",borderRadius:7,border:`1px solid ${act?sm_.color:"rgba(255,255,255,0.06)"}`,background:act?sm_.bg:"transparent",color:act?sm_.color:"#475569",fontSize:10.5,fontFamily:"'Outfit'",fontWeight:700,cursor:"pointer" }}>{s.label} {cnt>0&&<span style={{ fontSize:8.5 }}>{cnt}</span>}</button>;
          })}
        </div>
      </div>

      <div style={{ padding:"8px 14px" }}>
        {visible.map(sym=>{
          const d=stockData[sym]||{symbol:sym,loading:true,sector:SECTOR_MAP[sym]||"unknown"};
          const sm_=SM[d.sector||"unknown"]||SM.unknown;
          if (d.loading) return <div key={sym} style={{ background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:12,padding:"13px 14px",marginBottom:7,display:"flex",justifyContent:"space-between" }}><span style={{ fontFamily:"'Outfit'",fontSize:15,fontWeight:800,color:"#64748b" }}>{sym}</span><div style={{ width:16,height:16,border:"2px solid rgba(255,255,255,0.1)",borderTopColor:"#6366f1",borderRadius:"50%",animation:"spin 0.7s linear infinite" }}/></div>;
          if (d.error) return <div key={sym} style={{ background:"rgba(248,113,113,0.04)",border:"1px solid rgba(248,113,113,0.12)",borderRadius:12,padding:"11px 14px",marginBottom:7,display:"flex",justifyContent:"space-between" }}><div><div style={{ fontFamily:"'Outfit'",fontSize:14,fontWeight:800,color:"#f87171" }}>{sym}</div><div style={{ fontSize:10,color:"#64748b" }}>{d.error}</div></div><button onClick={()=>removeTicker(sym)} style={{ background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:18 }}>×</button></div>;
          return (
            <div key={sym} onClick={()=>{ setSelected(sym); setDetailOpen(true); }} style={{ background:selected===sym?sm_.bg:"rgba(255,255,255,0.02)",border:`1px solid ${selected===sym?sm_.border:"rgba(255,255,255,0.05)"}`,borderRadius:13,padding:"12px 14px",marginBottom:7,cursor:"pointer" }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8 }}>
                <div><div style={{ display:"flex",alignItems:"center",gap:7 }}><span style={{ fontFamily:"'Outfit'",fontSize:15,fontWeight:900,color:"#f1f5f9" }}>{d.symbol}</span><span style={{ fontSize:9,padding:"1px 6px",borderRadius:4,background:sm_.bg,color:sm_.color,fontWeight:700 }}>{SECTORS.find(s=>s.id===d.sector)?.label||"Other"}</span></div><div style={{ fontSize:9.5,color:"#475569",marginTop:1,maxWidth:180,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{d.name}</div></div>
                <div style={{ display:"flex",alignItems:"center",gap:7 }}>
                  <div style={{ textAlign:"right" }}><div style={{ fontFamily:"'DM Mono'",fontSize:16,fontWeight:700,color:"#f1f5f9" }}>{fmtPr(d.price,d.currency)}</div><div style={{ fontSize:10.5,color:pc(d.change),fontWeight:700,fontFamily:"'DM Mono'" }}>{d.change!=null?`${d.change>=0?"+":""}${fmt(d.change)}%`:""}</div></div>
                  <button onClick={e=>{e.stopPropagation();removeTicker(sym);}} style={{ background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",color:"#475569",cursor:"pointer",fontSize:13,width:22,height:22,borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center" }}>×</button>
                </div>
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5,marginBottom:8 }}>
                {[["1S",d.p1w],["1M",d.p1m],["3M",d.p3m]].map(([l,v])=>(
                  <div key={l} style={{ textAlign:"center",background:"rgba(255,255,255,0.02)",borderRadius:7,padding:"4px 0" }}><div style={{ fontSize:8,color:"#475569",marginBottom:2 }}>{l}</div><PctBadge v={v}/></div>
                ))}
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:4 }}>
                <span style={{ fontSize:8.5,color:"#334155",minWidth:26 }}>SMA</span>
                <div style={{ display:"flex",gap:16 }}><SMADot price={d.price} sma={d.sma50} label="50"/><SMADot price={d.price} sma={d.sma100} label="100"/><SMADot price={d.price} sma={d.sma200} label="200"/></div>
                {d.analystTP&&<div style={{ marginLeft:"auto",textAlign:"right" }}><span style={{ fontSize:9.5,color:"#475569" }}>TP </span><span style={{ fontSize:10.5,fontFamily:"'DM Mono'",fontWeight:700,color:pc(d.upside) }}>{cur(d.currency)}{fmt(d.analystTP,2)} ({fmtP(d.upside)})</span></div>}
              </div>
            </div>
          );
        })}
        {visible.length===0&&<div style={{ textAlign:"center",padding:"50px 20px",color:"#334155" }}><div style={{ fontSize:28,marginBottom:8 }}>📊</div><div style={{ fontSize:12 }}>{watchlist.length===0?"Aggiungi il primo ticker":"Nessun titolo in questo settore"}</div></div>}
      </div>

      {detailOpen&&selected&&stockData[selected]&&(
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:200,backdropFilter:"blur(4px)" }} onClick={()=>setDetailOpen(false)}>
          <div onClick={e=>e.stopPropagation()} style={{ position:"absolute",bottom:0,left:0,right:0,maxHeight:"90vh",background:"#0d1117",borderRadius:"16px 16px 0 0",overflowY:"auto",border:"1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ fontSize:12,color:"#475569" }}>Dettaglio</span>
              <button onClick={()=>setDetailOpen(false)} style={{ background:"rgba(255,255,255,0.06)",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:16,width:28,height:28,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center" }}>×</button>
            </div>
            <DetailPanel data={stockData[selected]} mob={true}/>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DESKTOP VIEW ──────────────────────────────────────────────────
function DesktopView(p) {
  const { watchlist, stockData, newTicker, setNewTicker, newSector, setNewSector, adding, addError, refreshing, lastRefresh, activeTab, setActiveTab, selected, setSelected, refreshAll, addTicker, removeTicker, visible, loaded, up1w, sc } = p;

  return (
    <div style={{ background:"#060810",color:"#e2e8f0",height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden" }}>
      <div style={{ padding:"10px 20px",borderBottom:"1px solid rgba(255,255,255,0.05)",display:"flex",alignItems:"center",gap:16,flexShrink:0,background:"#080b12" }}>
        <div style={{ fontFamily:"'Outfit'",fontSize:18,fontWeight:900,letterSpacing:"-0.5px" }}>WATCH<span style={{ color:"#6366f1" }}>LIST</span></div>
        <div style={{ display:"flex",alignItems:"center",gap:6,paddingLeft:12,borderLeft:"1px solid rgba(255,255,255,0.06)" }}>
          <span style={{ fontSize:11,color:"#22c55e",fontWeight:700 }}>▲{up1w}</span>
          <span style={{ fontSize:11,color:"#f87171",fontWeight:700 }}>▼{loaded.length-up1w}</span>
          <span style={{ fontSize:9.5,color:"#334155" }}>{loaded.length} titoli{lastRefresh&&` · ${lastRefresh}`}</span>
        </div>
        <div style={{ display:"flex",gap:4 }}>
          {SECTORS.map(s=>{ const cnt=s.id==="all"?loaded.length:(sc[s.id]||0); const act=activeTab===s.id; const sm_=SM[s.id]||SM.unknown;
            return <button key={s.id} onClick={()=>setActiveTab(s.id)} style={{ padding:"4px 11px",borderRadius:6,border:`1px solid ${act?sm_.color:"rgba(255,255,255,0.06)"}`,background:act?sm_.bg:"transparent",color:act?sm_.color:"#475569",fontSize:10.5,fontFamily:"'Outfit'",fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:4,transition:"all 0.15s" }}>{s.label} {cnt>0&&<span style={{ fontSize:9 }}>{cnt}</span>}</button>;
          })}
        </div>
        <div style={{ display:"flex",gap:6,marginLeft:"auto",alignItems:"center" }}>
          <input value={newTicker} onChange={e=>setNewTicker(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&addTicker()} placeholder="Aggiungi ticker..."
            style={{ width:160,background:"rgba(255,255,255,0.04)",border:`1px solid ${addError?"rgba(248,113,113,0.4)":"rgba(255,255,255,0.07)"}`,borderRadius:7,padding:"6px 10px",color:"#e2e8f0",fontSize:12,fontFamily:"'DM Mono'" }}/>
          <select value={newSector} onChange={e=>setNewSector(e.target.value)} style={{ background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:7,padding:"6px 7px",color:"#94a3b8",fontSize:11,cursor:"pointer" }}>
            <option value="auto">Auto</option>
            {SECTORS.filter(s=>s.id!=="all").map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button onClick={addTicker} disabled={adding||!newTicker.trim()} style={{ background:"linear-gradient(135deg,#6366f1,#4f46e5)",border:"none",color:"white",borderRadius:7,padding:"6px 14px",fontSize:12,fontFamily:"'Outfit'",fontWeight:800,cursor:"pointer",opacity:adding||!newTicker.trim()?0.5:1 }}>{adding?"...":"+ Add"}</button>
          <button onClick={refreshAll} disabled={refreshing} style={{ background:"rgba(99,102,241,0.1)",border:"1px solid rgba(99,102,241,0.2)",color:"#818cf8",borderRadius:7,padding:"6px 12px",fontSize:11,fontFamily:"'Outfit'",fontWeight:700,cursor:"pointer",opacity:refreshing?0.5:1 }}>{refreshing?"...":"↻ Refresh"}</button>
        </div>
      </div>
      {addError&&<div style={{ padding:"3px 20px",fontSize:10,color:"#f87171",background:"rgba(248,113,113,0.05)" }}>{addError}</div>}

      <div style={{ flex:1,display:"flex",overflow:"hidden" }}>
        <div style={{ flex:"0 0 58%",overflowY:"auto",borderRight:"1px solid rgba(255,255,255,0.05)" }}>
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead style={{ position:"sticky",top:0,background:"#080b12",zIndex:5 }}>
              <tr style={{ borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
                {["Ticker","Settore","Prezzo","Giorno","1S","1M","3M","SMA","Target","Earnings",""].map((h,i)=>(
                  <th key={i} style={{ padding:`8px 6px 8px ${i===0?"16px":"6px"}`,fontSize:9,fontWeight:700,color:"#475569",textAlign:"left",fontFamily:"'DM Mono'",letterSpacing:0.5,whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(sym=>{
                const d=stockData[sym]||{symbol:sym,loading:true,sector:SECTOR_MAP[sym]||"unknown"};
                const sm_=SM[d.sector||"unknown"]||SM.unknown;
                if (d.loading) return <tr key={sym} style={{ borderBottom:"1px solid rgba(255,255,255,0.03)" }}><td colSpan={11} style={{ padding:"10px 16px",fontSize:11,color:"#475569" }}><span style={{ display:"inline-block",width:11,height:11,border:"1.5px solid rgba(255,255,255,0.08)",borderTopColor:"#6366f1",borderRadius:"50%",animation:"spin 0.7s linear infinite",marginRight:8,verticalAlign:"middle" }}/>{sym}</td></tr>;
                if (d.error) return <tr key={sym} style={{ borderBottom:"1px solid rgba(255,255,255,0.03)" }}><td style={{ padding:"10px 16px",fontFamily:"'DM Mono'",fontSize:12,color:"#f87171" }}>{sym}</td><td colSpan={9} style={{ fontSize:10,color:"#64748b" }}>{d.error}</td><td><button onClick={()=>removeTicker(sym)} style={{ background:"none",border:"none",color:"#475569",cursor:"pointer" }}>×</button></td></tr>;
                const isAct=selected===sym;
                return (
                  <tr key={sym} onClick={()=>setSelected(sym)} style={{ borderBottom:"1px solid rgba(255,255,255,0.03)",background:isAct?sm_.bg:"transparent",cursor:"pointer",transition:"background 0.1s" }}
                    onMouseEnter={e=>!isAct&&(e.currentTarget.style.background="rgba(255,255,255,0.02)")} onMouseLeave={e=>!isAct&&(e.currentTarget.style.background="transparent")}>
                    <td style={{ padding:"9px 6px 9px 16px",whiteSpace:"nowrap" }}><div style={{ display:"flex",alignItems:"center",gap:7 }}><div style={{ width:3,height:30,borderRadius:2,background:sm_.color }}/><div><div style={{ fontFamily:"'Outfit'",fontSize:13,fontWeight:900,color:"#f1f5f9" }}>{d.symbol}</div><div style={{ fontSize:8.5,color:"#475569",maxWidth:110,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{d.name}</div></div></div></td>
                    <td style={{ padding:"9px 6px" }}><span style={{ fontSize:8.5,padding:"1px 6px",borderRadius:4,background:sm_.bg,color:sm_.color,fontWeight:700,whiteSpace:"nowrap" }}>{SECTORS.find(s=>s.id===d.sector)?.label||"Other"}</span></td>
                    <td style={{ padding:"9px 6px",fontFamily:"'DM Mono'",fontSize:13,fontWeight:700,color:"#f1f5f9",whiteSpace:"nowrap" }}>{fmtPr(d.price,d.currency)}</td>
                    <td style={{ padding:"9px 6px" }}><span style={{ fontSize:11,fontFamily:"'DM Mono'",fontWeight:700,color:pc(d.change) }}>{d.change!=null?`${d.change>=0?"+":""}${fmt(d.change)}%`:"—"}</span></td>
                    {[d.p1w,d.p1m,d.p3m].map((v,i)=><td key={i} style={{ padding:"9px 4px" }}><span style={{ display:"inline-block",padding:"1px 6px",borderRadius:4,background:pb(v),color:pc(v),fontSize:10.5,fontFamily:"'DM Mono'",fontWeight:700,minWidth:54,textAlign:"center" }}>{fmtP(v)}</span></td>)}
                    <td style={{ padding:"9px 8px" }}><div style={{ display:"flex",gap:6 }}>{[["50",d.sma50],["100",d.sma100],["200",d.sma200]].map(([l,s])=><div key={l} style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:1 }}><div style={{ width:6,height:6,borderRadius:"50%",background:!s?"#1e293b":d.price>s?"#22c55e":"#f87171" }}/><span style={{ fontSize:7.5,color:"#475569" }}>{l}</span></div>)}</div></td>
                    <td style={{ padding:"9px 6px",whiteSpace:"nowrap" }}>{d.analystTP?<div><div style={{ fontFamily:"'DM Mono'",fontSize:11.5,fontWeight:700,color:"#f1f5f9" }}>{cur(d.currency)}{fmt(d.analystTP,2)}</div><div style={{ fontSize:9.5,fontFamily:"'DM Mono'",color:pc(d.upside) }}>{fmtP(d.upside)}</div></div>:<span style={{ color:"#334155" }}>—</span>}</td>
                    <td style={{ padding:"9px 6px",whiteSpace:"nowrap" }}>{d.earningsDate?<span style={{ fontSize:9.5,color:"#a5b4fc",fontFamily:"'DM Mono'" }}>📅 {d.earningsDate}</span>:<span style={{ color:"#334155" }}>—</span>}</td>
                    <td style={{ padding:"9px 8px 9px 4px" }}><button onClick={e=>{e.stopPropagation();removeTicker(sym);}} style={{ background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",color:"#475569",cursor:"pointer",fontSize:12,width:20,height:20,borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center" }}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visible.length===0&&<div style={{ padding:"60px 20px",textAlign:"center",color:"#334155" }}><div style={{ fontSize:30,marginBottom:8 }}>📊</div><div>{watchlist.length===0?"Aggiungi il primo ticker":"Nessun titolo in questo settore"}</div></div>}
        </div>

        <div style={{ flex:1,overflowY:"auto" }}>
          {selected&&stockData[selected]&&!stockData[selected]?.loading&&!stockData[selected]?.error
            ? <div style={{ animation:"fadeIn 0.2s ease" }}><DetailPanel data={stockData[selected]} mob={false}/></div>
            : <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#1e293b",flexDirection:"column",gap:8 }}><div style={{ fontSize:36 }}>◎</div><div style={{ fontSize:13 }}>Seleziona un titolo</div></div>
          }
        </div>
      </div>
    </div>
  );
}

// ─── ROOT ───────────────────────────────────────────────────────────
export default function App() {
  const mob = useDevice();
  const state = useWatchlist();
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Outfit:wght@600;700;800;900&display=swap');
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
        ::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:#0d1117}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
        input:focus,select:focus{outline:none}input::placeholder{color:#334155}
      `}</style>
      {mob ? <MobileView {...state}/> : <DesktopView {...state}/>}
    </>
  );
}
