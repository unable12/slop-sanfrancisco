(function () {
// js/sf-bridges.js
// The Golden Gate Bridge and the Bay Bridge (P5.2), from the structure OpenStreetMap draws (GEO.bridges,
// tools/geo-landmarks.mjs) and the published dimensions in docs/landmarks/golden-gate-bridge.md and bay-bridge.md:
// - Golden Gate: both towers extruded from OSM's building parts as drawn (legs in tapering stages, portal struts, the
//   concrete base), anchorages and pylons from their OSM outlines, the deck along the line through the towers from the
//   deck ways' ends, two main cables over the leg tops, suspenders, deck lamps.
// - Bay Bridge west span: the four OSM towers (cross-braced steel legs), the OSM centre anchorage, two double-deck
//   suspension spans with their cables; the Yerba Buena Island tunnel portals; the east span's single OSM tower, its
//   cable loop and the decks to Oakland along the OSM deck ways.
// Heights the sources don't give are labelled ESTIMATE where they are set. bridgeDeckAt(x, z, upper) gives the Bay
// Bridge's roadway height for grade-separation.js, so the I-80 freeway deck (and the highway traffic on it) runs on the
// bridge's upper (westbound) and lower (eastbound) decks. Far away only the towers and main cables show: the suspenders,
// truss members and lamps hide beyond FAR_DETAIL m (update(camera)).

const { THREE } = window.NYC;

const FAR_DETAIL = 3000;
const SUSPENDER_STEP = 15.24; // m (50 ft) between suspender pairs: ESTIMATE (250 pairs over 1966 m of suspended spans is 15.7 m)

// Golden Gate (docs/landmarks/golden-gate-bridge.md): the roadway 75 m over the water at the towers (227 m towers, 152 m
// above the roadway), 27 m wide, 67 m clearance at mid span: an 8 m deep deck if the roadway is level (ESTIMATE: the
// camber is not in the sources); cables 0.92 m
const GG = { road: 75, width: 27, depth: 8, cable: 0.92, saddleBelowTop: 4 /* ESTIMATE */, cableLowAboveRoad: 3 /* ESTIMATE */ };
// Bay Bridge west span (docs/landmarks/bay-bridge.md): 67 m navigation clearance, upper deck 18 m between curbs; the
// truss 20 m wide, the lower roadway 2 m over the truss bottom, the upper 9.5 m over the lower, 4 m of camber down to the
// towers, the cables 0.73 m (28.75 in): ESTIMATES except the clearance and the cable
const BB = { clear: 67, width: 20, lowerOverBottom: 2, upperOverLower: 9.5, camber: 4, cable: 0.73, shoreUpper: 58, portalUpper: 70, saddleBelowTop: 4, cableLowAboveRoad: 4, eastDeckWidth: 31, sasRoad: 48, oaklandRoad: 8 };

function buildSFBridges(scene) {
  const group = new THREE.Group();
  group.name = 'SFBridges';
  const colliders = [];
  const detail = []; // meshes hidden far away
  const GEO = window.NYC.GEO;
  const T = window.NYC.Terrain;
  const W = T.waterLevel;
  const B = GEO.bridges || {};
  const createParts = window.NYC.createLandmarkParts;
  const std = (color, roughness, metalness) => new THREE.MeshStandardNodeMaterial({ color, roughness, metalness });
  const mats = {
    orange: std(0xbf4e3b, 0.6, 0.3), // OSM building:colour of the Golden Gate's towers
    grey: std(0x9aa1a6, 0.5, 0.55), // the Bay Bridge's grey steel
    white: std(0xdcdcd6, 0.55, 0.3), // the east span
    concrete: std(0xb8b4aa, 0.85, 0.0),
    road: std(0x3d3f42, 0.9, 0.0),
    lamp: new THREE.MeshBasicNodeMaterial({ color: 0xffd9a0 })
  };
  mats.lamp.userData.noShadow = true;
  const flatPts = (f) => { const o = []; for (let i = 0; i + 1 < f.length; i += 2) o.push([f[i], f[i + 1]]); return o; };
  const centroid = (f) => { let x = 0, z = 0; const n = f.length / 2; for (let i = 0; i < f.length; i += 2) { x += f[i]; z += f[i + 1]; } return [x / n, z / n]; };
  const ground = (x, z) => T.groundAt(x, z);
  function obb(cx, cz, dx, dz, along, across, y0, y1) {
    const ex = (Math.abs(dx) * along + Math.abs(dz) * across) / 2, ez = (Math.abs(dz) * along + Math.abs(dx) * across) / 2;
    const a = Math.atan2(dz, dx);
    colliders.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, minY: y0, maxY: y1, obb: { cx, cz, hx: along / 2, hz: across / 2, cs: Math.cos(-a), sn: Math.sin(-a) } });
  }
  // A bridge frame: origin o, unit axis (ux, uz), side (sx, sz) = to the axis' right; at(t, s, y) -> [x, y, z]
  const frame = (o, ux, uz) => ({ o, ux, uz, sx: -uz, sz: ux, at: (t, s, y) => [o[0] + ux * t - uz * s, y, o[1] + uz * t + ux * s], t: (p) => (p[0] - o[0]) * ux + (p[1] - o[1]) * uz, s: (p) => -(p[0] - o[0]) * uz + (p[1] - o[1]) * ux });
  // Cable from point to point in segments; tube of radius r
  function cable(P, mat, pts, r) {
    const path = new THREE.CurvePath();
    for (let i = 0; i + 1 < pts.length; i++) path.add(new THREE.LineCurve3(new THREE.Vector3(...pts[i]), new THREE.Vector3(...pts[i + 1])));
    P.add(mat, new THREE.TubeGeometry(path, pts.length * 2, r, 8, false));
  }
  // A truss deck between stations t0 < t1 of frame F with roadway height road(t): chords, deck plate, side verticals and
  // diagonals every `panel` m (detail), lamps every 50 m (detail)
  function trussDeck(P, D, F, t0, t1, road, width, depth, mat, { panel = 7.6, lamps = true, roadInset = 2 } = {}) {
    const n = Math.max(2, Math.ceil((t1 - t0) / 30));
    for (let i = 0; i < n; i++) {
      const a = t0 + ((t1 - t0) * i) / n, b = t0 + ((t1 - t0) * (i + 1)) / n;
      for (const s of [-width / 2, width / 2]) {
        P.beam(mat, F.at(a, s, road(a) + 0.6), F.at(b, s, road(b) + 0.6), 1.2, 0.9); // top chord
        P.beam(mat, F.at(a, s, road(a) - depth), F.at(b, s, road(b) - depth), 1.2, 0.9); // bottom chord
      }
      P.beam(mats.road, F.at(a, 0, road(a) - 0.38), F.at(b, 0, road(b) - 0.38), 0.6, width - roadInset); // 8 cm under a freeway deck laid on it
      P.beam(mat, F.at(a, 0, road(a) - depth + 0.5), F.at(b, 0, road(b) - depth + 0.5), 0.5, width); // lower lateral plate
    }
    for (let t = t0; t < t1; t += panel) {
      const t2 = Math.min(t1, t + panel);
      for (const s of [-width / 2, width / 2]) {
        D.beam(mat, F.at(t, s, road(t) - depth), F.at(t, s, road(t) + 0.6), 0.5, 0.5);
        D.beam(mat, F.at(t, s, road(t) - depth), F.at(t2, s, road(t2) + 0.6), 0.35, 0.35);
      }
      if (lamps && Math.round(t / panel) % 7 === 0) for (const s of [-width / 2 + 0.4, width / 2 - 0.4]) {
        D.beam(mats.grey, F.at(t, s, road(t)), F.at(t, s, road(t) + 7), 0.22, 0.22);
        D.box(mats.lamp, ...F.at(t, s * 0.97, road(t) + 7), 0.8, 0.3, 0.5);
      }
    }
  }
  // suspenders from a cable y(t) down to the deck's top chord
  function suspenders(D, F, tA, tB, cableY, road, offsets, mat) {
    for (let t = tA + SUSPENDER_STEP / 2; t < tB; t += SUSPENDER_STEP) {
      const yc = cableY(t), yr = road(t) + 0.6;
      if (yc - yr < 1.5) continue;
      for (const s of offsets) D.beam(mat, F.at(t, s, yr), F.at(t, s, yc), 0.18, 0.4);
    }
  }
  function finish(P, D, name, centre) {
    const g = new THREE.Group();
    g.name = name;
    const a = P.build(g, name);
    const dg = new THREE.Group();
    dg.name = `${name}:detail`;
    const b = D.build(dg, `${name}:detail`, { shadow: false });
    g.add(dg);
    detail.push({ dg, centre });
    group.add(g);
    return { tris: a.tris + b.tris, draws: a.draws + b.draws };
  }
  const stats = [];

  // ===================================================================================================================
  // Golden Gate Bridge
  // ===================================================================================================================
  if (B.goldenGate && B.goldenGate.towers.length === 2) {
    const g = B.goldenGate;
    const P = createParts(), D = createParts();
    const [tS, tN] = g.towers.slice().sort((p, q) => q.c[1] - p.c[1]); // south first (larger z)
    const L = Math.hypot(tN.c[0] - tS.c[0], tN.c[1] - tS.c[1]);
    const F = frame(tS.c, (tN.c[0] - tS.c[0]) / L, (tN.c[1] - tS.c[1]) / L);
    // towers as OSM draws them, heights over the water
    let legS = [];
    for (const tw of g.towers) {
      for (const p of tw.parts) {
        const pts = flatPts(p.ring);
        P.prism(p.material === 'concrete' || p.support === 'pylon' ? mats.concrete : mats.orange, pts, W + p.min, W + (p.h ?? 13));
      }
      // the legs' tops carry the cables: lateral offsets of the top stage's two legs
      const tops = tw.parts.filter((p) => p.min >= 195 && p.h === tw.top).map((p) => F.s(centroid(p.ring)));
      if (tops.length === 2) legS = tops.sort((a, b) => a - b);
      for (const p of tw.parts.filter((q) => q.min >= 13 && q.min < 30 && q.h <= 74)) {
        const c = centroid(p.ring);
        obb(c[0], c[1], F.ux, F.uz, 16, 10, W, W + tw.top);
      }
    }
    if (legS.length !== 2) legS = [-GG.width / 2, GG.width / 2];
    // deck from the deck ways' ends, roadway level between the towers at GG.road; past them it runs level to where
    // the ground comes up to it (the south approach) or to the end of the data (Marin: no DEM there yet)
    const ts = g.decks.flatMap((d) => flatPts(d.pts)).map((p) => F.t(p));
    const t0 = Math.min(...ts), t1 = Math.max(...ts);
    const road = () => W + GG.road;
    const tEndS = (() => {
      for (let t = 0; t > t0; t -= 4) { const [x, , z] = F.at(t, 0, 0); if (ground(x, z) > W + GG.road - GG.depth - 1) return t; }
      return t0;
    })();
    trussDeck(P, D, F, tEndS, t1, road, GG.width, GG.depth, mats.orange);
    // anchorages and pylons from their OSM outlines, from the ground (or the water) to the deck
    for (const s of g.supports) {
      const c = s.c;
      const top = W + GG.road + (/Pylon/.test(s.name) ? 12 : 2); // ESTIMATE: the pylons stand ~12 m above the deck
      const base = Math.max(W - 2, ground(c[0], c[1]) - 1);
      if (top - base < 2) continue;
      P.prism(mats.concrete, flatPts(s.ring), base, top);
      obb(c[0], c[1], F.ux, F.uz, 12, 12, base, top);
    }
    // cables: anchorage -> south tower -> sag -> north tower -> anchorage (over the leg tops)
    const anchorS = g.supports.find((s) => s.name === 'South Anchorage'), anchorN = g.supports.find((s) => s.name === 'North Anchor');
    const tA = anchorS ? F.t(anchorS.c) : -343, tB = anchorN ? F.t(anchorN.c) : L + 343;
    const saddle = W + tS.top - GG.saddleBelowTop, low = W + GG.road + GG.cableLowAboveRoad;
    const cableY = (t) => {
      if (t >= 0 && t <= L) { const u = t / L; return saddle - (saddle - low) * (1 - (2 * u - 1) ** 2); }
      const ta = t < 0 ? tA : tB, tt = t < 0 ? 0 : L, ya = W + GG.road + 2;
      const u = (t - ta) / (tt - ta);
      return ya + (saddle - ya) * u - 6 * u * (1 - u); // side spans: a slight sag (ESTIMATE)
    };
    for (const s of legS) {
      const pts = [];
      for (let k = 0; k <= 12; k++) { const t = tA + ((0 - tA) * k) / 12; pts.push(F.at(t, s, cableY(t))); }
      for (let k = 1; k <= 48; k++) { const t = (L * k) / 48; pts.push(F.at(t, s, cableY(t))); }
      for (let k = 1; k <= 12; k++) { const t = L + ((tB - L) * k) / 12; pts.push(F.at(t, s, cableY(t))); }
      cable(P, mats.orange, pts, GG.cable / 2);
    }
    suspenders(D, F, tA, tB, cableY, road, legS, mats.orange);
    // deck colliders every 60 m
    for (let t = tEndS; t < t1; t += 60) {
      const [x, , z] = F.at(Math.min(t + 30, t1), 0, 0);
      obb(x, z, F.ux, F.uz, 60, GG.width, W + GG.road - GG.depth, W + GG.road + 1.5);
    }
    const mid = F.at((tEndS + t1) / 2, 0, 0);
    stats.push({ name: 'golden-gate-bridge', ...finish(P, D, 'bridge:golden-gate', { x: mid[0], z: mid[2], r: (t1 - tEndS) / 2 }) });
  }

  // ===================================================================================================================
  // Bay Bridge
  // ===================================================================================================================
  let bayDeck = null;
  if (B.bayBridge && B.bayBridge.towers.length >= 4) {
    const bb = B.bayBridge;
    const P = createParts(), D = createParts();
    const ca = bb.supports.find((s) => s.name === 'Center Anchorage');
    const west = bb.towers.filter((t) => t.c[0] < (ca ? ca.c[0] + 1200 : 3200)).map((t) => t.c).sort((p, q) => p[0] - q[0]);
    const east = bb.towers.filter((t) => !west.includes(t.c));
    // the west span's axis: W1 -> W4 (straight), stations t from W1
    const L = Math.hypot(west[3][0] - west[0][0], west[3][1] - west[0][1]);
    const F = frame(west[0], (west[3][0] - west[0][0]) / L, (west[3][1] - west[0][1]) / L);
    const tw = west.map((c) => F.t(c));
    const tCA = ca ? F.t(ca.c) : (tw[1] + tw[2]) / 2;
    // the I-80 link's ends on land (the SF shore) and at Yerba Buena Island's west portal: the deck's reach
    const deckEnds = (() => {
      const RG = GEO.roadGraph, N = RG.nodes;
      let lo = Infinity, hi = -Infinity;
      RG.links.forEach(([a, b, ni, , , , , flags]) => {
        if (!(flags & 1) || !/^I-80 (EAST|WEST)BOUND$/.test(RG.names[ni])) return;
        for (const i of [a, b]) {
          const p = [N[2 * i], N[2 * i + 1]];
          if (Math.abs(F.s(p)) > 40) continue;
          lo = Math.min(lo, F.t(p)); hi = Math.max(hi, F.t(p));
        }
      });
      return Number.isFinite(lo) ? [lo, hi] : [tw[0] - 360, tw[3] + 480];
    })();
    const [tShore, tPortal] = deckEnds;
    // the upper roadway: the crown of each main span at clearance + lower deck + upper over lower, camber down to the
    // towers, the side spans eased to the shore and the portal heights (ESTIMATES)
    const crown = W + BB.clear + BB.lowerOverBottom + BB.upperOverLower;
    const atTower = crown - BB.camber;
    const knots = [[tShore, W + BB.shoreUpper], [tw[0], atTower], [(tw[0] + tw[1]) / 2, crown], [tw[1], atTower], [tCA, atTower], [tw[2], atTower], [(tw[2] + tw[3]) / 2, crown], [tw[3], atTower], [tPortal, W + BB.portalUpper]];
    const upper = (t) => {
      if (t <= knots[0][0]) return knots[0][1];
      for (let k = 0; k + 1 < knots.length; k++) {
        const [a, ya] = knots[k], [b, yb] = knots[k + 1];
        if (t <= b) { const u = (t - a) / (b - a), e = u * u * (3 - 2 * u); return ya + (yb - ya) * (k === 0 || k === knots.length - 2 ? u : e); }
      }
      return knots[knots.length - 1][1];
    };
    const lower = (t) => upper(t) - BB.upperOverLower;
    const depth = BB.upperOverLower + BB.lowerOverBottom;
    trussDeck(P, D, F, tShore, tPortal, upper, BB.width, depth, mats.grey, { panel: 9 });
    // the lower deck's roadway inside the truss
    for (let t = tShore; t < tPortal; t += 30) {
      const t2 = Math.min(tPortal, t + 30);
      P.beam(mats.road, F.at(t, 0, lower(t) - 0.38), F.at(t2, 0, lower(t2) - 0.38), 0.6, BB.width - 2);
    }
    // towers: two legs tapering to the top with cross bracing (ESTIMATE: legs 6 m square at the water, 4 m at the top;
    // four X panels), a cap, concrete piers
    const legs = [-BB.width / 2 - 1, BB.width / 2 + 1];
    west.forEach((c, i) => {
      const t = tw[i], top = W + 160;
      for (const s of legs) {
        P.beam(mats.grey, F.at(t, s, W + 8), F.at(t, s * 0.92, top), 6, 5);
        P.box(mats.concrete, ...F.at(t, s, W - 2), 9, 10, 9, -Math.atan2(F.uz, F.ux));
      }
      const levels = [W + 10, lower(t) - depth - 1, lower(t) + 14, (lower(t) + 14 + top) / 2, top - 6];
      for (let k = 0; k + 1 < levels.length; k++) {
        const y0 = levels[k], y1 = levels[k + 1];
        const s0 = legs[0] + (legs[0] * -0.08) * ((y0 - W) / 160), s1 = legs[1] - legs[1] * 0.08 * ((y0 - W) / 160);
        const r0 = legs[0] + (legs[0] * -0.08) * ((y1 - W) / 160), r1 = legs[1] - legs[1] * 0.08 * ((y1 - W) / 160);
        P.beam(mats.grey, F.at(t, s0, y0), F.at(t, r1, y1), 1.2, 1.2);
        P.beam(mats.grey, F.at(t, s1, y0), F.at(t, r0, y1), 1.2, 1.2);
        P.beam(mats.grey, F.at(t, r0, y1), F.at(t, r1, y1), 2.2, 2.4);
      }
      P.beam(mats.grey, F.at(t, legs[0] * 0.92, top - 1.5), F.at(t, legs[1] * 0.92, top - 1.5), 3, 4);
      const [x, , z] = F.at(t, 0, 0);
      obb(x, z, F.ux, F.uz, 10, BB.width + 10, W - 2, top);
    });
    // the centre anchorage: OSM outline, 67 m (OSM height), a cable housing on top up to the deck (ESTIMATE)
    if (ca) {
      P.prism(mats.concrete, flatPts(ca.ring), W - 2, W + ca.h);
      const [x, , z] = F.at(tCA, 0, 0);
      P.box(mats.concrete, x, W + ca.h, z, 20, upper(tCA) + 6 - (W + ca.h), 30, -Math.atan2(F.uz, F.ux));
      obb(x, z, F.ux, F.uz, 30, 40, W - 2, upper(tCA) + 6);
    }
    // cables: shore anchorage -> W1 -> W2 -> centre anchorage -> W3 -> W4 -> island anchorage
    const saddle = W + 160 - BB.saddleBelowTop;
    const anchorY = (t) => upper(t) + 2;
    const spans = [[tShore, tw[0], 'side'], [tw[0], tw[1], 'main'], [tw[1], tCA, 'side'], [tCA, tw[2], 'side'], [tw[2], tw[3], 'main'], [tw[3], tPortal, 'side']];
    const cableY = (t) => {
      for (const [a, b, kind] of spans) {
        if (t < a || t > b) continue;
        const u = (t - a) / (b - a);
        if (kind === 'main') { const low = upper((a + b) / 2) + BB.cableLowAboveRoad; return saddle - (saddle - low) * (1 - (2 * u - 1) ** 2); }
        const ya = a === tShore || a === tCA ? anchorY(a) : saddle, yb = b === tPortal || b === tCA ? anchorY(b) : saddle;
        return ya + (yb - ya) * u - 8 * u * (1 - u);
      }
      return anchorY(t);
    };
    for (const s of [legs[0] * 0.92, legs[1] * 0.92]) {
      const pts = [];
      for (const [a, b] of spans) for (let k = pts.length ? 1 : 0; k <= 16; k++) { const t = a + ((b - a) * k) / 16; pts.push(F.at(t, s, cableY(t))); }
      cable(P, mats.grey, pts, BB.cable / 2);
    }
    suspenders(D, F, tShore, tPortal, cableY, upper, [legs[0] * 0.92, legs[1] * 0.92], mats.grey);
    for (let t = tShore; t < tPortal; t += 60) {
      const [x, , z] = F.at(Math.min(t + 30, tPortal), 0, 0);
      obb(x, z, F.ux, F.uz, 60, BB.width, lower(t) - BB.lowerOverBottom - 1, upper(t) + 1);
    }
    // Yerba Buena Island tunnel portals (the deck runs into the island here; 23 m wide x 18 m high bore)
    const portal = (t, dir) => {
      const y = lower(t) - BB.lowerOverBottom;
      const [x, , z] = F.at(t + dir * 2, 0, 0);
      const ry = -Math.atan2(F.uz, F.ux);
      P.box(mats.concrete, x, y, z, 4, 22, 30, ry);
    };
    portal(tPortal, 1);
    bayDeck = { F, t0: tShore, t1: tPortal, upper, lower, half: BB.width / 2 + 2 };

    // east span: the single tower (OSM, 160 m) as four columns (ESTIMATE spacing), decks along the OSM deck ways east of
    // the island descending from the self-anchored span to Oakland (ESTIMATE heights), the cable loop over the tower
    if (east.length) {
      const tower = east[0].c;
      const ways = bb.decks.map((d) => flatPts(d.pts)).filter((pts) => pts.some(([x]) => x > tower[0] - 450));
      let xEnd = -Infinity;
      for (const pts of ways) for (const [x] of pts) xEnd = Math.max(xEnd, x);
      const eastY = (x) => {
        const u = Math.min(1, Math.max(0, (x - (tower[0] + 300)) / (xEnd - tower[0] - 300)));
        return W + BB.sasRoad + (BB.oaklandRoad - BB.sasRoad) * u;
      };
      for (const pts of ways) {
        for (let i = 0; i + 1 < pts.length; i++) {
          const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
          if (Math.max(ax, bx) < tower[0] - 450) continue;
          const ya = eastY(ax), yb = eastY(bx);
          P.beam(mats.white, [ax, ya - 2.5, az], [bx, yb - 2.5, bz], 5, BB.eastDeckWidth);
          P.beam(mats.road, [ax, ya, az], [bx, yb, bz], 0.4, BB.eastDeckWidth - 2);
          const L2 = Math.hypot(bx - ax, bz - az);
          for (let s = 0; s < L2; s += 160) {
            const x = ax + ((bx - ax) * s) / L2, z = az + ((bz - az) * s) / L2;
            if (Math.abs(x - tower[0]) < 300) continue;
            P.cyl(mats.concrete, x, W - 2, z, 4, 3.5, eastY(x) - 5 - (W - 2), 12);
          }
        }
      }
      for (const [dx, dz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) P.beam(mats.white, [tower[0] + dx, W, tower[1] + dz], [tower[0] + dx * 0.6, W + 160, tower[1] + dz * 0.6], 5, 5);
      for (let y = W + 30; y < W + 150; y += 30) P.box(mats.white, tower[0], y, tower[1], 14, 2, 14);
      obb(tower[0], tower[1], 1, 0, 20, 20, W - 2, W + 160);
      // the cable loop: from the island side over the tower top to the far end of the self-anchored span (ESTIMATE:
      // 300 m either side, anchored in the deck ends)
      const loop = [];
      for (let k = 0; k <= 24; k++) {
        const u = k / 24, x = tower[0] - 300 + 600 * u, z = tower[1] + (k < 12 ? -1 : 1) * 0;
        const top = W + 160 - 4, end = W + BB.sasRoad + 2;
        loop.push([x, end + (top - end) * (1 - Math.abs(2 * u - 1)) ** 1.6, z]);
      }
      cable(P, mats.white, loop, 0.4);
    }
    const mid = F.at((tShore + tPortal) / 2, 0, 0);
    stats.push({ name: 'bay-bridge', ...finish(P, D, 'bridge:bay', { x: mid[0], z: mid[2], r: (tPortal - tShore) / 2 + 1500 }) });
  }

  // The Bay Bridge's roadway at (x, z) for grade-separation.js: the upper (westbound) or lower (eastbound) deck where the
  // point lies on the deck (within its half width of the axis, between the shore and the portal), else null; on land
  // short of the shore the approach climbs to the deck at 4.5% (ESTIMATE)
  function bridgeDeckAt(x, z, upperDeck) {
    if (!bayDeck) return null;
    const F = bayDeck.F, p = [x, z], t = F.t(p), s = F.s(p);
    if (Math.abs(s) > bayDeck.half + 6) {
      const d = Math.hypot(x - F.at(bayDeck.t0, 0, 0)[0], z - F.at(bayDeck.t0, 0, 0)[2]);
      if (t < bayDeck.t0 && d < 900) return { y: (upperDeck ? bayDeck.upper(bayDeck.t0) : bayDeck.lower(bayDeck.t0)) - 0.045 * d, onBridge: false };
      return null;
    }
    if (t < bayDeck.t0) {
      const d = bayDeck.t0 - t;
      return d < 900 ? { y: (upperDeck ? bayDeck.upper(bayDeck.t0) : bayDeck.lower(bayDeck.t0)) - 0.045 * d, onBridge: false } : null;
    }
    if (t > bayDeck.t1) return null;
    return { y: upperDeck ? bayDeck.upper(t) : bayDeck.lower(t), onBridge: true };
  }

  scene.add(group);
  window.NYC.bridgeStats = stats;
  console.info(`[bridges] ${stats.map((s) => `${s.name} ${Math.round(s.tris / 1000)}k triangles / ${s.draws} draws`).join(', ')}`);
  const _c = new THREE.Vector3();
  return {
    group, colliders, bridgeDeckAt,
    update(camera) {
      const glow = window.NYC.cityUniforms?.uInteriorGlow?.value || 0;
      mats.lamp.color.setHex(0xffd9a0).multiplyScalar(0.25 + Math.max(0, glow - 0.5) * 2.5);
      camera.getWorldPosition(_c);
      for (const { dg, centre: c } of detail) dg.visible = Math.hypot(_c.x - c.x, _c.z - c.z) - c.r < FAR_DETAIL;
    }
  };
}

Object.assign(window.NYC, { buildSFBridges });
})();
