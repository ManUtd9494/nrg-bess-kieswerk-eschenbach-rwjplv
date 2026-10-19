// NRG Solution BESS Kieswerk Eschenbach - Rechenkern
// Standortbewertung, Layout, Abstände, Lärm, NISV, Energiefluss-Simulation.
// Reines JavaScript ohne Abhängigkeiten (Browser und Node).
// Lokale Koordinaten: x = E - 2666300, z = 1220550 - N (Süden positiv), y = H - 476.

export const VERSION = '1.0.0';

export const DEFAULTS = {
  unit: { L: 6.058, W: 2.438, H: 2.896, kWh: 5016, usable: 0.92, kW: 2500, name: 'DC-Batteriecontainer 20 ft HC (ca. 5 MWh)' },
  skid: { L: 6.058, W: 2.438, H: 2.9, name: 'MS-Power-Skid (PCS, Trafo, MS-Schaltanlage)' },
  nUnits: 1,
  layout: {
    backGap: 1.0,      // Abstand Rückseite zur Zonengrenze / Hangfuss (m)
    endGap: 3.0,       // Abstand zwischen Containern an den Stirnseiten (m, Herstellerangabe Brandausbreitung)
    doorClear: 1.5,    // Türschwenkbereich vor der Längsseite (m)
    laneMin: 3.5,      // Mindestbreite Fahrgasse / Feuerwehrzufahrt (m)
    fireBldg: 5.0,     // Abstand zu Gebäuden ohne Brandschutzwand (m)
    fenceOff: 1.0,     // Zaun um die Anlage (m)
    padMargin: 0.8,    // Kiesbett / Fundamentplatte über die Container hinaus (m)
  },
  rules: {
    wald: 20, waldMin: 10,          // § 136 PBG LU; Ausnahme bis 10 m für übrige Bauten und Anlagen (§ 43 PBV)
    roadClear: 1.0,                 // Freihaltebereich neben Fahrwegen (m)
    cableOk: 150, cableWarn: 300,   // MS-Kabellänge zur Trafostation (m)
    nisv: 1.0,                      // Anlagegrenzwert 1 µT an OMEN
    pw: { II: [55, 45], III: [60, 50], IV: [65, 55] },  // Planungswerte LSV Anhang 6 (Tag/Nacht)
  },
  noise: {
    // A-bewertete Schallleistungspegel (Annahmen, Herstellerangaben einholen)
    unit_day: 78, unit_night: 70,   // Kühlaggregat Container (Volllast / Nachtmodus)
    pcs_day: 80, pcs_night: 71,     // Wechselrichter-Skid (Lüfter)
    trafo: 66,                      // Trafo 2.75 MVA
    srcH: 2.4, K1: 5, K2_day: 2, K2_night: 4, K3: 0,
  },
  ops: {
    season: 'summer', day: 'werktag', scenario: 'normal',
    target_kW: 450, nightCharge_kW: 250, nightLimit_kW: 900, socMin: 0.08, socMax: 0.95, cloud: 0.1,
    p2h_kW: 300,
  },
  site: { pv_kWp: 268.8, load_peak: 820 },
};

// ---------------------------------------------------------------- Geometrie
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], add = (a, b) => [a[0] + b[0], a[1] + b[1]], mul = (a, s) => [a[0] * s, a[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1], len = (a) => Math.hypot(a[0], a[1]), norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
export const G = { sub, add, mul, dot, len, norm };
export function area(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
export function centroid(p) { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; }
export function pip(pt, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
export function segDist(p, a, b) { const ab = sub(b, a); const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1))); const q = add(a, mul(ab, t)); return [len(sub(p, q)), q]; }
export function lineDist(p, line, closed = false) { let best = [Infinity, null]; const n = line.length; for (let i = 0; i < (closed ? n : n - 1); i++) { const r = segDist(p, line[i], line[(i + 1) % n]); if (r[0] < best[0]) best = r; } return best; }
function segInter(a, b, c, d) { const r = sub(b, a), s = sub(d, c); const den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-12) return false; const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den; return t >= 0 && t <= 1 && u >= 0 && u <= 1; }
// Minimaldistanz Polygon/Polylinie zu Polygon/Polylinie: [d, pA, pB]
export function minDist(A, B, closedA = true, closedB = true) {
  let best = [Infinity, null, null];
  const nA = A.length, nB = B.length;
  for (let i = 0; i < nA; i++) { const r = lineDist(A[i], B, closedB); if (r[0] < best[0]) best = [r[0], A[i], r[1]]; }
  for (let j = 0; j < nB; j++) { const r = lineDist(B[j], A, closedA); if (r[0] < best[0]) best = [r[0], r[1], B[j]]; }
  for (let i = 0; i < (closedA ? nA : nA - 1); i++) for (let j = 0; j < (closedB ? nB : nB - 1); j++) if (segInter(A[i], A[(i + 1) % nA], B[j], B[(j + 1) % nB])) return [0, A[i], A[i]];
  if (closedB && pip(A[0], B)) return [0, A[0], A[0]];
  if (closedA && pip(B[0], A)) return [0, B[0], B[0]];
  return best;
}
export function rectPoly(c, L, W, ang) { const u = [Math.cos(ang), Math.sin(ang)], v = [-u[1], u[0]]; const hl = L / 2, hw = W / 2; return [add(add(c, mul(u, -hl)), mul(v, -hw)), add(add(c, mul(u, hl)), mul(v, -hw)), add(add(c, mul(u, hl)), mul(v, hw)), add(add(c, mul(u, -hl)), mul(v, hw))]; }
export function polyLen(p) { let s = 0; for (let i = 1; i < p.length; i++) s += len(sub(p[i], p[i - 1])); return s; }
function offsetPoly(poly, d) { // einfache Parallelverschiebung (konvexe Rechtecke, Ausdehnung > 0)
  const c = centroid(poly); return poly.map(p => { const v = sub(p, c); const l = len(v); return add(c, mul(v, (l + d * 1.41421) / l)); }); }
