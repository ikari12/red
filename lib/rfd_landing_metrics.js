// 2D landing kinematics for the RFD Landing Analyzer.
// Mirrors analysis/core/rfd_landing.py — kinematic screen, not force-plate RFD.

export const MUNRO_SEM_DEG = 3.0;
export const MUNRO_SDD_DEG = 8.0;
export const DEFAULT_DEEP_WINDOW_S = 0.40;
export const DEFAULT_MIN_VISIBILITY = 0.50;
export const DEFAULT_MIN_LANDING_GAP_S = 0.35;
export const DEFAULT_FLIGHT_LOOKBACK_S = 0.60;
export const ANALYSIS_FPS_CAP = 30;

export const LM = {
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_HIP: 23, R_HIP: 24,
  L_KNEE: 25, R_KNEE: 26,
  L_ANKLE: 27, R_ANKLE: 28,
};

const SIDE_IDX = {
  L: [LM.L_HIP, LM.L_KNEE, LM.L_ANKLE],
  R: [LM.R_HIP, LM.R_KNEE, LM.R_ANKLE],
};

function xyv(pt) {
  return { x: pt.x, y: pt.y, v: pt.visibility ?? 1 };
}

export function fppaDeg(hip, knee, ankle, midX, aspect = 1.0, minVis = DEFAULT_MIN_VISIBILITY) {
  const h = xyv(hip), k = xyv(knee), a = xyv(ankle);
  if (Math.min(h.v, k.v, a.v) < minVis) return null;

  const hx = h.x * aspect, hy = h.y;
  const kx = k.x * aspect, ky = k.y;
  const ax = a.x * aspect, ay = a.y;
  const mid = midX * aspect;

  const vProx = [hx - kx, hy - ky];
  const vDist = [ax - kx, ay - ky];
  const n1 = Math.hypot(vProx[0], vProx[1]);
  const n2 = Math.hypot(vDist[0], vDist[1]);
  if (n1 < 1e-6 || n2 < 1e-6) return null;
  const cosA = Math.max(-1, Math.min(1, (vProx[0] * vDist[0] + vProx[1] * vDist[1]) / (n1 * n2)));
  const magnitude = 180 - Math.acos(cosA) * 180 / Math.PI;

  const dx = ax - hx, dy = ay - hy;
  const seg2 = dx * dx + dy * dy;
  if (seg2 < 1e-12) return null;
  const t = ((kx - hx) * dx + (ky - hy) * dy) / seg2;
  const expectedX = hx + t * dx;
  const sign = Math.abs(kx - mid) <= Math.abs(expectedX - mid) ? 1 : -1;
  return sign * magnitude;
}

export function fppaFromLandmarks(lm, side, aspect = 1.0, minVis = DEFAULT_MIN_VISIBILITY) {
  const [hi, kn, an] = SIDE_IDX[side];
  const midX = (lm[LM.L_HIP].x + lm[LM.R_HIP].x) / 2;
  return fppaDeg(lm[hi], lm[kn], lm[an], midX, aspect, minVis);
}

export function movingAvg(values, halfWindow) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - halfWindow); j <= Math.min(values.length - 1, i + halfWindow); j++) {
      s += values[j]; c++;
    }
    out.push(s / c);
  }
  return out;
}

export function detectLandings(footY, fps, sensitivity = 50) {
  if (fps <= 0 || footY.length < 5) return [];
  const smoothed = movingAvg(footY, 2);
  const amp = Math.max(...smoothed) - Math.min(...smoothed);
  if (amp < 0.005) return [];

  const threshMult = 0.25 - (sensitivity / 100) * 0.20;
  const dropThresh = amp * threshMult;
  const minHeight = Math.min(...smoothed) + amp * 0.25;
  const minGap = Math.max(1, Math.floor(fps * DEFAULT_MIN_LANDING_GAP_S));
  const lookback = Math.max(2, Math.floor(fps * DEFAULT_FLIGHT_LOOKBACK_S));
  const vEps = Math.max(0.15, amp * 0.8);

  const landings = [];
  for (let i = 1; i < smoothed.length; i++) {
    const velPrev = i >= 2 ? (smoothed[i - 1] - smoothed[i - 2]) * fps : 0;
    const vel = (smoothed[i] - smoothed[i - 1]) * fps;
    if (!(velPrev > vEps && vel <= vEps && smoothed[i] > minHeight)) continue;
    const windowStart = Math.max(0, i - lookback);
    const localMin = Math.min(...smoothed.slice(windowStart, i));
    if (smoothed[i] - localMin <= dropThresh) continue;
    if (landings.length && i - landings[landings.length - 1] <= minGap) continue;
    landings.push(i);
  }
  return landings;
}

export function deepestFrame(hipY, landingFrame, fps, windowS = DEFAULT_DEEP_WINDOW_S) {
  if (fps <= 0) return null;
  const end = Math.min(hipY.length, landingFrame + Math.max(1, Math.round(fps * windowS)) + 1);
  let bestI = null, bestY = -1e9;
  for (let i = landingFrame; i < end; i++) {
    const y = hipY[i];
    if (y == null) continue;
    if (y > bestY) { bestY = y; bestI = i; }
  }
  return bestI;
}

