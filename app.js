/**
 * app.js — Nifty 500 Screener
 * Clean pastel cream aesthetic with Sector Grouping and Fundamental Columns
 */

"use strict";

let allStocks = [];
let displayList = [];
let bookmarks = new Set(
  JSON.parse(localStorage.getItem("screener-bookmarks") || "[]"),
);
let selectedSector = "all";
let currentTab = "all"; // 'all', 'downtrend', 'bookmarks'
let sortKey = "mktCap";
let sortDir = "desc";
let expandedSym = null;
let activeChartType = "candle";
let activeOverlays = {
  bb: true,
  vwap: false,
  ema: true,
};

window.toggleOverlay = function (sym, overlayKey, event) {
  if (event) event.stopPropagation();
  activeOverlays[overlayKey] = !activeOverlays[overlayKey];
  if (event && event.target) {
    const isAct = activeOverlays[overlayKey];
    event.target.classList.toggle("active", isAct);
    event.target.classList.toggle(`active-${overlayKey}`, isAct);
  }
  const parentContainer = (event && event.target) ? event.target.closest(".immersive-left, .expanded-cell") : document;
  const activeTfTab = parentContainer ? parentContainer.querySelector(".chart-tf-tabs .chart-tab-link.active") : null;
  const interval =
    activeTfTab && (activeTfTab.textContent.includes("Month") || activeTfTab.getAttribute("onclick")?.includes("monthly"))
      ? "monthly"
      : "weekly";
  drawChart(sym, interval);
};

const $ = (id) => document.getElementById(id);

// ── Boot ─────────────────────────────────────────────────────
async function init() {
  const exportBtn = $("btn-export");
  if (exportBtn) {
    exportBtn.addEventListener("click", exportCSV);
  }
  setupTabs();
  setupThemeToggle();
  if (window.lucide) window.lucide.createIcons();

  const refreshBtn = $("btn-refresh");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", triggerDataRefresh);
  }

  // Bind sort click listeners to static headers once
  document.querySelectorAll("th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const k = th.dataset.sort;
      sortDir = sortKey === k ? (sortDir === "asc" ? "desc" : "asc") : "desc";
      sortKey = k;
      render();
    });
  });

  const searchBox = $("search-box");
  const symbolHeader = document.querySelector('th[data-sort="symbol"]');
  if (searchBox && symbolHeader) {
    searchBox.addEventListener("focus", () => {
      symbolHeader.classList.add("hide-text");
    });
    searchBox.addEventListener("blur", () => {
      symbolHeader.classList.remove("hide-text");
    });
  }

  $("search-box").addEventListener(
    "input",
    debounce(() => {
      symbolHeader.classList.add("hide-text");
      expandedSym = null;
      render();
    }, 200),
  );

  $("sector-filter").addEventListener("change", (e) => {
    selectedSector = e.target.value;
    expandedSym = null;
    render();
  });

  updateBookmarkPill();
  updateFreshness(null);
  await loadData();
  checkRefreshStatus();

  // Single-stock standalone page launch handler
  const params = new URLSearchParams(window.location.search);
  const stockParam = params.get("stock");
  if (stockParam) {
    const matchedStock = allStocks.find(
      (s) =>
        s.symbol.toUpperCase() === stockParam.toUpperCase() ||
        s.symbol.replace(/\.NS$/, "").toUpperCase() === stockParam.toUpperCase(),
    );
    if (matchedStock) {
      const classifiedStock = classifyDowntrend(matchedStock);
      renderStandaloneStockPage(classifiedStock);
    }
  }
}

let isRefreshing = false;
let statusPollInterval = null;

// ── API Control Refresh ──────────────────────────────────────
async function triggerDataRefresh() {
  if (isRefreshing) {
    toast("Refresh already in progress...", "info");
    return;
  }

  const mode = "full";

  try {
    const res = await fetch("/api/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to start refresh");
    }

    toast(`Started full data refresh via API`, "info");
    startStatusPolling();
  } catch (err) {
    toast("API Refresh Error: " + err.message, "error");
  }
}

function startStatusPolling() {
  if (statusPollInterval) clearInterval(statusPollInterval);
  isRefreshing = true;
  updateRefreshUI(true, 0, "Starting...");
  statusPollInterval = setInterval(checkRefreshStatus, 2000);
}

// Helper to format ISO timestamp or date into Indian Standard Time (IST)
function formatISTDate(isoStr) {
  const d = isoStr ? new Date(isoStr) : new Date();
  if (isNaN(d.getTime())) return new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true }) + " IST";

  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }) + " IST";
}

function updateFreshness(fetchedAt) {
  const badgeText = $("last-updated-text");
  if (badgeText) {
    const formattedIST = formatISTDate(fetchedAt);
    badgeText.innerHTML = `Updated: <span class="highlight-time" style="color:var(--text-primary);font-weight:600;margin-left:4px;">${formattedIST}</span>`;
  }
}

async function checkRefreshStatus() {
  try {
    const res = await fetch("/api/refresh/status");
    if (!res.ok) return;
    const status = await res.json();

    if (status.running) {
      isRefreshing = true;
      if (!statusPollInterval) {
        statusPollInterval = setInterval(checkRefreshStatus, 1500);
      }
      updateRefreshUI(true, status.progress, status.currentStock, status.completedCount, status.totalStocks);
    } else if (isRefreshing) {
      isRefreshing = false;
      if (statusPollInterval) {
        clearInterval(statusPollInterval);
        statusPollInterval = null;
      }

      if (status.error) {
        updateRefreshUI(false, 0, "Failed");
        toast("Data Refresh Failed: " + status.error, "error");
      } else {
        updateRefreshUI(false, 100, "Finished");
        toast("Data refresh completed! Reloading dataset...", "success");
        await loadData();
      }
    }
  } catch (err) {
    console.error("Status check failed", err);
  }
}

function updateRefreshUI(running, progress, currentStock = "", completed = 0, total = 0) {
  const btnIcon = $("btn-refresh-icon");
  const btn = $("btn-refresh");
  const progressWrap = $("refresh-progress-container");
  const progressFill = $("refresh-progress-fill");
  const progressCountText = $("progress-count-text");
  const progressStockText = $("progress-stock-text");

  if (!btn || !btnIcon) return;

  const pct = Math.min(100, Math.max(0, Math.round(progress || 0)));

  if (running) {
    btn.disabled = true;
    btnIcon.classList.add("spin");

    if (progressWrap) progressWrap.style.display = "flex";
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (progressCountText) progressCountText.textContent = `${completed} / ${total || 500} (${pct}%)`;
    if (progressStockText) progressStockText.textContent = currentStock || "Processing...";
  } else {
    btn.disabled = false;
    btnIcon.classList.remove("spin");

    if (progressWrap) progressWrap.style.display = "none";
  }
}