function bufferRect(poly, d) { // Rechteck (4 Punkte) gleichmässig um d vergrössern
  const u = norm(sub(poly[1], poly[0])), v = norm(sub(poly[3], poly[0])); return [add(add(poly[0], mul(u, -d)), mul(v, -d)), add(add(poly[1], mul(u, d)), mul(v, -d)), add(add(poly[2], mul(u, d)), mul(v, d)), add(add(poly[3], mul(u, -d)), mul(v, d))]; }

// ---------------------------------------------------------------- Höhen
export function makeHeight(meta, u16) { const n = meta.n, st = meta.step, x0 = meta.x0, z0 = meta.z0, hmin = meta.hmin;
  return (x, z) => { let c = (x - x0) / st, r = (z - z0) / st; c = Math.max(0, Math.min(n - 1.001, c)); r = Math.max(0, Math.min(n - 1.001, r)); const c0 = c | 0, r0 = r | 0, fc = c - c0, fr = r - r0; const g = (rr, cc) => u16[rr * n + cc] / 100 + hmin - 476;
    return g(r0, c0) * (1 - fr) * (1 - fc) + g(r0, c0 + 1) * (1 - fr) * fc + g(r0 + 1, c0) * fr * (1 - fc) + g(r0 + 1, c0 + 1) * fr * fc; }; }