export function landingDeltaFppa(fppa, hipY, landingFrame, fps, windowS = DEFAULT_DEEP_WINDOW_S) {
  if (landingFrame < 0 || landingFrame >= fppa.length) return null;
  const ic = fppa[landingFrame];
  if (ic == null) return null;
  const deepI = deepestFrame(hipY, landingFrame, fps, windowS);
  if (deepI == null || fppa[deepI] == null) return null;
  return {
    icFppa: ic,
    deepFppa: fppa[deepI],
    deltaFppa: fppa[deepI] - ic,
    deepFrame: deepI,
    timeToDeepS: (deepI - landingFrame) / fps,
  };
}

function finite(values) {
  return values.filter(v => v != null && Number.isFinite(v));
}

export function median(values) {
  const xs = [...values].sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

export function iqr(values) {
  const xs = [...values].sort((a, b) => a - b);
  if (xs.length < 2) return null;
  const q = p => {
    const pos = p * (xs.length - 1);
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    if (lo === hi) return xs[lo];
    const t = pos - lo;
    return xs[lo] * (1 - t) + xs[hi] * t;
  };
  return q(0.75) - q(0.25);
}

export function rejectIqrOutliers(values) {
  const xs = finite(values);
  if (xs.length < 4) return xs;
  const m = median(xs);
  const spread = iqr(xs);
  if (m == null || spread == null || spread <= 1e-9) return xs;
  const lo = m - 1.5 * spread, hi = m + 1.5 * spread;
  return xs.filter(v => v >= lo && v <= hi);
}

export function summarizeDeltas(deltas) {
  const kept = rejectIqrOutliers(deltas);
  return {
    nRaw: finite(deltas).length,
    n: kept.length,
    median: median(kept),
    iqr: kept.length >= 2 ? iqr(kept) : (kept.length === 1 ? 0 : null),
    mean: kept.length ? kept.reduce((s, v) => s + v, 0) / kept.length : null,
  };
}

export function lateralityDeg(leftMedian, rightMedian) {
  if (leftMedian == null || rightMedian == null) return null;
  const diff = leftMedian - rightMedian;
  return {
    lMinusR: diff,
    absDiff: Math.abs(diff),
    exceedsSdd: Math.abs(diff) >= MUNRO_SDD_DEG,
    sddDeg: MUNRO_SDD_DEG,
    semDeg: MUNRO_SEM_DEG,
  };
}

export function frontalFacing(lm, minVis = DEFAULT_MIN_VISIBILITY) {
  const ls = xyv(lm[LM.L_SHOULDER]), rs = xyv(lm[LM.R_SHOULDER]);
  const lh = xyv(lm[LM.L_HIP]), rh = xyv(lm[LM.R_HIP]);
  const visOk = Math.min(ls.v, rs.v, lh.v, rh.v) >= minVis;
  const shoulderW = Math.abs(ls.x - rs.x);
  const hipW = Math.abs(lh.x - rh.x);
  const shoulderDy = Math.abs(ls.y - rs.y);
  const mirroredOrBack = lh.x < rh.x;
  const wideEnough = shoulderW >= 0.08 && hipW >= 0.05;
  const level = shoulderW < 1e-6 || (shoulderDy / shoulderW) <= 0.35;
  return {
    ok: visOk && wideEnough && level,
    mirroredOrBack,
    shoulderWidth: shoulderW,
    hipWidth: hipW,
  };
}

export function analysisFps(videoFps, cap = ANALYSIS_FPS_CAP) {
  if (videoFps == null || videoFps <= 0) return cap;
  return videoFps >= 24 ? Math.max(24, Math.min(videoFps, cap)) : videoFps;
}

export function qualityReport({ fps, nLandings, visibilityMean, frontalOk, nKept }) {
  const flags = [];
  if (fps < 24) flags.push("low_fps");
  if (nLandings < 1) flags.push("no_landing");
  else if (nLandings < 2) flags.push("few_landings");
  if (visibilityMean == null || visibilityMean < 0.50) flags.push("low_visibility");
  if (!frontalOk) flags.push("not_frontal");
  if (nKept < 1) flags.push("no_valid_fppa");

  let level;
  if (!flags.length) level = "high";
  else if (flags.includes("no_landing") || flags.includes("no_valid_fppa")) level = "low";
  else if (flags.length === 1 && (flags[0] === "few_landings" || flags[0] === "low_fps")) level = "medium";
  else if (flags.length >= 3) level = "low";
  else level = "medium";
  return { level, flags, semDeg: MUNRO_SEM_DEG, sddDeg: MUNRO_SDD_DEG };
}

export function meanVisibility(lm) {
  const ids = [LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE];
  let s = 0, c = 0;
  for (const i of ids) {
    if (!lm[i]) continue;
    s += lm[i].visibility ?? 0;
    c++;
  }
  return c ? s / c : null;
}

export function hipY(lm) {
  const l = lm[LM.L_HIP], r = lm[LM.R_HIP];
  if ((l.visibility ?? 0) < 0.3 && (r.visibility ?? 0) < 0.3) return null;
  return ((l.y ?? 0) + (r.y ?? 0)) / 2;
}

export function footY(lm, side) {
  const ankle = lm[side === "L" ? LM.L_ANKLE : LM.R_ANKLE];
  if ((ankle.visibility ?? 0) >= 0.2) return ankle.y;
  const knee = lm[side === "L" ? LM.L_KNEE : LM.R_KNEE];
  if ((knee.visibility ?? 0) >= 0.3) return knee.y;
  return null;
}