// ── Load ──────────────────────────────────────────────────────
async function loadData() {
  try {
    // Try fetching from API endpoint first, fallback to static json file
    let res;
    try {
      res = await fetch("/api/data");
    } catch {
      res = await fetch("data/screener_data.json?_=" + Date.now());
    }
    if (!res.ok) {
      res = await fetch("data/screener_data.json?_=" + Date.now());
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    allStocks = (data.stocks || [])
      .filter((s) => s.indicators && !s.error)
      .map((s) => {
        const stock = scoreStock(s);
        stock.sector = cleanSector(stock.sector);
        return stock;
      });
    populateSectors();
    updateFreshness(data.fetchedAt);
    updateTabCounts();

    // If opening a standalone stock URL, launch full mode directly without overwriting with main table
    const params = new URLSearchParams(window.location.search);
    const stockParam = params.get("stock");
    if (stockParam) {
      const matchedStock = allStocks.find(
        (s) =>
          s.symbol.toUpperCase() === stockParam.toUpperCase() ||
          s.symbol.replace(/\.NS$/, "").toUpperCase() === stockParam.toUpperCase(),
      );
      if (matchedStock) {
        renderStandaloneStockPage(matchedStock);
        toast("Loaded " + matchedStock.symbol + " Full View", "success");
        return;
      }
    }

    render();
    toast("Loaded " + allStocks.length + " stocks", "success");
  } catch (err) {
    showEmpty(
      err.message.includes("404") || err.message.includes("fetch")
        ? "no-data"
        : "error",
      err.message,
    );
  }
}

// ── Populate Sectors Dropdown ───────────────────────────────
function populateSectors() {
  const select = $("sector-filter");
  if (!select) return;

  const sectors = new Set();
  allStocks.forEach((s) => {
    if (s.sector) sectors.add(s.sector);
  });

  const sortedSectors = Array.from(sectors).sort((a, b) => a.localeCompare(b));
  select.innerHTML = '<option value="all">All Sectors</option>';
  sortedSectors.forEach((sec) => {
    const opt = document.createElement("option");
    opt.value = sec;
    opt.textContent = sec;
    select.appendChild(opt);
  });
}

// ── Sector Name Cleaner ───────────────────────────────────────
function cleanSector(sec) {
  if (!sec) return "Others";
  const s = sec.trim().toLowerCase();

  if (s.includes("automobile") || s.includes("auto")) return "Automobile";
  if (
    s.includes("consumer goods") ||
    s.includes("fast moving") ||
    s.includes("fmcg")
  )
    return "Consumer";
  if (s.includes("financial") || s.includes("bank") || s.includes("insurance"))
    return "Financial";
  if (
    s.includes("information technology") ||
    s.includes("it") ||
    s.includes("software") ||
    s.includes("tech")
  )
    return "Tech";
  if (
    s.includes("capital goods") ||
    s.includes("industrial") ||
    s.includes("machinery")
  )
    return "Industrial";
  if (
    s.includes("oil") ||
    s.includes("gas") ||
    s.includes("fuel") ||
    s.includes("power") ||
    s.includes("energy") ||
    s.includes("utilities")
  )
    return "Energy";
  if (s.includes("chemical")) return "Chemicals";
  if (s.includes("healthcare") || s.includes("pharma") || s.includes("medical"))
    return "Healthcare";
  if (s.includes("metals") || s.includes("mining") || s.includes("steel"))
    return "Metals";
  if (s.includes("telecom")) return "Telecom";
  if (
    s.includes("construction") ||
    s.includes("materials") ||
    s.includes("cement")
  )
    return "Materials";
  if (s.includes("realty") || s.includes("real estate")) return "Realty";
  if (s.includes("textiles") || s.includes("apparel")) return "Textiles";
  if (s.includes("media") || s.includes("entertainment")) return "Media";
  if (s.includes("services")) return "Services";
  if (s.includes("diversified")) return "Diversified";

  const firstWord = sec.split(/[,\s&]/)[0];
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
}

// ── Downtrend scoring ─────────────────────────────────────────
// 4 hard conditions — all must be true for confirmed downtrend
function scoreStock(s) {
  const i = s.indicators;
  const c = {};
  c.diCross =
    i.weeklyDIMinus != null &&
    i.weeklyDIPlus != null &&
    i.weeklyDIMinus > i.weeklyDIPlus;
  c.belowSMA = i.smaDeviation != null && i.smaDeviation < 0;
  c.rsiWeak = i.weeklyRSI != null && i.weeklyRSI < 50;
  c.adxValid = i.weeklyADX != null && i.weeklyADX > 20;
  const score = [c.diCross, c.belowSMA, c.rsiWeak, c.adxValid].filter(
    Boolean,
  ).length;

  const st = getPriceStructure(s);

  // 1. Advanced Volume-Price & BBW Features
  let vpDistribution = false;
  let vpAccumulation = false;
  let bbSqueezeBreakdown = false;
  let bbSqueezeBreakout = false;

  if (s.dailyCandles && s.dailyCandles.length >= 10) {
    const daily = s.dailyCandles;
    const L = daily.length;
    const last10 = daily.slice(L - 10);

    // Calculate average volume over last 30 daily candles for relative volume baseline
    const slice30 = daily.slice(Math.max(0, L - 30));
    const avgVol30 =
      slice30.reduce((acc, c) => acc + (c[5] || 0), 0) / (slice30.length || 1);

    let upRelVols = [];
    let downRelVols = [];

    last10.forEach((c, idx) => {
      const open = c[1];
      const close = c[4];
      const vol = c[5] || 0;
      const relV = avgVol30 > 0 ? vol / avgVol30 : 1;
      if (close >= open) {
        upRelVols.push(relV);
      } else {
        downRelVols.push(relV);
      }
    });

    const avgUpRelVol =
      upRelVols.length > 0
        ? upRelVols.reduce((a, b) => a + b, 0) / upRelVols.length
        : 1;
    const avgDownRelVol =
      downRelVols.length > 0
        ? downRelVols.reduce((a, b) => a + b, 0) / downRelVols.length
        : 1;

    // Distribution: up-days < 0.8x and down-days > 1.5x
    if (avgUpRelVol < 0.8 && avgDownRelVol > 1.5) {
      vpDistribution = true;
    }
    // Accumulation: up-days > 1.5x and down-days < 0.8x
    if (avgUpRelVol > 1.5 && avgDownRelVol < 0.8) {
      vpAccumulation = true;
    }

    // Bollinger Bandwidth (20-period) Compression Analysis
    if (L >= 20) {
      const bbwArr = [];
      const lowerBands = [];
      const upperBands = [];

      for (let j = 19; j < L; j++) {
        const sub = daily.slice(j - 19, j + 1).map((c) => c[4]);
        const mean = sub.reduce((a, b) => a + b, 0) / 20;
        const variance =
          sub.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / 20;
        const stdDev = Math.sqrt(variance);
        const upper = mean + 2 * stdDev;
        const lower = mean - 2 * stdDev;
        const bbw = mean > 0 ? (upper - lower) / mean : 0;
        bbwArr.push(bbw);
        upperBands.push(upper);
        lowerBands.push(lower);
      }

      // Check if BBW hit a 60-day low within the last 5 sessions
      if (bbwArr.length >= 60) {
        const last60Bbw = bbwArr.slice(-60);
        const min60Bbw = Math.min(...last60Bbw);
        const recent5Bbw = bbwArr.slice(-5);
        const bbwSqueezed = recent5Bbw.some((v) => Math.abs(v - min60Bbw) < 1e-6);

        const latestCandle = daily[L - 1];
        const latestClose = latestCandle[4];
        const latestVol = latestCandle[5] || 0;
        const latestRelVol = avgVol30 > 0 ? latestVol / avgVol30 : 1;
        const latestLower = lowerBands[lowerBands.length - 1];
        const latestUpper = upperBands[upperBands.length - 1];

        if (bbwSqueezed && latestClose < latestLower && latestRelVol > 1.3) {
          bbSqueezeBreakdown = true;
        }
        if (bbwSqueezed && latestClose > latestUpper && latestRelVol > 1.3) {
          bbSqueezeBreakout = true;
        }
      }
    }
  }

  c.vpDistribution = vpDistribution;
  c.vpAccumulation = vpAccumulation;
  c.bbSqueezeBreakdown = bbSqueezeBreakdown;
  c.bbSqueezeBreakout = bbSqueezeBreakout;

  // 2. BEARISH ENGINE: Google Antigravity & Aadhik Filter
  let googleAntigravity = false;
  let antigravityReason = "";

  if (st) {
    const isDecliningStructure =
      st["20D"] && st["20D"].highAge > st["20D"].lowAge;
    const isLowerHalf = st["20D"] && st["20D"].rangePos < 35;
    const isNegShort =
      (st["5D"] && st["5D"].ret < 0) || (st["10D"] && st["10D"].ret < 0);
    const isTechWeak =
      i.weeklyRSI != null &&
      i.weeklyRSI < 50 &&
      i.smaDeviation != null &&
      i.smaDeviation < 0;
    const hasBearishMomentum =
      st["20D"] && (st["20D"].gapDowns > 0 || st["20D"].swings > 0);

    googleAntigravity =
      (isDecliningStructure &&
        isLowerHalf &&
        isNegShort &&
        isTechWeak &&
        hasBearishMomentum) ||
      vpDistribution ||
      bbSqueezeBreakdown;

    if (googleAntigravity) {
      if (bbSqueezeBreakdown) {
        antigravityReason = "Bollinger Bandwidth 60-day squeeze breakdown on expanding volume.";
      } else if (vpDistribution) {
        antigravityReason = "Volume-Price Distribution detected (Up-days < 0.8x, Down-days > 1.5x Rel Vol).";
      } else {
        antigravityReason =
          "Confirmed by structural decline (20D High is older than Low), weak weekly technicals (RSI < 50, below 20W SMA), and near-term negative returns.";
      }
    }
  }
  c.googleAntigravity = googleAntigravity;

  let aadhikFilter = false;
  let aadhikReason = "";
  if (st) {
    const ret5 = st["5D"] ? st["5D"].ret : null;
    const ret10 = st["10D"] ? st["10D"].ret : null;
    const ret15 = st["15D"] ? st["15D"].ret : null;
    const ret20 = st["20D"] ? st["20D"].ret : null;

    const rets = [ret5, ret10, ret15, ret20].filter((v) => v !== null);
    const neg2Count = rets.filter((v) => v <= -2.0).length;
    const hasStrongNeg7 = rets.some((v) => v <= -7.0);

    const almostAllNeg2 = neg2Count >= Math.min(3, rets.length);

    let hasLargeGap = false;
    let largeGapVal = 0;
    if (s.dailyCandles) {
      const daily = s.dailyCandles;
      const L = daily.length;
      const startIdx = Math.max(1, L - 20);
      for (let j = startIdx; j < L; j++) {
        const prevClose = daily[j - 1][4];
        const open = daily[j][1];
        if (prevClose > 0) {
          const gapPct = ((open - prevClose) / prevClose) * 100;
          if (gapPct <= -3.0) {
            hasLargeGap = true;
            largeGapVal = gapPct;
            break;
          }
        }
      }
    }

    if (almostAllNeg2) {
      aadhikFilter = true;
      aadhikReason =
        "Periodic Swing filter: Price declined by 2% or more across almost all periods (5D/10D/15D/20D).";
    } else if (hasStrongNeg7) {
      aadhikFilter = true;
      aadhikReason =
        "Periodic Swing filter: Strong single-period swing decline of more than 7% detected.";
    } else if (hasLargeGap) {
      aadhikFilter = true;
      aadhikReason = `Opening Gap filter: Significant bearish opening gap of ${fmt(largeGapVal)}% occurred in the last 20 sessions.`;
    }
  }
  c.aadhikFilter = aadhikFilter;

  // 3. BULLISH ENGINE: Google Apex & Aadhik Bull Filter
  let googleApex = false;
  let apexReason = "";

  if (st) {
    const isAscendingStructure =
      st["20D"] && st["20D"].lowAge > st["20D"].highAge;
    const isUpperHalf = st["20D"] && st["20D"].rangePos > 65;
    const isPosNearTerm =
      st["5D"] && st["5D"].ret > 0 && st["10D"] && st["10D"].ret > 0;
    const isTechStrong =
      i.weeklyRSI != null &&
      i.weeklyRSI >= 55 &&
      i.weeklyRSI <= 70 &&
      i.smaDeviation != null &&
      i.smaDeviation > 0;

    googleApex =
      (isAscendingStructure && isUpperHalf && isPosNearTerm && isTechStrong) ||
      vpAccumulation ||
      bbSqueezeBreakout;

    if (googleApex) {
      if (bbSqueezeBreakout) {
        apexReason = "Bollinger Bandwidth 60-day squeeze breakout on expanding volume.";
      } else if (vpAccumulation) {
        apexReason = "Volume-Price Accumulation detected (Up-days > 1.5x, Down-days < 0.8x Rel Vol).";
      } else {
        apexReason =
          "Confirmed structural ascent (20D Low is older than High), strong weekly technicals (RSI 55-70, above 20W SMA), and near-term positive returns.";
      }
    }
  }
  c.googleApex = googleApex;

  let aadhikBullFilter = false;
  let aadhikBullReason = "";

  if (st) {
    const ret5 = st["5D"] ? st["5D"].ret : null;
    const ret10 = st["10D"] ? st["10D"].ret : null;
    const ret15 = st["15D"] ? st["15D"].ret : null;
    const ret20 = st["20D"] ? st["20D"].ret : null;

    const rets = [ret5, ret10, ret15, ret20].filter((v) => v !== null);
    const pos2Count = rets.filter((v) => v >= 2.0).length;
    const hasStrongPos7 = rets.some((v) => v >= 7.0);

    const multiPeriodExpansion = pos2Count >= Math.min(3, rets.length);

    let hasBullishGapVol = false;
    let bullGapVal = 0;
    if (s.dailyCandles) {
      const daily = s.dailyCandles;
      const L = daily.length;
      const startIdx = Math.max(1, L - 20);

      const slice30 = daily.slice(Math.max(0, L - 30));
      const avgVol30 =
        slice30.reduce((acc, c) => acc + (c[5] || 0), 0) / (slice30.length || 1);

      for (let j = startIdx; j < L; j++) {
        const prevClose = daily[j - 1][4];
        const open = daily[j][1];
        const vol = daily[j][5] || 0;
        const relV = avgVol30 > 0 ? vol / avgVol30 : 1;

        if (prevClose > 0) {
          const gapPct = ((open - prevClose) / prevClose) * 100;
          if (gapPct >= 3.0 && relV >= 2.0) {
            hasBullishGapVol = true;
            bullGapVal = gapPct;
            break;
          }
        }
      }
    }

    if (multiPeriodExpansion) {
      aadhikBullFilter = true;
      aadhikBullReason =
        "Multi-Period Bullish Expansion: Price gained 2% or more across almost all periods (5D/10D/15D/20D).";
    } else if (hasStrongPos7) {
      aadhikBullFilter = true;
      aadhikBullReason =
        "Sharp Single-Period Thrust: Strong positive swing gain of 7% or more detected.";
    } else if (hasBullishGapVol) {
      aadhikBullFilter = true;
      aadhikBullReason = `Bullish Opening Gap with High Volume: +${fmt(bullGapVal)}% gap open with Rel Vol >= 2.0x in the last 20 sessions.`;
    }
  }
  c.aadhikBullFilter = aadhikBullFilter;

  const isDowntrend = googleAntigravity || aadhikFilter;
  const isBullish = googleApex || aadhikBullFilter;

  const classification = googleAntigravity
    ? "antigravity"
    : aadhikFilter
      ? "aadhik"
      : "none";
  const reason = googleAntigravity
    ? antigravityReason
    : aadhikFilter
      ? aadhikReason
      : "";

  const bullClassification = googleApex
    ? "apex"
    : aadhikBullFilter
      ? "aadhikBull"
      : "none";
  const bullReason = googleApex
    ? apexReason
    : aadhikBullFilter
      ? aadhikBullReason
      : "";

  return {
    ...s,
    _score: score,
    _down: isDowntrend,
    _bull: isBullish,
    _c: c,
    _downtrendType: classification,
    _downtrendReason: reason,
    _bullishType: bullClassification,
    _bullishReason: bullReason,
  };
}

// ── Tabs ──────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentTab = btn.dataset.tab;
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      expandedSym = null;
      render();
    });
  });
}