// ---------------------------------------------------------------- Layout
// Ordnet n Container und einen MS-Skid in einer Reihe entlang der Rücklinie an.
export function computeLayout(site, cand, P, heightAt = () => 0) {
  const Lp = P.layout, U = P.unit, S = P.skid;
  let back = cand.back, startOff = cand.startOff ?? 2.0;
  if (!back) { // längste Kante des Polygons als Rücklinie
    let bi = 0, bl = 0; for (let i = 0; i < cand.poly.length; i++) { const l = len(sub(cand.poly[(i + 1) % cand.poly.length], cand.poly[i])); if (l > bl) { bl = l; bi = i; } }
    back = [cand.poly[bi], cand.poly[(bi + 1) % cand.poly.length]];
  }
  // Einheiten: Container 1, Skid, Container 2..n (Skid in der Mitte kurzer Kabelwege)
  const seq = []; for (let i = 0; i < P.nUnits; i++) seq.push({ type: 'battery', L: U.L, W: U.W, H: U.H, id: `BESS-${i + 1}` });
  seq.splice(P.skidFirst ? 0 : 1, 0, { type: 'skid', L: S.L, W: S.W, H: S.H, id: 'MVS-1' });
  const units = []; let s = startOff; const bl = polyLen(back);
  // Punkt und Richtung entlang der Rücklinie bei Bogenlänge t
  const at = (t) => { let acc = 0; for (let i = 1; i < back.length; i++) { const l = len(sub(back[i], back[i - 1])); if (acc + l >= t || i === back.length - 1) { const f = Math.max(0, Math.min(1, (t - acc) / l)); return { p: add(back[i - 1], mul(sub(back[i], back[i - 1]), f)), d: norm(sub(back[i], back[i - 1])) }; } acc += l; } };
  // Innenseite bestimmen: Normale zeigt zum Polygon-Schwerpunkt
  const cc = centroid(cand.poly);
  let fits = true;
  for (const u of seq) {
    const a = at(s + u.L / 2); let nrm = [-a.d[1], a.d[0]]; if (dot(sub(cc, a.p), nrm) < 0) nrm = mul(nrm, -1);
    // Richtung als Mittel über die Einheitslänge (Knick der Rücklinie)
    const a0 = at(s), a1 = at(s + u.L); const dir = norm(sub(a1.p, a0.p));
    let n2 = [-dir[1], dir[0]]; if (dot(n2, nrm) < 0) n2 = mul(n2, -1);
    // Rückseite parallel zur Rücklinie, Abstand backGap von beiden Endpunkten (max. Einrückung)
    const mid = mul(add(a0.p, a1.p), 0.5);
    let depth = Lp.backGap + u.W / 2; for (const t of [s, s + u.L / 2, s + u.L]) { const q = at(t).p; const proj = dot(sub(q, mid), n2); depth = Math.max(depth, Lp.backGap + u.W / 2 + proj); }
    const c = add(mid, mul(n2, depth));
    const ang = Math.atan2(dir[1], dir[0]);
    const poly = rectPoly(c, u.L, u.W, ang);
    const inside = poly.every(p => pip(p, cand.poly));
    if (!inside || s + u.L > bl + 0.5) fits = false;
    units.push({ ...u, c, ang, poly, front: n2, y0: Math.max(...poly.map(p => heightAt(p[0], p[1]))), inside });
    s += u.L + Lp.endGap;
  }
  const allPts = units.flatMap(u => u.poly);
  // Kiesbett / Fundament als Hülle der Einheiten + Rand
  const dir = [Math.cos(units[0].ang), Math.sin(units[0].ang)], nv = units[0].front;
  const proj = allPts.map(p => [dot(p, dir), dot(p, nv)]);
  const umin = Math.min(...proj.map(q => q[0])) - Lp.padMargin, umax = Math.max(...proj.map(q => q[0])) + Lp.padMargin;
  const vmin = Math.min(...proj.map(q => q[1])) - Lp.padMargin, vmax = Math.max(...proj.map(q => q[1])) + Lp.padMargin + Lp.doorClear * 0.6;
  const P2 = (u, v) => add(mul(dir, u), mul(nv, v));
  const pad = [P2(umin, vmin), P2(umax, vmin), P2(umax, vmax), P2(umin, vmax)];
  const vf = vmax + 0.2;   // Zaun auf der Fahrgassenseite direkt hinter dem Türschwenkbereich
  const fence = [P2(umin - Lp.fenceOff + 0.6, vmin - 0.3), P2(umax + Lp.fenceOff - 0.6, vmin - 0.3), P2(umax + Lp.fenceOff - 0.6, vf), P2(umin - Lp.fenceOff + 0.6, vf)];
  const gate = { a: P2((umin + umax) / 2 - 2.0, vf), b: P2((umin + umax) / 2 + 2.0, vf) };
  // Anprallschutz: Poller 0.5 m vor dem Zaun entlang der Fahrgasse
  const bollards = []; const ub0 = umin - Lp.fenceOff + 0.6, ub1 = umax + Lp.fenceOff - 0.6; const nb = Math.max(2, Math.round((ub1 - ub0) / 1.6)); for (let i = 0; i <= nb; i++) bollards.push(P2(ub0 + (ub1 - ub0) * i / nb, vf + 0.5));
  const outline = [...fence.slice(0, 2), P2(ub1, vf + 0.65), P2(ub0, vf + 0.65)];
  const ybase = Math.max(...pad.map(p => heightAt(p[0], p[1])), ...units.map(u => u.y0)) + 0.15;
  return { cand: cand.id, units, pad, fence, gate, bollards, outline, dir, nv, ybase, fits, E_kWh: P.nUnits * U.kWh, P_kW: P.nUnits * U.kW, usable_kWh: P.nUnits * U.kWh * U.usable };
}

