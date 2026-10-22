// The SF world frame (tools/geo-base.mjs): lon/lat <-> world round trips, metric distances, orientation
import assert from 'node:assert/strict';
import test from 'node:test';
import { toWorld, fromWorld } from '../tools/geo-base.mjs';

const haversine = (lon1, lat1, lon2, lat2) => {
  const R = 6371008.8;
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

test('origin is the Market St & Montgomery St node and the axes point east / south', () => {
  const [x, z] = toWorld(-122.402065729, 37.788721152);
  assert.ok(Math.abs(x) < 1e-6 && Math.abs(z) < 1e-6);
  const [xe] = toWorld(-122.392, 37.788721152);
  const [, zn] = toWorld(-122.402065729, 37.798);
  assert.ok(xe > 0, 'east is +x');
  assert.ok(zn < 0, 'north is -z');
});

test('lon/lat -> world -> lon/lat round-trips within 1 cm across the city', () => {
  for (let i = 0; i < 2000; i++) {
    const lon = -122.52 + Math.random() * 0.17;
    const lat = 37.70 + Math.random() * 0.13;
    const [x, z] = toWorld(lon, lat);
    const [lon2, lat2] = fromWorld(x, z);
    assert.ok(haversine(lon, lat, lon2, lat2) < 0.01);
  }
});

test('world distances match geodesic distances within 0.5% inside the core (< 6 km)', () => {
  for (let i = 0; i < 500; i++) {
    const p = [-122.43 + Math.random() * 0.05, 37.77 + Math.random() * 0.04];
    const q = [-122.43 + Math.random() * 0.05, 37.77 + Math.random() * 0.04];
    const [x1, z1] = toWorld(...p);
    const [x2, z2] = toWorld(...q);
    const d = Math.hypot(x2 - x1, z2 - z1);
    const h = haversine(...p, ...q);
    if (h > 50) assert.ok(Math.abs(d - h) / h < 0.005, `${d} vs ${h}`);
  }
});