function setupThemeToggle() {
  const toggleBtn = $("theme-toggle-btn");
  const toggleIcon = $("theme-toggle-icon");
  const savedTheme = localStorage.getItem("screener-theme") || "dark";

  const applyTheme = (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    if (toggleIcon) {
      toggleIcon.innerHTML =
        theme === "light"
          ? `<i data-lucide="sun" style="width:15px;height:15px;stroke-width:2;"></i>`
          : `<i data-lucide="moon" style="width:15px;height:15px;stroke-width:2;"></i>`;
      if (window.lucide) window.lucide.createIcons();
    }
    localStorage.setItem("screener-theme", theme);
  };

  applyTheme(savedTheme);

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "dark";
      const nextTheme = current === "light" ? "dark" : "light";
      applyTheme(nextTheme);
    });
  }
}

function updateTabCounts() {
  const total = allStocks.length;
  const downCount = allStocks.filter((s) => s._down).length;
  const bullCount = allStocks.filter((s) => s._bull).length;
  const top25Count = Math.min(25, downCount);

  if ($("tab-all-count")) $("tab-all-count").textContent = total;
  if ($("tab-top25-count")) $("tab-top25-count").textContent = top25Count;
  if ($("tab-downtrend-count")) $("tab-downtrend-count").textContent = downCount;
  if ($("tab-bullish-count")) $("tab-bullish-count").textContent = bullCount;
  if ($("tab-bookmark-count")) $("tab-bookmark-count").textContent = bookmarks.size;
}

// ── Market Downtrend News Driver Helper ───────────────────────
function getDowntrendNewsHighlight(s) {
  if (s.news && Array.isArray(s.news) && s.news.length > 0) {
    const articlesHtml = s.news.map((item) => `
      <div style="margin-bottom:6px; padding-bottom:6px; border-bottom:1px dashed var(--border-soft);">
        <a href="${item.link}" target="_blank" style="color:var(--text-primary); text-decoration:none; font-weight:600; font-size:0.75rem; display:block;" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text-primary)'">
          ${item.title}
        </a>
        <div style="font-size:0.65rem; color:var(--text-muted); margin-top:2px;">
          ${item.publisher ? item.publisher : "Yahoo Finance"} ${item.providerPublishTime ? "• " + new Date(item.providerPublishTime * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}
        </div>
      </div>
    `).join("");

    return `
      <div style="margin-bottom:8px;">
        <div style="font-size:0.68rem; font-weight:700; color:var(--ind-red); text-transform:uppercase; margin-bottom:4px; letter-spacing:0.03em;">
          Latest Real-Time Headlights:
        </div>
        ${articlesHtml}
      </div>
    `;
  }

  // Fallback to sector macro driver synthesis
  const i = s.indicators;
  const sec = (s.sector || "").toLowerCase();
  let macroText = "";

  if (sec.includes("bank") || sec.includes("finance")) {
    macroText = "FII Liquidation & Elevated US Bond Yields (4.73% pressure on financial margins).";
  } else if (sec.includes("oil") || sec.includes("gas") || sec.includes("energy") || sec.includes("chemical")) {
    macroText = "Surging Brent Crude ($92/bbl) elevating raw input costs & margin squeeze.";
  } else if (sec.includes("auto") || sec.includes("metal")) {
    macroText = "Geopolitical conflict (Strait of Hormuz tension) & Rupee weakness impacting imports.";
  } else if (i.chg1M < -12) {
    macroText = "Broad-based institutional selloff amidst 7-session market benchmark drop (Nifty ~24,078).";
  } else {
    macroText = "Macro risk-off sentiment & relentless foreign investor capital withdrawals.";
  }

  return `
    <div style="font-size:0.72rem; color:var(--text-primary); line-height:1.45; font-weight:500;">
      ${macroText}
    </div>
  `;
}

// ── Render ────────────────────────────────────────────────────
function render() {
  const q = ($("search-box").value || "").trim().toLowerCase();

  // Filter by tab
  let base = allStocks;
  if (currentTab === "top25") {
    // Pick high-conviction downtrend stocks sorted by severity score (score + 1M decline)
    const downList = allStocks.filter((s) => s._down);
    downList.sort((a, b) => {
      const scoreA = (a._score || 0) * 2 + (a.indicators.chg1M || 0);
      const scoreB = (b._score || 0) * 2 + (b.indicators.chg1M || 0);
      return scoreA - scoreB; // most negative / severe first
    });
    base = downList.slice(0, 25);
  } else if (currentTab === "downtrend") {
    base = allStocks.filter((s) => s._down);
  } else if (currentTab === "bullish") {
    base = allStocks.filter((s) => s._bull);
  } else if (currentTab === "bookmarks") {
    base = allStocks.filter((s) =>
      bookmarks.has(s.symbol) ||
      bookmarks.has(s.symbol.replace(/\.NS$/, "")) ||
      bookmarks.has(`${s.symbol}.NS`)
    );
  }

  // Filter by sector
  if (selectedSector !== "all") {
    base = base.filter((s) => s.sector === selectedSector);
  }

  // Filter by search
  displayList = base.filter(
    (s) =>
      !q ||
      s.symbol.toLowerCase().includes(q) ||
      (s.name || "").toLowerCase().includes(q),
  );

  // Sort if not default top25 order (or apply selected sort)
  if (currentTab !== "top25" || sortKey !== "mktCap") {
    displayList.sort((a, b) => {
      let av = getSortVal(a),
        bv = getSortVal(b);
      if (av == null) av = sortDir === "asc" ? Infinity : -Infinity;
      if (bv == null) bv = sortDir === "asc" ? Infinity : -Infinity;
      return sortDir === "asc" ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
    });
  }

  // Update labels
  const tabTitles = {
    all: "All Stocks",
    top25: "Top 25 Extreme Downtrend (High Conviction)",
    downtrend: "Downtrend Stocks",
    bullish: "🚀 Bullish Breakouts",
    bookmarks: "Bookmarked Stocks",
  };
  if ($("toolbar-title")) $("toolbar-title").textContent = tabTitles[currentTab];
  if ($("toolbar-count")) $("toolbar-count").textContent = displayList.length;

  renderTable();
}

function getSortVal(s) {
  const i = s.indicators;
  switch (sortKey) {
    case "symbol":
      return s.symbol;
    case "score":
      return s._score;
    case "price":
      return i.latestClose;
    case "chg1M":
      return i.chg1M;
    case "chgDaily":
      return i.dailyChangePercent;
    case "vol":
      return i.latestVolume;
    case "relVol":
      return i.relVol;
    case "mktCap":
      return i.marketCap;
    case "ret5D": {
      const st = getPriceStructure(s);
      return st && st["5D"] ? st["5D"].ret : null;
    }
    case "ret10D": {
      const st = getPriceStructure(s);
      return st && st["10D"] ? st["10D"].ret : null;
    }
    case "ret15D": {
      const st = getPriceStructure(s);
      return st && st["15D"] ? st["15D"].ret : null;
    }
    case "ret20D": {
      const st = getPriceStructure(s);
      return st && st["20D"] ? st["20D"].ret : null;
    }
    default:
      return null;
  }
}