// ---------------------------------------------------------------- Kabelweg (Dijkstra über Fahrwege)
export function cableRoute(site, from, to) {
  const nodes = [], edges = new Map(); const key = (i) => { if (!edges.has(i)) edges.set(i, []); return edges.get(i); };
  const addNode = (p) => { nodes.push(p); return nodes.length - 1; };
  const link = (a, b) => { const d = len(sub(nodes[a], nodes[b])); key(a).push([b, d]); key(b).push([a, d]); };
  const roadIdx = [];
  for (const r of site.roads) { const ids = r.pts.map(addNode); for (let i = 1; i < ids.length; i++) link(ids[i - 1], ids[i]); roadIdx.push(ids); }
  // Verbindungen zwischen Strassen (Knoten < 14 m)
  for (let a = 0; a < roadIdx.length; a++) for (let b = a + 1; b < roadIdx.length; b++) for (const i of roadIdx[a]) for (const j of roadIdx[b]) if (len(sub(nodes[i], nodes[j])) < 14) link(i, j);
  const s = addNode(from), t = addNode(to);
  const near = (k, n) => nodes.map((p, i) => [i, len(sub(p, nodes[k]))]).filter(q => q[0] !== s && q[0] !== t).sort((a, b) => a[1] - b[1]).slice(0, n);
  for (const [i] of near(s, 3)) link(s, i); for (const [i] of near(t, 3)) link(t, i);
  const dist = new Array(nodes.length).fill(Infinity), prev = new Array(nodes.length).fill(-1), done = new Array(nodes.length).fill(false); dist[s] = 0;
  for (;;) { let u = -1, best = Infinity; for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; } if (u < 0 || u === t) break; done[u] = true; for (const [v, d] of key(u)) if (dist[u] + d < dist[v]) { dist[v] = dist[u] + d; prev[v] = u; } }
  const path = []; for (let u = t; u >= 0; u = prev[u]) path.unshift(nodes[u]);
  return { pts: path, len: dist[t] };
}

// ---------------------------------------------------------------- Lärm (vereinfachtes Verfahren in Anlehnung an ISO 9613-2)
export function noiseSources(layout, P, mode) {
  const N = P.noise, src = [];
  for (const u of layout.units) {
    const dir = [Math.cos(u.ang), Math.sin(u.ang)];
    if (u.type === 'battery') { // Kühlaggregat an der Stirnseite
      const p = add(u.c, mul(dir, u.L / 2 + 0.3)); src.push({ p, y: layout.ybase + N.srcH, Lw: mode === 'night' ? N.unit_night : N.unit_day, id: u.id + ' Kühlung', tonal: false });
    } else { src.push({ p: u.c, y: layout.ybase + N.srcH, Lw: mode === 'night' ? N.pcs_night : N.pcs_day, id: 'Wechselrichter', tonal: true }); src.push({ p: add(u.c, mul(dir, u.L * 0.3)), y: layout.ybase + 1.8, Lw: N.trafo, id: 'Trafo', tonal: true }); }
  }
  return src;
}
function screening(s, sy, r, ry, heightAt) { // Einfachbeugung am höchsten Geländehindernis
  const d = len(sub(r, s)); let best = 0; const n = Math.max(8, Math.ceil(d / 1.5));
  for (let i = 1; i < n; i++) { const f = i / n; const p = add(s, mul(sub(r, s), f)); const ground = heightAt(p[0], p[1]); const line = sy + (ry - sy) * f; const h = ground - line; if (h > 0) { const ds = d * f, dr = d * (1 - f); const z = Math.hypot(ds, h) + Math.hypot(dr, h) - d; if (z > best) best = z; } }
  return best > 0 ? Math.min(20, 10 * Math.log10(3 + 29.4 * best)) : 0;
}
export function noiseAt(rp, ry, layout, P, mode, heightAt) {
  let sum = 0, tonal = false; const parts = [];
  for (const s of noiseSources(layout, P, mode)) {
    const d3 = Math.hypot(rp[0] - s.p[0], rp[1] - s.p[1], ry - s.y);
    const A = 20 * Math.log10(Math.max(d3, 1)) + 11 - 3 + 0.005 * d3 + screening(s.p, s.y, rp, ry, heightAt);
    const L = s.Lw - A; sum += 10 ** (L / 10); parts.push({ id: s.id, L }); if (s.tonal && L > -10) tonal = true;
  }
  const Leq = 10 * Math.log10(sum || 1e-9); const N = P.noise;
  const K2 = mode === 'night' ? N.K2_night : N.K2_day;
  return { Leq, Lr: Leq + N.K1 + K2 + N.K3, parts };
}
export function noiseGrid(layout, P, mode, heightAt, opts = {}) {
  const step = opts.step || 4, x0 = opts.x0 ?? -40, z0 = opts.z0 ?? -110, nx = opts.nx || 60, nz = opts.nz || 60; const v = new Float32Array(nx * nz);
  const quick = { ...P }; // ohne Gelände-Abschirmung für die Fläche schneller
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = x0 + i * step, z = z0 + j * step; const y = heightAt(x, z) + 1.5; v[j * nx + i] = noiseAt([x, z], y, layout, quick, mode, opts.screen ? heightAt : () => -999).Lr; }
  return { x0, z0, step, nx, nz, v };
}

// ---------------------------------------------------------------- NISV (Magnetfeld 50 Hz, Linienleiter-Näherung)
export function nisvRadius(layout, P) {
  // Konservativ: Niederspannungs-Sammelschiene Wechselrichter/Trafo, I = S / (sqrt3 * U), Leiterabstand 0.15 m
  const S = layout.P_kW * 1.1e3, U = 690, I = S / (Math.sqrt(3) * U), a = 0.10;
  // Dreileiter-Feld B ≈ mu0 * I * a * sqrt(3) / (2 pi r^2) -> Radius für 1 µT
  const mu0 = 4e-7 * Math.PI; const r = Math.sqrt(mu0 * I * a * Math.sqrt(3) / (2 * Math.PI * 1e-6));
  return { I, r1uT: r, note: 'Linienleiter-Näherung NS-Sammelschiene, Volllast' };
}

// ---------------------------------------------------------------- Prüfung und Bewertung je Kandidat
const ST = { ok: 0, warn: 1, fail: 2 };
export function evaluate(site, cand, P, heightAt = () => 0, dtmAt = heightAt) {
  const R = P.rules, Lp = P.layout; const L = computeLayout(site, cand, P, dtmAt);
  const checks = []; const dims = [];
  const push = (c) => checks.push(c);
  const occ = [...L.pad];
  // Zonenkonformität
  const zonesAt = (p) => site.zones.filter(z => pip(p, z.poly)).map(z => z.t);
  const zc = L.pad.map(zonesAt); const allAZ = zc.every(z => z.some(t => t.startsWith('Arbeitszone')));
  const bad = zc.flat().filter(t => /Grünzone|Wald|Strassen|Abbauzone/.test(t));
  push({ id: 'ZONE', title: 'Zonenkonformität', norm: 'RPG Art. 22; PBG LU; BZR Eschenbach', measured: allAZ && !bad.length ? 'vollständig in Arbeitszone IV' : `berührt: ${[...new Set(bad)].join(', ') || 'ausserhalb Arbeitszone'}`, status: allAZ && !bad.length ? 'ok' : 'fail' });
  // Waldabstand
  let dW = [Infinity]; for (const w of site.waldgrenze) { const r = minDist(L.fence, w, true, false); if (r[0] < dW[0]) dW = r; }
  push({ id: 'WALD', title: 'Waldabstand', norm: '§ 136 PBG LU (20 m); § 43 PBV (Ausnahme bis 10 m)', measured: `${dW[0].toFixed(1)} m (Zaun bis statische Waldgrenze)`, status: dW[0] >= R.wald ? 'ok' : dW[0] >= R.waldMin ? 'warn' : 'fail' });
  dims.push({ a: dW[1], b: dW[2], d: dW[0], label: 'Waldgrenze', limit: R.wald, status: checks.at(-1).status, key: 'wald' });
  // Fahrwege / Manövrierflächen
  const conflicts = [];
  for (const r of site.roads) { const d = minDist(L.fence, r.pts, true, false)[0] - r.w / 2; if (d < R.roadClear) conflicts.push({ name: r.name, d, kind: r.kind, id: r.id }); }
  for (const a of site.areas) { const d = minDist(L.fence, a.poly)[0]; if (d < R.roadClear) conflicts.push({ name: a.name, d, kind: a.kind || 'area', id: a.id }); }
  // Fahrgasse Ost: Restbreite zur Halle ist zulässig, wenn > laneMin
  let laneRest = null; const hall = site.hall;
  if (hall) { laneRest = minDist(L.outline, hall)[0]; }
  const laneOk = laneRest !== null && laneRest >= 4.0, laneWarn = laneRest !== null && laneRest >= Lp.laneMin;
  const hard = conflicts.filter(c => !(c.id === 'ost' && laneOk)).map(c => (c.id === 'ost' && laneWarn) ? { ...c, soft: true } : c);
  push({ id: 'FAHRWEG', title: 'Fahrwege und Durchfahrten freihalten', norm: 'Betriebsabläufe Kieswerk; SUVA; Feuerwehrzufahrt FKS', measured: hard.length ? hard.map(c => c.kind === 'parking' ? `${c.name} (Parkplätze entfallen)` : c.soft ? `${c.name}: Restbreite ${laneRest.toFixed(1)} m (Lkw eingeschränkt)` : `${c.name} (${c.d < 0 ? 'überlagert' : c.d.toFixed(1) + ' m'})`).join('; ') : (laneRest !== null && laneRest < 30 ? `kein Konflikt; Fahrgasse zur Halle bleibt ${laneRest.toFixed(1)} m breit` : 'kein Konflikt mit Fahrwegen'), status: hard.some(c => !c.soft && c.kind !== 'parking' && (c.kind === 'public' || c.kind === 'area' || c.d < 0)) ? 'fail' : hard.length ? 'warn' : 'ok' });
  if (laneRest !== null && laneRest < 30) dims.push({ ...(() => { const r = minDist(L.outline, hall); return { a: r[1], b: r[2] }; })(), d: laneRest, label: 'Fahrgasse frei', limit: Lp.laneMin, status: laneRest >= Lp.laneMin ? 'ok' : 'fail', key: 'lane' });
  // Gebäudeabstand Brandschutz
  let dB = [Infinity]; let bName = '';
  for (const u of L.units) for (const b of site.bpolys || []) { const r = minDist(u.poly, b.poly); if (r[0] < dB[0]) { dB = r; bName = b.name; } }
  push({ id: 'BRAND', title: 'Brandschutzabstand zu Gebäuden', norm: 'VKF-BSN 1-15, BSR 15-15 (Schutzabstände); Herstellerangaben UL 9540A', measured: isFinite(dB[0]) ? `${dB[0].toFixed(1)} m zu ${bName}` : 'kein Gebäude im Umkreis', status: dB[0] >= Lp.fireBldg ? 'ok' : dB[0] >= 3 ? 'warn' : 'fail' });
  if (isFinite(dB[0]) && dB[0] < 40) dims.push({ a: dB[1], b: dB[2], d: dB[0], label: 'Brandabstand ' + bName.split(' (')[0], limit: Lp.fireBldg, status: checks.at(-1).status, key: 'brand' });
  // Belasteter Standort
  const kbs = site.zones.filter(z => z.t.startsWith('Belastet')); const onKbs = kbs.some(z => L.pad.some(p => pip(p, z.poly)) || minDist(L.pad, z.poly)[0] === 0);
  push({ id: 'ALTLAST', title: 'Kataster belastete Standorte', norm: 'AltlV Art. 3; USG Art. 32c', measured: onKbs ? 'auf belastetem Standort (untersuchungsbedürftig)' : 'nicht betroffen', status: onKbs ? 'warn' : 'ok' });
  // Naturgefahren
  const haz = site.zones.filter(z => /Hangmuren|Rutsch/.test(z.t)).some(z => L.pad.some(p => pip(p, z.poly)));
  push({ id: 'GEFAHR', title: 'Naturgefahren (Gefahrenkarte)', norm: 'Gefahrenkarte Kanton Luzern', measured: haz ? 'in Gefahrengebiet Spontanrutschung / Hangmure' : 'kein Gefahrengebiet; Perimeter vertiefte Beurteilung', status: haz ? 'fail' : 'ok' });
  // Platz
  push({ id: 'PLATZ', title: `Platzbedarf ${P.nUnits} Container + MS-Skid`, norm: 'Herstellerabstände, Türschwenkbereich, Wartungsgang', measured: L.fits ? `passt (Anlage ${Math.abs(area(L.pad)).toFixed(0)} m², Zaunfläche ${Math.abs(area(L.fence)).toFixed(0)} m²)` : 'passt nicht in die Fläche', status: L.fits ? 'ok' : 'fail' });
  // Kabel zur Trafostation
  const skid = L.units.find(u => u.type === 'skid'); const route = cableRoute(site, skid.c, site.trafo.c);
  push({ id: 'KABEL', title: 'MS-Kabel zur Trafostation', norm: 'NIN / ESTI; Spannungsfall, Kosten', measured: `${route.len.toFixed(0)} m Kabeltrasse`, status: route.len <= R.cableOk ? 'ok' : route.len <= R.cableWarn ? 'warn' : 'fail' });
  // Lärm
  const nres = site.receptors.map(r => { const day = noiseAt(r.c, r.y, L, P, 'day', heightAt), night = noiseAt(r.c, r.y, L, P, 'night', heightAt); const pw = R.pw[r.es]; return { r, day, night, pw, ok: day.Lr <= pw[0] && night.Lr <= pw[1], margin: Math.max(day.Lr - pw[0], night.Lr - pw[1]) }; });
  const worst = nres.reduce((a, b) => b.margin > a.margin ? b : a);
  push({ id: 'LSV', title: 'Lärm an Wohnnutzungen (Planungswerte)', norm: 'LSV Art. 7, Anhang 6 (Industrie- und Gewerbelärm)', measured: `kritisch: ${worst.r.name} (ES ${worst.r.es}): Lr Tag ${worst.day.Lr.toFixed(0)} / Nacht ${worst.night.Lr.toFixed(0)} dB(A), PW ${worst.pw[0]} / ${worst.pw[1]}`, status: worst.margin <= -3 ? 'ok' : worst.margin <= 0 ? 'warn' : 'fail' });
  // NISV
  const nis = nisvRadius(L, P); let dO = Infinity, oName = '';
  const lvp = add(skid.c, mul(skid.front, -(skid.W / 2 - 0.35)));   // NS-Sammelschiene an der Rückseite des Skids
  for (const b of site.bpolys || []) { if (!b.omen) continue; const d = minDist([lvp], b.poly, false, true)[0]; if (d < dO) { dO = d; oName = b.name; } }
  push({ id: 'NISV', title: 'NISV: 1 µT an Orten mit empfindlicher Nutzung', norm: 'NISV Anhang 1 Ziff. 1 (Anlagegrenzwert 1 µT)', measured: `1-µT-Radius ca. ${nis.r1uT.toFixed(1)} m; nächster OMEN ${isFinite(dO) ? dO.toFixed(0) + ' m (' + oName + ')' : '-'}`, status: dO > nis.r1uT + 2 ? 'ok' : dO > nis.r1uT ? 'warn' : 'fail' });
  // PV-Nähe (Nutzen)
  let dPV = Infinity; for (const f of site.pv) { if (f.flat) continue; const d = len(sub(f.c, skid.c)); if (d < dPV) dPV = d; }
  push({ id: 'PV', title: 'Nähe zu bestehender PV (Werkhallen)', norm: 'Eigenverbrauch, kurze AC-Kopplung', measured: `${dPV.toFixed(0)} m zum nächsten PV-Feld`, status: dPV < 60 ? 'ok' : dPV < 150 ? 'warn' : 'fail', soft: true });
  // Abstand Wohnhaus (Info)
  let dH = Infinity, hN = ''; for (const r of site.receptors) { const d = len(sub(r.c, centroid(L.pad))); if (d < dH) { dH = d; hN = r.name; } }
  dims.push({ a: centroid(L.pad), b: site.receptors.find(r => r.name === hN).c, d: dH, label: 'nächstes Wohnhaus', limit: 0, status: checks.find(c => c.id === 'LSV').status, key: 'haus' });
  dims.push({ a: skid.c, b: site.trafo.c, d: route.len, label: 'Kabel zum Trafo', limit: 0, status: 'info', key: 'kabel', route: route.pts });
  // Bewertung
  const w = { ZONE: 30, WALD: 25, FAHRWEG: 25, BRAND: 10, ALTLAST: 10, GEFAHR: 30, PLATZ: 30, KABEL: 8, LSV: 15, NISV: 15, PV: 6 };
  let score = 100; for (const c of checks) score -= (w[c.id] || 5) * (c.status === 'fail' ? 1 : c.status === 'warn' ? 0.4 : 0);
  const cnt = { ok: checks.filter(c => c.status === 'ok').length, warn: checks.filter(c => c.status === 'warn').length, fail: checks.filter(c => c.status === 'fail').length };
  return { cand, layout: L, checks, dims, noise: nres, route, nisv: nis, score: Math.max(0, score), cnt };
}
export function rankCandidates(site, P, heightAt, dtmAt) {
  return site.candidates.map(c => { const a = evaluate(site, c, { ...P, skidFirst: false }, heightAt, dtmAt), b = evaluate(site, c, { ...P, skidFirst: true }, heightAt, dtmAt);
    const better = ((b.cnt.fail - a.cnt.fail) || (a.score - b.score)) < 0 ? b : a; better.order = better === b ? 'Skid zuerst (Süd)' : 'Container zuerst (Süd)'; return better; })
    .sort((a, b) => (a.cnt.fail - b.cnt.fail) || (b.score - a.score)); }