// ── Table ─────────────────────────────────────────────────────
function renderTable() {
  const tbody = $("table-body");
  if (!tbody) return;

  if (allStocks.length === 0) {
    showEmpty("no-data");
    return;
  }

  // Update dynamic symbol count in the static header
  const countEl = $("symbol-count");
  if (countEl) countEl.textContent = displayList.length;

  // Update active sort indicator on headers
  document.querySelectorAll("th[data-sort]").forEach((th) => {
    const k = th.dataset.sort;
    th.className = "sortable"; // reset classes
    if (k === sortKey) {
      th.className =
        sortDir === "asc"
          ? "sortable sort-asc active-sort"
          : "sortable sort-desc active-sort";
    }
  });

  if (displayList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" style="padding: 40px; text-align: center;">
          <div class="empty">
            <div class="empty-icon">${currentTab === "bookmarks" ? "★" : "🔍"}</div>
            <div class="empty-title">${currentTab === "bookmarks" ? "No bookmarks yet" : "No stocks match"}</div>
            <div class="empty-body">${currentTab === "bookmarks" ? "Click ☆ on any row to bookmark." : "Try a different search."}</div>
          </div>
        </td>
      </tr>`;
    return;
  }

  // Render flat stock rows
  let tbodyHtml = "";
  displayList.forEach((s) => {
    tbodyHtml += buildRow(s);
  });

  tbody.innerHTML = tbodyHtml;

  // Row click opens full stock page in a new tab
  tbody.querySelectorAll("tr[data-sym]").forEach((tr) => {
    tr.addEventListener("click", (e) => {
      if (!e.target.closest(".bm-btn")) {
        const sym = tr.dataset.sym;
        window.open(`?stock=${encodeURIComponent(sym)}`, "_blank");
      }
    });
  });

  // Bookmark click
  tbody.querySelectorAll(".bm-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleBookmark(btn.dataset.sym);
    });
  });
}

function buildRow(s) {
  const i = s.indicators;
  const bm =
    bookmarks.has(s.symbol) ||
    bookmarks.has(s.symbol.replace(/\.NS$/, "")) ||
    bookmarks.has(`${s.symbol}.NS`);

  // Daily Chg % colors
  const chgDailyVal = i.dailyChangePercent;
  const chgDailyColor =
    chgDailyVal === null
      ? "gray"
      : chgDailyVal > 0
        ? "green"
        : chgDailyVal < 0
          ? "red"
          : "gray";
  const chgDailySign = chgDailyVal > 0 ? "+" : "";

  // 1-month Chg % colors
  const chg1MVal = i.chg1M;
  const chg1MColor =
    chg1MVal === null
      ? "gray"
      : chg1MVal > 0
        ? "green"
        : chg1MVal < 0
          ? "red"
          : "gray";
  const chg1MSign = chg1MVal > 0 ? "+" : "";

  // Relative volume highlight
  const relVolVal = i.relVol;
  const relVolColor =
    relVolVal === null ? "gray" : relVolVal >= 1.5 ? "blue" : "gray";

  // EPS Growth colors
  const epsGrowthVal = i.epsGrowth;
  const epsGrowthColor =
    epsGrowthVal === null
      ? "gray"
      : epsGrowthVal > 0
        ? "green"
        : epsGrowthVal < 0
          ? "red"
          : "gray";
  const epsGrowthSign = epsGrowthVal > 0 ? "+" : "";

  let signalBadge = "";
  if (s._down) {
    if (s._downtrendType === "antigravity") {
      signalBadge += `<span class="google-badge" title="${s._downtrendReason || "Google Antigravity Signal: Bearish Structure"}">Google Antigravity</span>`;
    } else if (s._downtrendType === "aadhik") {
      signalBadge += `<span class="aadhik-badge" title="${s._downtrendReason}">Aadhik Bear</span>`;
    }
  }
  if (s._bull) {
    if (s._bullishType === "apex") {
      signalBadge += `<span class="google-apex-badge" title="${s._bullishReason || "Google Apex Signal: Bullish Ascent"}">Google Apex</span>`;
    } else if (s._bullishType === "aadhikBull") {
      signalBadge += `<span class="aadhik-bull-badge" title="${s._bullishReason}">Aadhik Bull</span>`;
    }
  }

  const struct = getPriceStructure(s) || {};
  const r5 = struct["5D"] ? struct["5D"].ret : null;
  const r10 = struct["10D"] ? struct["10D"].ret : null;
  const r15 = struct["15D"] ? struct["15D"].ret : null;
  const r20 = struct["20D"] ? struct["20D"].ret : null;

  const getChgChip = (val) => {
    if (val == null) return "—";
    const cls = val > 0 ? "green" : val < 0 ? "red" : "gray";
    const sign = val > 0 ? "+" : "";
    return `<span class="chip chip-${cls}">${sign}${fmt(val)}%</span>`;
  };

  const rowBg = s._down ? "background:rgba(239,68,68,0.06);" : s._bull ? "background:rgba(16,185,129,0.06);" : "";

  return `
    <tr data-sym="${s.symbol}" style="${rowBg}">
      <td>
        <button class="bm-btn ${bm ? "bookmarked" : ""}" data-sym="${s.symbol}" title="${bm ? "Remove bookmark" : "Bookmark"}">
          ${bm ? "★" : "☆"}
        </button>
      </td>
      <td class="sym-cell">
        <div style="display:flex;align-items:center;gap:4px;">
          <div>
            <div style="display:flex;align-items:center;font-weight:600;flex-wrap:wrap;gap:2px;">
              ${s.symbol}${signalBadge}
              <a href="?stock=${encodeURIComponent(s.symbol)}" target="_blank" class="launch-btn" title="Open ${s.symbol} full analysis in new tab" onclick="event.stopPropagation();">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
              </a>
            </div>
            <div class="stock-name" style="font-size:0.65rem;color:var(--text-muted);">${truncate(s.name, 20)}</div>
          </div>
        </div>
      </td>
      <td class="td-mono">${i.latestClose != null ? "₹" + fmtPrice(i.latestClose) : "—"}</td>
      <td><span class="chip chip-${chg1MColor}">${i.chg1M != null ? chg1MSign + fmt(i.chg1M) + "%" : "—"}</span></td>
      <td><span class="chip chip-${chgDailyColor}">${i.dailyChangePercent != null ? chgDailySign + fmt(i.dailyChangePercent) + "%" : "—"}</span></td>
      <td class="td-mono" style="font-size:0.75rem;">${fmtVol(i.latestVolume)}</td>
      <td><span class="chip chip-${relVolColor}">${i.relVol != null ? fmt(i.relVol) + "x" : "—"}</span></td>
      <td class="td-mono" style="font-size:0.75rem;">${fmtMktCap(i.marketCap)}</td>
      <td>${getChgChip(r5)}</td>
      <td>${getChgChip(r10)}</td>
      <td>${getChgChip(r15)}</td>
      <td>${getChgChip(r20)}</td>
    </tr>`;
}

function buildExpand(s) {
  const i = s.indicators;
  const c = s._c;
  const st = getPriceStructure(s) || {};

  const R = (label, value) =>
    `<div class="expand-row-item"><span class="expand-row-label">${label}</span><span class="expand-row-value">${value ?? "—"}</span></div>`;

  const condRows = [
    {
      k: "diCross",
      label: "−DI > +DI",
      val: `${fmt(i.weeklyDIMinus)} vs ${fmt(i.weeklyDIPlus)}`,
    },
    { k: "belowSMA", label: "Price < 20W SMA", val: fmt(i.smaDeviation) + "%" },
    { k: "rsiWeak", label: "RSI (W) < 50", val: fmt(i.weeklyRSI) },
    { k: "adxValid", label: "ADX (W) > 20", val: fmt(i.weeklyADX) },
  ];

  const fmtRet = (val) => {
    if (val == null) return "—";
    const color =
      val > 0
        ? "var(--ind-green)"
        : val < 0
          ? "var(--ind-red)"
          : "var(--text-secondary)";
    const sign = val > 0 ? "+" : "";
    return `<span style="color:${color};font-weight:600;">${sign}${fmt(val)}%</span>`;
  };

  const getVal = (period, key, formatFn = fmt) => {
    const pData = st[period];
    if (!pData || pData[key] == null) return "—";
    return formatFn(pData[key]);
  };

  let reasonBanner = "";
  if (s._down) {
    const isAg = s._downtrendType === "antigravity";
    const bg = isAg ? "rgba(239, 68, 68, 0.12)" : "rgba(139, 92, 246, 0.12)";
    const border = isAg ? "rgba(239, 68, 68, 0.3)" : "rgba(139, 92, 246, 0.3)";
    const color = isAg ? "#F87171" : "#A78BFA";
    const label = isAg ? "Google Antigravity" : "Aadhik";
    reasonBanner = `
      <div style="background:${bg}; border:1px solid ${border}; color:${color}; padding:8px 12px; border-radius:6px; margin-bottom:12px; font-size:0.75rem; display:flex; align-items:center; gap:8px;">
        <span style="font-weight:700; font-size:0.85rem;">⚠️</span>
        <div>
          <strong style="font-weight:600;">Downtrend Classification (${label}):</strong> ${s._downtrendReason}
        </div>
      </div>
    `;
  }

  return `<div class="expand-content">
    ${reasonBanner}
    <div class="expand-flex-container">
      
      <!-- Column 1: Premium Expansive Interactive Chart -->
      <div class="chart-card-wrapper" style="display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:baseline; border-bottom:1px solid var(--border-soft); padding-bottom:4px; margin-bottom:6px;">
            <div class="expand-card-title">Price Trend</div>
            <div id="chart-bounds-${s.symbol}" style="font-size:0.67rem; color:var(--text-muted); font-weight:500;">
              Loading bounds...
            </div>
          </div>
          <div id="chart-info-${s.symbol}" style="font-size:0.75rem; font-weight:600; color:var(--text-primary); min-height:18px;">
            Loading...
          </div>
        </div>
        
        <div id="chart-container-${s.symbol}" style="flex:1; min-height:130px; display:flex; align-items:stretch; margin-top:6px;">
          <!-- Injected dynamically on row expand -->
        </div>

        <!-- Bottom Toolbar Controls -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-top:8px; padding-top:6px; border-top:1px solid var(--border-soft);">
          <!-- Chart Type Selector -->
          <div class="chart-tabs chart-type-tabs" style="display:flex; gap:8px; align-items:center;">
            <span style="color:var(--text-muted); font-weight:600; font-size:0.65rem; text-transform:uppercase; letter-spacing:0.02em;">Style:</span>
            <button class="chart-tab-link ${activeChartType === "candle" ? "active" : ""}" onclick="changeChartType('${s.symbol}', 'candle', event)">Candles</button>
            <button class="chart-tab-link ${activeChartType === "line" ? "active" : ""}" onclick="changeChartType('${s.symbol}', 'line', event)">Line</button>
          </div>
          <!-- Timeframe Selector -->
          <div class="chart-tabs chart-tf-tabs" style="display:flex; gap:8px; align-items:center;">
            <span style="color:var(--text-muted); font-weight:600; font-size:0.65rem; text-transform:uppercase; letter-spacing:0.02em;">Interval:</span>
            <button class="chart-tab-link active" onclick="changeChartInterval('${s.symbol}', 'weekly', event)">1 Week</button>
            <button class="chart-tab-link" onclick="changeChartInterval('${s.symbol}', 'monthly', event)">1 Month</button>
          </div>
        </div>
      </div>

      <!-- Column 2: Price Structure Table Matrix -->
      <div class="expand-card structure-card" style="flex: 1.2; min-width: 280px; display: flex; flex-direction: column;">
        <div class="expand-card-title" style="margin-bottom: 8px;">Price Structure</div>
        <table class="structure-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>5D</th>
              <th>10D</th>
              <th>15D</th>
              <th>20D</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Return</td>
              <td>${fmtRet(st["5D"]?.ret)}</td>
              <td>${fmtRet(st["10D"]?.ret)}</td>
              <td>${fmtRet(st["15D"]?.ret)}</td>
              <td>${fmtRet(st["20D"]?.ret)}</td>
            </tr>
            <tr>
              <td>Range</td>
              <td>${getVal("5D", "rangePct")}%</td>
              <td>${getVal("10D", "rangePct")}%</td>
              <td>${getVal("15D", "rangePct")}%</td>
              <td>${getVal("20D", "rangePct")}%</td>
            </tr>
            <tr>
              <td>Position</td>
              <td>${getVal("5D", "rangePos", (v) => fmt(v, 0))}%</td>
              <td>${getVal("10D", "rangePos", (v) => fmt(v, 0))}%</td>
              <td>${getVal("15D", "rangePos", (v) => fmt(v, 0))}%</td>
              <td>${getVal("20D", "rangePos", (v) => fmt(v, 0))}%</td>
            </tr>
            <tr>
              <td>Drawdown</td>
              <td>${fmtRet(st["5D"]?.drawdown)}</td>
              <td>${fmtRet(st["10D"]?.drawdown)}</td>
              <td>${fmtRet(st["15D"]?.drawdown)}</td>
              <td>${fmtRet(st["20D"]?.drawdown)}</td>
            </tr>
            <tr>
              <td>High Age</td>
              <td>${getVal("5D", "highAge", (v) => v + "d")}</td>
              <td>${getVal("10D", "highAge", (v) => v + "d")}</td>
              <td>${getVal("15D", "highAge", (v) => v + "d")}</td>
              <td>${getVal("20D", "highAge", (v) => v + "d")}</td>
            </tr>
            <tr>
              <td>Low Age</td>
              <td>${getVal("5D", "lowAge", (v) => v + "d")}</td>
              <td>${getVal("10D", "lowAge", (v) => v + "d")}</td>
              <td>${getVal("15D", "lowAge", (v) => v + "d")}</td>
              <td>${getVal("20D", "lowAge", (v) => v + "d")}</td>
            </tr>
            <tr>
              <td>Swings</td>
              <td>${getVal("5D", "swings", (v) => v)}</td>
              <td>${getVal("10D", "swings", (v) => v)}</td>
              <td>${getVal("15D", "swings", (v) => v)}</td>
              <td>${getVal("20D", "swings", (v) => v)}</td>
            </tr>
            <tr>
              <td>Gap Downs</td>
              <td>${getVal("5D", "gapDowns", (v) => v)}</td>
              <td>${getVal("10D", "gapDowns", (v) => v)}</td>
              <td>${getVal("15D", "gapDowns", (v) => v)}</td>
              <td>${getVal("20D", "gapDowns", (v) => v)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Column 3: Technicals & Fundamentals Card Group -->
      <div class="tech-cards-wrapper">
        <div class="expand-card"><div class="expand-card-title">Weekly Technicals</div>
          ${R("ADX", fmt(i.weeklyADX))} ${R("+DI", fmt(i.weeklyDIPlus))} ${R("−DI", fmt(i.weeklyDIMinus))}
          ${R("RSI", fmt(i.weeklyRSI))} ${R("SMA 20W", "₹" + fmtPrice(i.weeklySMA20))}
          ${R("SMA Dev%", (i.smaDeviation >= 0 ? "+" : "") + fmt(i.smaDeviation) + "%")}
          ${R("BB Width", i.bbWidth != null ? fmt(i.bbWidth) + "%" : "—")}
        </div>
        <div class="expand-card"><div class="expand-card-title">Monthly Technicals</div>
          ${R("ADX", fmt(i.monthlyADX))} ${R("RSI", fmt(i.monthlyRSI))}
          ${R("SMA 10M", "₹" + fmtPrice(i.monthlySMA10))} ${R("Months Available", i.monthlyBars + " bars")}
        </div>
        <div class="expand-card"><div class="expand-card-title">Signals Status</div>
          <!-- Premium Google Antigravity Signal -->
          <div style="display:flex;align-items:center;gap:7px;padding:5px 7px;border-radius:6px;margin-bottom:8px;border:1px solid ${c.googleAntigravity ? "#d2e3fc" : "var(--border-soft)"};background:${c.googleAntigravity ? "#e8f0fe" : "var(--surface-warm)"};">
            <span style="font-size:0.8rem;line-height:1;color:${c.googleAntigravity ? "#1a73e8" : "var(--text-muted)"};font-weight:700;">G</span>
            <span style="flex:1;font-size:0.7rem;font-weight:600;color:${c.googleAntigravity ? "#1a73e8" : "var(--text-primary)"};">Google Antigravity Signal</span>
            <span style="font-family:'JetBrains Mono',monospace;font-size:0.67rem;font-weight:700;color:${c.googleAntigravity ? "#1a73e8" : "var(--text-muted)"};">${c.googleAntigravity ? "BEARISH" : "NEUTRAL"}</span>
          </div>

          ${condRows
            .map(
              (ci) => `
            <div style="display:flex;align-items:center;gap:7px;padding:4px 6px;border-radius:6px;margin-bottom:4px;border:1px solid ${c[ci.k] ? "var(--ind-red-border)" : "var(--border-soft)"};background:${c[ci.k] ? "var(--ind-red-bg)" : "var(--surface-warm)"};">
              <span style="font-size:0.8rem;line-height:1;">${c[ci.k] ? "✓" : "○"}</span>
              <span style="flex:1;font-size:0.7rem;color:${c[ci.k] ? "var(--text-primary)" : "var(--text-muted)"};">${ci.label}</span>
              <span style="font-family:'JetBrains Mono',monospace;font-size:0.67rem;color:var(--text-secondary);">${ci.val}</span>
            </div>`,
            )
            .join("")}
        </div>
        <!-- Fundamentals Card -->
        <div class="expand-card"><div class="expand-card-title">Fundamentals & Sector</div>
          ${R("Sector", s.sector || "Others")}
          ${R("P/E Ratio", i.pe != null ? fmt(i.pe) : "—")}
          ${R("EPS TTM", i.eps != null ? "₹" + fmt(i.eps) : "—")}
          ${R("EPS Growth", i.epsGrowth != null ? (i.epsGrowth >= 0 ? "+" : "") + fmt(i.epsGrowth) + "%" : "—")}
          ${R("Div Yield", i.divYield != null ? fmt(i.divYield) + "%" : "—")}
        </div>

        <!-- Downtrend Catalyst & News Drivers Highlight -->
        ${s._down ? `
        <div class="expand-card" style="border: 1px solid var(--ind-red-border); background: var(--ind-red-bg);">
          <div class="expand-card-title" style="color: var(--ind-red); display: flex; align-items: center; gap: 4px;">
            <i data-lucide="newspaper" style="width:13px;height:13px;"></i> Downtrend News & Macro Driver
          </div>
          <div style="font-size: 0.72rem; color: var(--text-primary); line-height: 1.45; font-weight: 500; margin-top: 4px;">
            ${getDowntrendNewsHighlight(s)}
          </div>
        </div>` : ""}
      </div>
      
    </div>
  </div>`;
}

// ── Expand row ────────────────────────────────────────────────
function toggleExpand(sym) {
  const row = $(`exp-${sym}`);
  const tr = document.querySelector(`tr[data-sym="${sym}"]`);
  if (!row) return;
  if (expandedSym === sym) {
    row.style.display = "none";
    tr.classList.remove("expanded");
    expandedSym = null;
  } else {
    if (expandedSym) {
      const pr = $(`exp-${expandedSym}`),
        pt = document.querySelector(`tr[data-sym="${expandedSym}"]`);
      if (pr) pr.style.display = "none";
      if (pt) pt.classList.remove("expanded");
    }
    row.style.display = "";
    tr.classList.add("expanded");
    expandedSym = sym;
    drawChart(sym, "weekly");
    setTimeout(() => {
      const headerHeight = document.querySelector("thead")?.clientHeight || 45;
      const rect = tr.getBoundingClientRect();
      const targetY = window.scrollY + rect.top - headerHeight - 10;
      window.scrollTo({ top: targetY, behavior: "smooth" });
    }, 80);
  }
}

// ── Immersive Mode Launcher (Single Stock View) ──────────────
function renderStandaloneStockPage(s) {
  document.title = `${s.symbol} — Immersive Mode | Nifty 500 Screener`;
  expandedSym = s.symbol;

  const i = s.indicators;
  const c = s._c;
  const st = getPriceStructure(s) || {};

  const chgDailyVal = i.dailyChangePercent;
  const chgDailyColor =
    chgDailyVal > 0
      ? "var(--ind-green)"
      : chgDailyVal < 0
        ? "var(--ind-red)"
        : "var(--text-secondary)";
  const chgDailySign = chgDailyVal > 0 ? "+" : "";

  let signalBadges = "";
  if (s._down) {
    if (s._downtrendType === "antigravity") {
      signalBadges += `<span class="google-badge" style="font-size:0.75rem;padding:4px 8px;">Google Antigravity</span>`;
    } else if (s._downtrendType === "aadhik") {
      signalBadges += `<span class="aadhik-badge" style="font-size:0.75rem;padding:4px 8px;">Aadhik Bear</span>`;
    }
  }
  if (s._bull) {
    if (s._bullishType === "apex") {
      signalBadges += `<span class="google-apex-badge" style="font-size:0.75rem;padding:4px 8px;">Google Apex</span>`;
    } else if (s._bullishType === "aadhikBull") {
      signalBadges += `<span class="aadhik-bull-badge" style="font-size:0.75rem;padding:4px 8px;">Aadhik Bull</span>`;
    }
  }

  const R = (label, value) =>
    `<div class="expand-row-item"><span class="expand-row-label">${label}</span><span class="expand-row-value">${value ?? "—"}</span></div>`;

  const getVal = (period, key, formatter = (v) => fmt(v)) => {
    if (!st || !st[period] || st[period][key] == null) return "—";
    return formatter(st[period][key]);
  };

  const fmtRet = (val) => {
    if (val == null) return "—";
    const color =
      val > 0
        ? "var(--ind-green)"
        : val < 0
          ? "var(--ind-red)"
          : "var(--text-secondary)";
    const sign = val > 0 ? "+" : "";
    return `<span style="color:${color};font-weight:600;">${sign}${fmt(val)}%</span>`;
  };

  // Replace entire body for Immersive Mode (no top navbar, full window utilization)
  document.body.innerHTML = `
    <div class="immersive-wrapper">
      <!-- Immersive Header Bar -->
      <header class="immersive-header">
        <div style="display:flex; align-items:center; gap:10px;">
          <!-- Modern Apple Translucent Pill Navigation -->
          <nav style="display:inline-flex; align-items:center; gap:8px; padding:4px 10px; background:var(--surface); border:1px solid var(--border-soft); border-radius:var(--radius-pill); font-size:0.8rem; font-weight:500;">
            <a href="/" style="color:var(--text-secondary); text-decoration:none; display:inline-flex; align-items:center; gap:5px; transition:color 0.15s ease;" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text-secondary)'">
              <i data-lucide="arrow-left" style="width:14px;height:14px;stroke-width:2.2;"></i>
              Screener
            </a>
            <span style="color:var(--text-muted); font-size:0.75rem;">/</span>
            <span style="color:var(--text-primary); font-weight:600; font-family:var(--font-heading);">${s.symbol}</span>
          </nav>
          <span style="font-size:0.82rem; font-weight:500; color:var(--text-muted); margin-left:4px;">${s.name}</span>
          ${signalBadges}
        </div>
        
        <div style="display:flex; align-items:center; gap:16px;">
          <div>
            <span style="font-size:0.65rem; color:var(--text-muted); font-weight:600; text-transform:uppercase;">Price:</span>
            <strong style="font-size:1rem; font-family:'SF Mono', SFMono-Regular, ui-monospace, Menlo, monospace; margin-left:4px;">₹${fmtPrice(i.latestClose)}</strong>
          </div>
          <div>
            <span style="font-size:0.65rem; color:var(--text-muted); font-weight:600; text-transform:uppercase;">Daily:</span>
            <strong style="font-size:1rem; color:${chgDailyColor}; font-family:'SF Mono', SFMono-Regular, ui-monospace, Menlo, monospace; margin-left:4px;">${chgDailySign}${fmt(chgDailyVal)}%</strong>
          </div>
          <div>
            <span style="font-size:0.65rem; color:var(--text-muted); font-weight:600; text-transform:uppercase;">Mkt Cap:</span>
            <strong style="font-size:0.95rem; font-family:'SF Mono', SFMono-Regular, ui-monospace, Menlo, monospace; margin-left:4px;">${fmtMktCap(i.marketCap)}</strong>
          </div>
        </div>
      </header>

      <!-- Immersive Body Split: 65% Left (Interactive Canvas), 35% Right (Accordions) -->
      <div class="immersive-body">
        
        <!-- Left Side: Maximized Interactive Canvas Chart (65% Width) -->
        <div class="immersive-left">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid var(--border-soft); padding-bottom:6px;">
            <div style="font-weight:700; font-size:0.95rem; color:var(--text-primary);">Interactive Technical Chart</div>
            <div id="chart-bounds-${s.symbol}" style="font-size:0.75rem; color:var(--text-muted); font-weight:500;">
              Loading bounds...
            </div>
          </div>

          <div id="chart-info-${s.symbol}" style="font-size:0.8rem; font-weight:600; color:var(--text-primary); min-height:22px; margin-bottom:6px;">
            Loading chart data...
          </div>

          <!-- 82% Height Canvas Container (Lifts bottom controls close to X-axis) -->
          <div id="chart-container-${s.symbol}" style="height:82%; max-height:82%; min-height:300px; width:100%; display:flex; align-items:stretch; margin-bottom:4px;">
          </div>

          <!-- Full Immersive Mode Chart Controls (Lifted close to chart X-axis) -->
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-top:4px; padding:8px 0 10px; border-top:1px solid var(--border-soft);">
            <!-- Style -->
            <div class="chart-tabs chart-type-tabs" style="display:flex; gap:8px; align-items:center;">
              <span style="color:var(--text-muted); font-weight:600; font-size:0.7rem; text-transform:uppercase;">Style:</span>
              <button class="chart-tab-link ${activeChartType === "candle" ? "active" : ""}" onclick="changeChartType('${s.symbol}', 'candle', event)">Candles</button>
              <button class="chart-tab-link ${activeChartType === "line" ? "active" : ""}" onclick="changeChartType('${s.symbol}', 'line', event)">Line</button>
            </div>
            <!-- Overlays (Full controls in Immersive Mode) -->
            <div class="chart-tabs chart-overlay-tabs" style="display:flex; gap:6px; align-items:center;">
              <span style="color:var(--text-muted); font-weight:600; font-size:0.7rem; text-transform:uppercase;">Overlays:</span>
              <button class="chart-tab-link ${activeOverlays.bb ? "active active-bb" : ""}" onclick="toggleOverlay('${s.symbol}', 'bb', event)" title="Bollinger Bands (20, 2)">BB</button>
              <button class="chart-tab-link ${activeOverlays.vwap ? "active active-vwap" : ""}" onclick="toggleOverlay('${s.symbol}', 'vwap', event)" title="Volume Weighted Average Price">VWAP</button>
              <button class="chart-tab-link ${activeOverlays.ema ? "active active-ema" : ""}" onclick="toggleOverlay('${s.symbol}', 'ema', event)" title="20-period Exponential Moving Average">EMA(20)</button>
            </div>
            <!-- Timeframe -->
            <div class="chart-tabs chart-tf-tabs" style="display:flex; gap:8px; align-items:center;">
              <span style="color:var(--text-muted); font-weight:600; font-size:0.7rem; text-transform:uppercase;">Interval:</span>
              <button class="chart-tab-link active" onclick="changeChartInterval('${s.symbol}', 'weekly', event)">1 Week</button>
              <button class="chart-tab-link" onclick="changeChartInterval('${s.symbol}', 'monthly', event)">1 Month</button>
            </div>
          </div>
        </div>

        <!-- Right Side: Accordions for Technicals, Signals & Fundamentals (35% Width) -->
        <div class="immersive-right">
          
          <!-- Accordion 1: Price Structure -->
          <div class="accordion-item open" id="acc-structure">
            <div class="accordion-header" onclick="this.parentElement.classList.toggle('open')">
              <span style="display:inline-flex;align-items:center;gap:6px;font-family:var(--font-heading);font-weight:600;"><i data-lucide="bar-chart-2" style="width:14px;height:14px;stroke-width:2.2;"></i> Price Structure</span>
              <span class="accordion-icon"><i data-lucide="chevron-down" style="width:14px;height:14px;"></i></span>
            </div>
            <div class="accordion-content" style="padding:10px 12px;">
              <table class="structure-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>5D</th>
                    <th>10D</th>
                    <th>15D</th>
                    <th>20D</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Return</td>
                    <td>${fmtRet(st["5D"]?.ret)}</td>
                    <td>${fmtRet(st["10D"]?.ret)}</td>
                    <td>${fmtRet(st["15D"]?.ret)}</td>
                    <td>${fmtRet(st["20D"]?.ret)}</td>
                  </tr>
                  <tr>
                    <td>Range</td>
                    <td>${getVal("5D", "rangePct")}%</td>
                    <td>${getVal("10D", "rangePct")}%</td>
                    <td>${getVal("15D", "rangePct")}%</td>
                    <td>${getVal("20D", "rangePct")}%</td>
                  </tr>
                  <tr>
                    <td>Position</td>
                    <td>${getVal("5D", "rangePos", (v) => fmt(v, 0))}%</td>
                    <td>${getVal("10D", "rangePos", (v) => fmt(v, 0))}%</td>
                    <td>${getVal("15D", "rangePos", (v) => fmt(v, 0))}%</td>
                    <td>${getVal("20D", "rangePos", (v) => fmt(v, 0))}%</td>
                  </tr>
                  <tr>
                    <td>Drawdown</td>
                    <td>${fmtRet(st["5D"]?.drawdown)}</td>
                    <td>${fmtRet(st["10D"]?.drawdown)}</td>
                    <td>${fmtRet(st["15D"]?.drawdown)}</td>
                    <td>${fmtRet(st["20D"]?.drawdown)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Accordion 2: Signals & Classification Status -->
          <div class="accordion-item" id="acc-signals">
            <div class="accordion-header" onclick="this.parentElement.classList.toggle('open')">
              <span style="display:inline-flex;align-items:center;gap:6px;font-family:var(--font-heading);font-weight:600;"><i data-lucide="target" style="width:14px;height:14px;stroke-width:2.2;"></i> Regime & Signals Status</span>
              <span class="accordion-icon"><i data-lucide="chevron-down" style="width:14px;height:14px;"></i></span>
            </div>
            <div class="accordion-content" style="padding:8px 12px;">
              <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-soft);">
                <span style="font-size:0.78rem;font-weight:500;color:var(--text-primary);">Google Antigravity</span>
                <span style="font-family:var(--font-mono);font-size:0.75rem;font-weight:600;color:${c.googleAntigravity ? "var(--ind-red)" : "var(--text-muted)"};">${c.googleAntigravity ? "BEARISH" : "NEUTRAL"}</span>
              </div>
              <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;">
                <span style="font-size:0.78rem;font-weight:500;color:var(--text-primary);">Google Apex</span>
                <span style="font-family:var(--font-mono);font-size:0.75rem;font-weight:600;color:${c.googleApex ? "var(--ind-green)" : "var(--text-muted)"};">${c.googleApex ? "BULLISH" : "NEUTRAL"}</span>
              </div>
            </div>
          </div>

          <!-- Accordion 3: Weekly & Monthly Technicals -->
          <div class="accordion-item" id="acc-technicals">
            <div class="accordion-header" onclick="this.parentElement.classList.toggle('open')">
              <span style="display:inline-flex;align-items:center;gap:6px;font-family:var(--font-heading);font-weight:600;"><i data-lucide="trending-up" style="width:14px;height:14px;stroke-width:2.2;"></i> Technicals & Fundamentals</span>
              <span class="accordion-icon"><i data-lucide="chevron-down" style="width:14px;height:14px;"></i></span>
            </div>
            <div class="accordion-content">
              ${R("Weekly ADX", fmt(i.weeklyADX))}
              ${R("Weekly RSI", fmt(i.weeklyRSI))}
              ${R("SMA 20W", "₹" + fmtPrice(i.weeklySMA20))}
              ${R("SMA Dev%", (i.smaDeviation >= 0 ? "+" : "") + fmt(i.smaDeviation) + "%")}
              <div style="border-top:1px solid var(--border-soft); margin:8px 0; padding-top:4px;"></div>
              ${R("Sector", s.sector || "Others")}
              ${R("P/E Ratio", fmt(i.pe))}
              ${R("EPS Growth", i.epsGrowth != null ? (i.epsGrowth >= 0 ? "+" : "") + fmt(i.epsGrowth) + "%" : "—")}
            </div>
          </div>

          <!-- Accordion 4: Market Headlines & Macro Drivers -->
          <div class="accordion-item open" id="acc-news">
            <div class="accordion-header" onclick="this.parentElement.classList.toggle('open')">
              <span style="display:inline-flex;align-items:center;gap:6px;color:var(--text-primary);font-family:var(--font-heading);font-weight:600;"><i data-lucide="newspaper" style="width:14px;height:14px;stroke-width:2.2;color:var(--text-muted);"></i> News & Sector Macro Drivers</span>
              <span class="accordion-icon"><i data-lucide="chevron-down" style="width:14px;height:14px;"></i></span>
            </div>
            <div class="accordion-content" style="padding:14px; border-top:1px solid var(--border-soft);">
              <div style="font-size:0.75rem; color:var(--text-primary); font-weight:400; line-height:1.6;">
                ${getDowntrendNewsHighlight(s)}
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  `;

  // Draw chart in 78% container and initialize SVG icons
  setTimeout(() => {
    drawChart(s.symbol, "weekly");
    if (window.lucide) window.lucide.createIcons();
  }, 100);
}

// ── Bookmarks ─────────────────────────────────────────────────
function toggleBookmark(sym) {
  if (bookmarks.has(sym)) {
    bookmarks.delete(sym);
    toast("Bookmark removed", "info");
  } else {
    bookmarks.add(sym);
    toast("★ " + sym + " bookmarked", "success");
  }
  localStorage.setItem("screener-bookmarks", JSON.stringify([...bookmarks]));
  updateBookmarkPill();
  updateTabCounts();
  render();
}

function updateBookmarkPill() {
  const countEl = $("tab-bookmark-count");
  if (countEl) {
    countEl.textContent = bookmarks.size;
  }
}

// ── Pagination (Not needed since sectors collapsible & fully scrollable) ───
function renderPagination() {
  // Sectors are collapsible and scrollable, so pagination is disabled
  const bar = $("pagination-bar");
  if (bar) bar.style.display = "none";
}

// ── Freshness ────────────────────────────────────────────────
function updateFreshness(fetchedAt) {
  if (!fetchedAt) return;
  const fetched = new Date(fetchedAt);
  const diffDays = Math.floor((Date.now() - fetched) / 86400000);
  const diffH = Math.floor((Date.now() - fetched) / 3600000);
  let label, cls;
  if (diffH < 24) {
    label = "Today";
    cls = "fresh";
  } else if (diffDays < 7) {
    label = diffDays + "d ago";
    cls = "fresh";
  } else if (diffDays < 30) {
    label = diffDays + "d old";
    cls = "stale";
  } else {
    label = diffDays + "d old";
    cls = "very-stale";
  }
  if ($("freshness-text")) $("freshness-text").textContent = label;
  if ($("freshness-badge")) $("freshness-badge").className = `freshness ${cls}`;
}

// ── Empty state ───────────────────────────────────────────────
function showEmpty(type, msg = "") {
  $("table-area").innerHTML =
    type === "no-data"
      ? `
    <div class="empty">
      <div class="empty-icon">📂</div>
      <div class="empty-title">No data found</div>
      <div class="empty-body">Run to fetch data:<br><br><code>npm run setup</code><br><code>npm run fetch</code></div>
    </div>`
      : `
    <div class="empty"><div class="empty-icon">⚠️</div><div class="empty-title">Error</div><div class="empty-body"><code>${msg}</code></div></div>`;
}

// ── CSV export ────────────────────────────────────────────────
function exportCSV() {
  if (!displayList.length) {
    toast("Nothing to export", "error");
    return;
  }
  const h = [
    "Symbol",
    "Name",
    "Sector",
    "Score",
    "Downtrend",
    "CMP",
    "Chg_1M",
    "Chg_Daily",
    "Vol",
    "Rel_Vol",
    "Mkt_Cap",
    "Ret_5D",
    "Ret_10D",
    "Ret_15D",
    "Ret_20D",
  ];
  const rows = displayList.map((s) => {
    const i = s.indicators;
    const st = getPriceStructure(s) || {};
    return [
      s.symbol,
      s.name,
      s.sector,
      s._score,
      s._down ? 1 : 0,
      i.latestClose,
      i.chg1M,
      i.dailyChangePercent,
      i.latestVolume,
      i.relVol,
      i.marketCap,
      st["5D"] ? st["5D"].ret : null,
      st["10D"] ? st["10D"].ret : null,
      st["15D"] ? st["15D"].ret : null,
      st["20D"] ? st["20D"].ret : null,
    ].map((v) => (v == null ? "" : v));
  });
  const csv = [h, ...rows].map((r) => r.join(",")).join("\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
    download: `screener_${new Date().toISOString().split("T")[0]}.csv`,
  });
  a.click();
  toast("Exported " + displayList.length + " stocks", "success");
}

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, type = "success") {
  const t = Object.assign(document.createElement("div"), {
    className: `toast ${type}`,
    textContent: msg,
  });
  $("toast-container").appendChild(t);
  setTimeout(() => {
    t.style.transition = "opacity 0.3s";
    t.style.opacity = "0";
    setTimeout(() => t.remove(), 300);
  }, 2200);
}

// ── Utilities ─────────────────────────────────────────────────
const fmt = (v, d = 2) => (v == null ? "—" : parseFloat(v).toFixed(d));
const fmtPrice = (v) =>
  !v && v !== 0
    ? "—"
    : parseFloat(v).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
const fmtVol = (v) =>
  !v
    ? "—"
    : v >= 1e6
      ? (v / 1e6).toFixed(2) + "M"
      : v >= 1e3
        ? (v / 1e3).toFixed(1) + "K"
        : v.toString();
const fmtMktCap = (v) =>
  !v
    ? "—"
    : v >= 1e12
      ? (v / 1e12).toFixed(2) + " T"
      : v >= 1e9
        ? (v / 1e9).toFixed(2) + " B"
        : v >= 1e7
          ? (v / 1e7).toFixed(2) + " Cr"
          : v.toLocaleString("en-IN");
const truncate = (s, n) => (!s ? "" : s.length > n ? s.slice(0, n) + "…" : s);
const debounce = (fn, ms) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

// ── Price Structure Calculations ──────────────────────────────
function getPriceStructure(s) {
  if (s._structure) return s._structure;

  const daily = s.dailyCandles || [];
  if (daily.length === 0) return null;

  const L = daily.length;
  const windows = [5, 10, 15, 20];
  const structure = {};

  windows.forEach((N) => {
    if (L <= N) {
      structure[N + "D"] = {
        ret: null,
        high: null,
        low: null,
        rangePct: null,
        rangePos: null,
        drawdown: null,
        highAge: null,
        lowAge: null,
        swings: null,
        gapDowns: null,
      };
      return;
    }

    const startIdx = L - N;
    const slice = daily.slice(startIdx, L);
    const prevCloseVal = daily[startIdx - 1]
      ? daily[startIdx - 1][4]
      : slice[0][4];

    const closes = slice.map((c) => c[4]);
    const highs = slice.map((c) => c[2]);
    const lows = slice.map((c) => c[3]);

    const currentClose = closes[closes.length - 1];
    const startClose = prevCloseVal;

    const ret = ((currentClose - startClose) / startClose) * 100;
    const highVal = Math.max(...highs);
    const lowVal = Math.min(...lows);

    const rangePct = lowVal === 0 ? 0 : ((highVal - lowVal) / lowVal) * 100;

    let rangePos = 50;
    if (highVal !== lowVal) {
      rangePos = ((currentClose - lowVal) / (highVal - lowVal)) * 100;
    }

    const drawdown =
      highVal === 0 ? 0 : ((currentClose - highVal) / highVal) * 100;

    let hIdx = slice.length - 1;
    for (let j = slice.length - 1; j >= 0; j--) {
      if (slice[j][2] === highVal) {
        hIdx = j;
        break;
      }
    }
    const highAge = slice.length - 1 - hIdx;

    let lIdx = slice.length - 1;
    for (let j = slice.length - 1; j >= 0; j--) {
      if (slice[j][3] === lowVal) {
        lIdx = j;
        break;
      }
    }
    const lowAge = slice.length - 1 - lIdx;

    const swings = countSwings(slice, 2.0);

    let gapDowns = 0;
    for (let j = 0; j < slice.length; j++) {
      const prevClose = j === 0 ? prevCloseVal : slice[j - 1][4];
      const todayOpen = slice[j][1];
      if (prevClose > 0) {
        const gapPct = ((todayOpen - prevClose) / prevClose) * 100;
        if (gapPct <= -1.0) {
          gapDowns++;
        }
      }
    }

    structure[N + "D"] = {
      ret,
      high: highVal,
      low: lowVal,
      rangePct,
      rangePos,
      drawdown,
      highAge,
      lowAge,
      swings,
      gapDowns,
    };
  });

  s._structure = structure;
  return structure;
}

function countSwings(slice, thresholdPct = 2.0) {
  if (slice.length < 3) return 0;
  let count = 0;
  let lastPivotVal = slice[0][4];
  let dir = 0;

  for (let i = 1; i < slice.length; i++) {
    const high = slice[i][2];
    const low = slice[i][3];
    const close = slice[i][4];

    if (dir === 0) {
      const chg = ((close - lastPivotVal) / lastPivotVal) * 100;
      if (chg >= thresholdPct) {
        dir = 1;
        lastPivotVal = high;
      } else if (chg <= -thresholdPct) {
        dir = -1;
        lastPivotVal = low;
      }
    } else if (dir === 1) {
      if (high > lastPivotVal) {
        lastPivotVal = high;
      } else {
        const chg = ((low - lastPivotVal) / lastPivotVal) * 100;
        if (chg <= -thresholdPct) {
          count++;
          dir = -1;
          lastPivotVal = low;
        }
      }
    } else if (dir === -1) {
      if (low < lastPivotVal) {
        lastPivotVal = low;
      } else {
        const chg = ((high - lastPivotVal) / lastPivotVal) * 100;
        if (chg >= thresholdPct) {
          count++;
          dir = 1;
          lastPivotVal = high;
        }
      }
    }
  }
  return count;
}

// ── Charting Engine ───────────────────────────────────────────
function drawChart(sym, interval) {
  const container = $("chart-container-" + sym);
  if (!container) return;

  const s = allStocks.find((st) => st.symbol === sym);
  if (!s) return;

  const daily = s.dailyCandles || [];
  const candles =
    interval === "weekly"
      ? daily.length > 0
        ? daily.slice(-5)
        : s.weeklyCandles.slice(-5)
      : daily.length > 0
        ? daily.slice(-22)
        : s.weeklyCandles.slice(-22);

  if (!candles || candles.length === 0) {
    container.innerHTML =
      '<div style="color:var(--text-muted);font-size:0.75rem;padding:20px;text-align:center;">No chart data</div>';
    return;
  }

  const closes = candles.map((c) => c[4]);
  const dates = candles.map((c) => c[0]);

  // Base range scale on absolute high/low (wicks) and active overlay values to prevent overflow
  let min = Math.min(...candles.map((c) => c[3]));
  let max = Math.max(...candles.map((c) => c[2]));

  // Include Bollinger Bands in vertical bounds scale if active
  if (activeOverlays.bb && candles.length >= 5) {
    const period = Math.min(20, candles.length);
    for (let idx = 0; idx < candles.length; idx++) {
      const start = Math.max(0, idx - period + 1);
      const sub = candles.slice(start, idx + 1).map((c) => c[4]);
      const mean = sub.reduce((a, b) => a + b, 0) / sub.length;
      const variance =
        sub.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / sub.length;
      const stdDev = Math.sqrt(variance);
      const upper = mean + 2 * stdDev;
      const lower = mean - 2 * stdDev;
      if (lower < min) min = lower;
      if (upper > max) max = upper;
    }
  }

  // Include EMA-20 in scale if active
  if (activeOverlays.ema && candles.length > 0) {
    const k = 2 / (20 + 1);
    let ema = candles[0][4];
    if (ema < min) min = ema;
    if (ema > max) max = ema;
    for (let idx = 1; idx < candles.length; idx++) {
      ema = candles[idx][4] * k + ema * (1 - k);
      if (ema < min) min = ema;
      if (ema > max) max = ema;
    }
  }

  const range = max - min;
  const rangePadding = range === 0 ? 2 : range * 0.02; // 2% padding buffer
  const chartMin = min - rangePadding;
  const chartMax = max + rangePadding;
  const chartRange = chartMax - chartMin;

  // Read current container width and height dynamically to stretch plots fully
  const width = container.clientWidth || 360;
  const height = Math.max(container.clientHeight || 0, 142);

  // Padding for left-axis and right Y-axis legends column
  const leftPad = 16;
  const rightPad = 95; // 95px reserved on the right for spacious, crisp Y-axis labels without collision
  const xMin = leftPad + 12; // 12px margin on the left
  const xMax = width - rightPad - 24; // 24px margin on the right before y-axis labels

  // X mapping
  const getX = (idx) =>
    xMin + (idx / (candles.length - 1 || 1)) * (xMax - xMin);

  // Y mapping (using padded range with top clearance to prevent legend collision)
  const getY = (val) =>
    chartRange === 0
      ? height / 2
      : height - 38 - ((val - chartMin) / chartRange) * (height - 60); // 38px bottom clearance, 22px top clearance

  const points = closes.map((val, idx) => ({
    x: getX(idx),
    y: getY(val),
    val,
    date: dates[idx],
  }));

  const latestPt = points[points.length - 1];
  const firstPt = points[0];

  const fmtDate = (dStr) => {
    const d = new Date(dStr);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  // ── X-Axis Timeline Labels (All Candle Dates Labeling) ────────
  const L = candles.length;
  let labelsHtml = "";
  
  // Dynamic step: for <= 10 candles label every 1; for <= 25 label every 2; else step dynamically
  const labelStep = L <= 10 ? 1 : L <= 25 ? 2 : Math.ceil(L / 12);

  for (let j = 0; j < L; j += labelStep) {
    const cx = getX(j);
    const d = new Date(dates[j]);
    const day = d.getDate();
    const month = d.toLocaleDateString("en-IN", { month: "short" });

    // Show day number in clear 10.5px SF Mono
    labelsHtml += `<text x="${cx.toFixed(1)}" y="${height - 18}" font-size="10.5" font-weight="600" font-family="var(--font-mono)" fill="var(--text-secondary)" text-anchor="middle">${day}</text>`;

    // Show Month tag at start or month transitions
    let monthLabel = "";
    if (j === 0) {
      monthLabel = month;
    } else {
      const prevD = new Date(dates[j - 1]);
      if (d.getMonth() !== prevD.getMonth()) {
        monthLabel = month;
      }
    }

    if (monthLabel) {
      labelsHtml += `<text x="${cx.toFixed(1)}" y="${height - 4}" font-size="8.5" font-weight="700" fill="var(--text-primary)" text-anchor="middle">${monthLabel}</text>`;
    }
  }

  // Always explicitly label the last candle date on X-axis if missed by step
  if ((L - 1) % labelStep !== 0) {
    const lastIdx = L - 1;
    const cx = getX(lastIdx);
    const d = new Date(dates[lastIdx]);
    labelsHtml += `<text x="${cx.toFixed(1)}" y="${height - 16}" font-size="8" font-weight="600" fill="var(--text-muted)" text-anchor="middle">${d.getDate()}</text>`;
  }

  const isUp = closes[closes.length - 1] >= closes[0];
  const strokeColor = isUp ? "var(--ind-green)" : "var(--ind-red)";
  const gradStopColor = isUp ? "rgba(39,174,96,0.12)" : "rgba(235,87,87,0.12)";

  // ── Y-Axis Price Levels (5-Tier Grid Intervals: Max, 75%, Mid, 25%, Min) ──────
  const pMin = chartMin;
  const pMax = chartMax;
  const pRange = pMax - pMin;
  const yLevels = [
    pMax,
    pMin + pRange * 0.75,
    pMin + pRange * 0.50,
    pMin + pRange * 0.25,
    pMin
  ];

  let gridHtml = "";
  yLevels.forEach((priceVal) => {
    const yPos = getY(priceVal);
    gridHtml += `
      <line x1="${leftPad}" y1="${yPos.toFixed(1)}" x2="${width - rightPad + 10}" y2="${yPos.toFixed(1)}" stroke="var(--border-soft)" stroke-dasharray="2,3" opacity="0.5" />
      <text x="${width - rightPad + 20}" y="${(yPos + 4).toFixed(1)}" font-size="11" font-weight="600" font-family="var(--font-mono)" fill="var(--text-primary)" text-anchor="start">₹${fmtPrice(priceVal)}</text>
    `;
  });

  let chartContentHtml = "";
  if (activeChartType === "candle") {
    // Generate Candlestick Elements
    const candleWidth = Math.max(4, ((xMax - xMin) / candles.length) * 0.32);
    candles.forEach((cVal, idx) => {
      const open = cVal[1];
      const high = cVal[2];
      const low = cVal[3];
      const close = cVal[4];

      const cx = getX(idx);
      const cyOpen = getY(open);
      const cyHigh = getY(high);
      const cyLow = getY(low);
      const cyClose = getY(close);

      const color = close >= open ? "var(--ind-green)" : "var(--ind-red)";
      const top = Math.min(cyOpen, cyClose);
      const bottom = Math.max(cyOpen, cyClose);
      const rectHeight = Math.max(1.5, bottom - top);

      // Wick
      chartContentHtml += `<line x1="${cx.toFixed(1)}" y1="${cyHigh.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${cyLow.toFixed(1)}" stroke="${color}" stroke-width="1.5" />`;
      // Body
      chartContentHtml += `<rect x="${(cx - candleWidth / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${candleWidth.toFixed(1)}" height="${rectHeight.toFixed(1)}" fill="${color}" stroke="${color}" stroke-width="0.5" rx="1" />`;
    });
  } else {
    // Generate Line Path & Area fill Elements
    const pathData = points
      .map(
        (p, idx) =>
          `${idx === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
      )
      .join(" ");
    const areaPathData = `${pathData} L ${points[points.length - 1].x.toFixed(1)} ${height - 20} L ${points[0].x.toFixed(1)} ${height - 20} Z`;

    chartContentHtml = `
      <path d="${areaPathData}" fill="url(#grad-${sym})" />
      <path d="${pathData}" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    `;
  }

  // ── Overlay Calculations (Bollinger Bands, VWAP, EMA-20) ──────
  let overlaysHtml = "";

  // 1. Bollinger Bands (20, 2)
  if (activeOverlays.bb && candles.length >= 5) {
    const period = Math.min(20, candles.length);
    const upperPts = [];
    const lowerPts = [];
    const middlePts = [];

    for (let idx = 0; idx < candles.length; idx++) {
      const start = Math.max(0, idx - period + 1);
      const sub = candles.slice(start, idx + 1).map((c) => c[4]);
      const mean = sub.reduce((a, b) => a + b, 0) / sub.length;
      const variance =
        sub.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / sub.length;
      const stdDev = Math.sqrt(variance);
      const upper = mean + 2 * stdDev;
      const lower = mean - 2 * stdDev;

      const cx = getX(idx);
      upperPts.push({ x: cx, y: getY(upper) });
      lowerPts.push({ x: cx, y: getY(lower) });
      middlePts.push({ x: cx, y: getY(mean) });
    }

    const upperPath = upperPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const lowerPath = lowerPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const middlePath = middlePts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

    // Band shaded area
    const bandAreaPath = `${upperPath} ` + lowerPts.slice().reverse().map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";

    overlaysHtml += `
      <path d="${bandAreaPath}" fill="rgba(66, 133, 244, 0.08)" />
      <path d="${upperPath}" fill="none" stroke="#4285f4" stroke-width="1" stroke-dasharray="3,3" opacity="0.7" />
      <path d="${lowerPath}" fill="none" stroke="#4285f4" stroke-width="1" stroke-dasharray="3,3" opacity="0.7" />
      <path d="${middlePath}" fill="none" stroke="#4285f4" stroke-width="1.2" opacity="0.8" />
    `;
  }

  // 2. VWAP (Volume-Weighted Average Price)
  if (activeOverlays.vwap && candles.length > 0) {
    let cumTPV = 0;
    let cumVol = 0;
    const vwapPts = [];

    candles.forEach((cVal, idx) => {
      const high = cVal[2];
      const low = cVal[3];
      const close = cVal[4];
      const vol = cVal[5] || 1;
      const tp = (high + low + close) / 3;
      cumTPV += tp * vol;
      cumVol += vol;
      const vwap = cumVol > 0 ? cumTPV / cumVol : close;
      vwapPts.push({ x: getX(idx), y: getY(vwap) });
    });

    const vwapPath = vwapPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    overlaysHtml += `<path d="${vwapPath}" fill="none" stroke="#ff9800" stroke-width="1.8" stroke-dasharray="4,2" opacity="0.9" />`;
  }

  // 3. EMA (20-period Exponential Moving Average)
  if (activeOverlays.ema && candles.length > 0) {
    const k = 2 / (20 + 1);
    let ema = candles[0][4];
    const emaPts = [{ x: getX(0), y: getY(ema) }];

    for (let idx = 1; idx < candles.length; idx++) {
      const close = candles[idx][4];
      ema = close * k + ema * (1 - k);
      emaPts.push({ x: getX(idx), y: getY(ema) });
    }

    const emaPath = emaPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    overlaysHtml += `<path d="${emaPath}" fill="none" stroke="#9c27b0" stroke-width="2" opacity="0.95" />`;
  }

  const svgId = `svg-${sym}`;
  const svgHtml = `
    <svg id="${svgId}" width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow:visible; cursor:crosshair; user-select:none; display:block;">
      <defs>
        <linearGradient id="grad-${sym}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${gradStopColor}" />
          <stop offset="100%" stop-color="transparent" />
        </linearGradient>
      </defs>
      
      <!-- Backdrop Grid & Y-Axis Legends -->
      ${gridHtml}

      <!-- Technical Indicator Overlays (BB, VWAP, EMA) -->
      ${overlaysHtml}

      <!-- Chart Content (Candles or Line) -->
      ${chartContentHtml}
      
      <!-- Timeline labels -->
      ${labelsHtml}
      
      <!-- Hairline guide & Intersect dot (hidden by default) -->
      <line id="hairline-${sym}" x1="0" y1="0" x2="0" y2="${height - 28}" stroke="var(--accent)" stroke-width="1" stroke-dasharray="2,2" style="display:none;" />
      <circle id="hover-dot-${sym}" cx="0" cy="0" r="4.5" fill="${strokeColor}" stroke="#fff" stroke-width="1.5" style="display:none; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.15));" />
      
      <!-- Latest Price tag dot -->
      <circle id="latest-dot-${sym}" cx="${latestPt.x}" cy="${latestPt.y}" r="3.5" fill="${strokeColor}" />
    </svg>
  `;

  // Calculate dynamic overall timeframe percentage returns
  const overallChg = ((latestPt.val - firstPt.val) / firstPt.val) * 100;
  const overallColor = overallChg >= 0 ? "var(--ind-green)" : "var(--ind-red)";
  const overallSign = overallChg >= 0 ? "+" : "";
  const periodLabel = interval === "weekly" ? "1 Week" : "1 Month";

  const infoEl = $(`chart-info-${sym}`);
  if (infoEl) {
    infoEl.innerHTML = `
      ₹${fmtPrice(latestPt.val)}
      <span style="color:${overallColor}; font-size:0.7rem; margin-left:4px; font-weight:600;">
        ${overallSign}${fmt(overallChg)}% <span style="font-weight:400;color:var(--text-muted);font-size:0.65rem;">(${periodLabel})</span>
      </span>
    `;
  }

  const boundsEl = $(`chart-bounds-${sym}`);
  if (boundsEl) {
    boundsEl.innerHTML = `
      <span style="font-weight:500;">High:</span> ₹${fmtPrice(max)} &nbsp;•&nbsp; 
      <span style="font-weight:500;">Low:</span> ₹${fmtPrice(min)}
    `;
  }

  container.innerHTML = svgHtml;

  // Interactive mouse handlers!
  const svgEl = $(svgId);
  const hairline = $(`hairline-${sym}`);
  const hoverDot = $(`hover-dot-${sym}`);
  const latestDot = $(`latest-dot-${sym}`);

  if (!svgEl || !hairline || !hoverDot || !infoEl) return;

  const defaultInfo = infoEl.innerHTML;

  svgEl.addEventListener("mousemove", (e) => {
    const rect = svgEl.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    // Scale X to points index
    const pct = (mouseX - xMin) / (xMax - xMin);

    let idx = Math.round(pct * (candles.length - 1));
    if (idx < 0) idx = 0;
    if (idx >= candles.length) idx = candles.length - 1;

    const cVal = candles[idx];
    const open = cVal[1];
    const high = cVal[2];
    const low = cVal[3];
    const close = cVal[4];

    const cx = getX(idx);
    const cy = getY(close);

    // Show hairline and hover dot
    hairline.setAttribute("x1", cx);
    hairline.setAttribute("x2", cx);
    hairline.style.display = "";

    hoverDot.setAttribute("cx", cx);
    hoverDot.setAttribute("cy", cy);
    hoverDot.style.display = "";

    if (latestDot) latestDot.style.display = "none";

    // Format OHLC layout on hover
    const isUpCandle = close >= open;
    const candleColor = isUpCandle ? "var(--ind-green)" : "var(--ind-red)";
    const changePct = ((close - open) / open) * 100;
    const sign = changePct > 0 ? "+" : "";

    // Gap comparison
    let gapStr = "";
    if (idx > 0) {
      const prevCl = candles[idx - 1][4];
      const gapPct = ((open - prevCl) / prevCl) * 100;
      if (Math.abs(gapPct) > 0.01) {
        const gapClr = gapPct > 0 ? "var(--ind-green)" : "var(--ind-red)";
        const gapSign = gapPct > 0 ? "+" : "";
        gapStr = ` &nbsp;•&nbsp; <span style="color:var(--text-muted);">Gap:</span> <span style="color:${gapClr};font-weight:600;">${gapSign}${fmt(gapPct)}%</span>`;
      }
    }

    infoEl.innerHTML = `
      <div style="font-size:0.7rem; color:var(--text-secondary); font-weight:500; display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
        <span style="color:var(--text-primary); font-weight:700; margin-right:4px;">${new Date(cVal[0]).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
        <span>O: <strong style="color:var(--text-primary)">₹${fmtPrice(open)}</strong></span>
        <span>H: <strong style="color:var(--text-primary)">₹${fmtPrice(high)}</strong></span>
        <span>L: <strong style="color:var(--text-primary)">₹${fmtPrice(low)}</strong></span>
        <span>C: <strong style="color:${candleColor}">₹${fmtPrice(close)}</strong> <span style="font-size:0.65rem; color:${candleColor}; font-weight:600;">(${sign}${fmt(changePct)}%)</span></span>
        ${gapStr}
      </div>
    `;
  });

  svgEl.addEventListener("mouseleave", () => {
    // Hide guide lines
    hairline.style.display = "none";
    hoverDot.style.display = "none";
    if (latestDot) latestDot.style.display = "";

    // Reset to default info
    infoEl.innerHTML = defaultInfo;
  });
}

let activeChartInterval = "weekly";

window.changeChartInterval = function (sym, interval, event) {
  if (event) {
    event.stopPropagation();
    const container = event.target.closest(".chart-tf-tabs");
    if (container) {
      container
        .querySelectorAll(".chart-tab-link")
        .forEach((btn) => btn.classList.remove("active"));
      event.target.classList.add("active");
    }
  }
  activeChartInterval = interval;
  drawChart(sym, interval);
};

window.changeChartType = function (sym, type, event) {
  if (event) {
    event.stopPropagation();
    const container = event.target.closest(".chart-type-tabs");
    if (container) {
      container
        .querySelectorAll(".chart-tab-link")
        .forEach((btn) => btn.classList.remove("active"));
      event.target.classList.add("active");
    }
  }
  activeChartType = type;
  drawChart(sym, activeChartInterval);
};

// Redraw chart on window resize to ensure correct width
window.addEventListener(
  "resize",
  debounce(() => {
    if (expandedSym) {
      drawChart(expandedSym, activeChartInterval);
    }
  }, 200),
);

init();