// ---------------------------------------------------------------- Energiefluss-Simulation (1-min-Raster, 24 h)
function mulberry32(a) { return function () { let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function profiles(P) {
  const O = P.ops, n = 1440, rnd = mulberry32(O.season === 'summer' ? 11 : 23);
  const pv = new Float32Array(n), kies = new Float32Array(n), heiz = new Float32Array(n);
  const sum = O.season === 'summer'; const [sr, ss, pk] = sum ? [5.75, 21.2, 0.78] : [8.2, 16.8, 0.45];
  for (let m = 0; m < n; m++) { const h = m / 60;
    // PV: Glockenkurve zwischen Sonnenauf- und -untergang, Bewölkung als Dämpfung mit Schwankung
    if (h > sr && h < ss) { const x = (h - sr) / (ss - sr); const cs = Math.sin(Math.PI * x) ** 1.35; const cl = 1 - O.cloud * (0.5 + 0.5 * Math.sin(m / 17) * Math.sin(m / 41)); pv[m] = P.site.pv_kWp * pk * cs * cl; }
    // Kieswerk: Werktag 06:30-12:00 und 13:00-17:30, Samstag 06:30-11:30 (60 %)
    let L = 45 + 10 * rnd();
    const op = O.day === 'werktag' ? (h >= 6.5 && h < 12) || (h >= 13 && h < 17.5) : O.day === 'samstag' ? (h >= 6.5 && h < 11.5) : false;
    const f = O.day === 'samstag' ? 0.6 : 1;
    if (op) { L += f * (380 + 160 + 90) * (0.85 + 0.15 * Math.sin(m / 9)) + 40 * (rnd() - 0.5); if ((m % 22) < 6) L += f * 150; }
    else if (O.day === 'werktag' && h >= 12 && h < 13) L += 80;
    if (O.day === 'werktag' && ((h >= 6.25 && h < 6.5) || (h >= 17.5 && h < 17.75))) L += 120;
    kies[m] = L;
    heiz[m] = (sum ? 16 : 42) + 6 * Math.sin(m / 31) + (sum ? 0 : (h > 5 && h < 9 ? 8 : 0));
  }
  return { pv, kies, heiz };
}
export function simulate(P, layout) {
  const O = P.ops, pr = profiles(P), n = 1440; const Emax = layout.usable_kWh, Pmax = layout.P_kW;
  const bat = new Float32Array(n), soc = new Float32Array(n), grid = new Float32Array(n), p2h = new Float32Array(n), island = new Uint8Array(n);
  let e = Emax * (O.season === 'summer' ? 0.5 : 0.75); const socNight = O.season === 'summer' ? (O.day === 'werktag' ? 0.6 : 0.35) : O.socMax;
  let peakNo = 0, peakWith = 0, shaved = 0, pvSelf = 0, pvExport = 0, pvExportNo = 0;
  for (let m = 0; m < n; m++) {
    const h = m / 60; const load = pr.kies[m] + pr.heiz[m]; let net = load - pr.pv[m]; let b = 0, ph = 0;
    const isl = O.scenario === 'insel' && h >= 10 && h < 14; island[m] = isl ? 1 : 0;
    if (O.scenario === 'p2h' && h >= 11 && h < 15) { ph = O.p2h_kW; net += ph; }
    const night = h < 6 || h >= 22;
    const lim = night ? Math.min(Pmax, O.nightLimit_kW) : Pmax;
    if (isl) { // Inselbetrieb: Netz getrennt, Speicher deckt Heizzentrale und reduzierte Kieswerklast
      const islLoad = pr.heiz[m] + Math.min(pr.kies[m], 120); net = islLoad - pr.pv[m]; b = net; }
    else if (net > O.target_kW) b = net - O.target_kW;                 // Spitzen kappen
    else if (net < 0) b = net;                                       // PV-Überschuss laden
    else if (night && O.day !== 'sonntag' && e < Emax * socNight) b = -Math.max(0, Math.min(O.nightCharge_kW, (Emax * socNight - e) * 60, O.target_kW - net)); // Nachtladung (Schwachlast, unter der Bezugsgrenze; im Sommer Platz für PV lassen)
    else if (O.scenario === 'p2h' && ph > 0 && e > Emax * 0.5) b = Math.min(ph, net);
    b = Math.max(-lim, Math.min(lim, b));
    const de = -b / 60 * (b < 0 ? 0.95 : 1 / 0.95);
    if (e + de > Emax * O.socMax) b = b < 0 ? -(Emax * O.socMax - e) * 60 / 0.95 : b;
    if (e + de < Emax * O.socMin) b = b > 0 ? (e - Emax * O.socMin) * 60 * 0.95 : b;
    e += -b / 60 * (b < 0 ? 0.95 : 1 / 0.95); e = Math.max(0, Math.min(Emax, e));
    bat[m] = b; soc[m] = e / Emax; p2h[m] = ph; grid[m] = isl ? 0 : net - b;
    peakNo = Math.max(peakNo, load - pr.pv[m]); peakWith = Math.max(peakWith, isl ? 0 : net - b);
    if (b > 0 && !isl) shaved += b / 60;
    pvSelf += Math.min(pr.pv[m], load) / 60; pvExportNo += Math.max(0, pr.pv[m] - load) / 60; pvExport += Math.max(0, -(net - b)) / 60;
  }
  const flex = new Float32Array(n); for (let m = 0; m < n; m++) flex[m] = Math.max(0, Pmax - Math.abs(bat[m]));
  return { ...pr, bat, soc, grid, p2h, island, flex, peakNo, peakWith, shaved_kWh: shaved, pvExportNo, pvExport, Emax, Pmax };
}

export function computeAll(site, Pin = {}, heightAt = () => 0, dtmAt = heightAt) {
  const P = JSON.parse(JSON.stringify(DEFAULTS)); for (const k of Object.keys(Pin)) { if (typeof Pin[k] === 'object' && !Array.isArray(Pin[k])) Object.assign(P[k], Pin[k]); else P[k] = Pin[k]; }
  const ranked = rankCandidates(site, P, heightAt, dtmAt); const best = ranked[0];
  const sim = simulate(P, best.layout);
  return { P, ranked, best, sim };
}
