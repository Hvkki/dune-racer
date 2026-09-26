import * as THREE from 'three';
import { CONFIG } from './config.js';

// A looped race track defined by a Catmull-Rom curve. Provides:
//  - the road mesh (a flat ribbon following a smoothed centerline height)
//  - checkpoint gates for sequential lap detection
//  - nearest(x,z) -> { dist, height } used to grade the terrain corridor,
//    place props, and detect off-road driving
//
// The track owns its centerline height (a gently rolling profile derived from
// a low-frequency wave) so it never depends on the environment's flatten pass.
// The environment then grades the surrounding dunes DOWN to this height.

const CONTROL_POINTS = [
  [0, 0], [110, 15], [180, 110], [130, 210], [25, 250],
  [-95, 235], [-180, 155], [-210, 35], [-155, -85], [-50, -115], [50, -75],
].map(([x, z]) => new THREE.Vector3(x, 0, z));

// Gentle centerline elevation profile so the track rolls a little but stays
// very drivable (no steep dunes on the racing surface).
function centerlineHeight(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 0; // (kept deterministic-simple)
  return Math.sin(x * 0.004) * 3.5 + Math.cos(z * 0.004) * 3.5 + s;
}

export class Track {
  constructor(scene, heightFn) {
    this.curve = new THREE.CatmullRomCurve3(CONTROL_POINTS, true, 'catmullrom', 0.5);

    // Dense polyline for nearest-point queries. Store XZ + centerline height.
    const raw = this.curve.getSpacedPoints(800);
    this._samples = raw.map((p) => new THREE.Vector3(p.x, centerlineHeight(p.x, p.z), p.z));

    this.group = new THREE.Group();
    this._buildRoad();
    this._buildCheckpoints();
    scene.add(this.group);

    // Start on the curve at t=0, facing along the tangent (down the road).
    const start = this.curve.getPointAt(0);
    const tan = this.curve.getTangentAt(0);
    this.startPos = new THREE.Vector3(start.x, centerlineHeight(start.x, start.z), start.z);
    this.startHeading = Math.atan2(tan.x, tan.z);
  }

  // Nearest centerline point: returns squared-min distance and its height.
  nearest(x, z) {
    let best = Infinity, bestH = 0;
    const s = this._samples;
    for (let i = 0; i < s.length; i++) {
      const dx = x - s[i].x, dz = z - s[i].z;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) { best = d2; bestH = s[i].y; }
    }
    return { dist: Math.sqrt(best), height: bestH };
  }

  distanceToTrack(x, z) { return this.nearest(x, z).dist; }
  trackHeight(x, z) { return this.nearest(x, z).height; }

  _buildRoad() {
    const N = 800;
    const pts = this.curve.getSpacedPoints(N);
    const halfW = CONFIG.TRACK_WIDTH;

    const positions = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= N; i++) {
      const p = pts[i % pts.length];
      const pNext = pts[(i + 1) % pts.length];
      const pPrev = pts[(i - 1 + pts.length) % pts.length];
      const tan = new THREE.Vector3().subVectors(pNext, pPrev).normalize();
      const right = new THREE.Vector3(tan.z, 0, -tan.x).normalize();

      const h = centerlineHeight(p.x, p.z) + 0.08; // sit just above graded sand
      positions.push(p.x - right.x * halfW, h, p.z - right.z * halfW);
      positions.push(p.x + right.x * halfW, h, p.z + right.z * halfW);
      uvs.push(0, i / 6);
      uvs.push(1, i / 6);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      indices.push(a, b, d, a, d, c);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    // Dark asphalt with a touch of gloss => picks up sun + bloom (HDR look).
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3a3a42, roughness: 0.5, metalness: 0.15,
    });
    const road = new THREE.Mesh(geo, mat);
    road.receiveShadow = true;
    this.group.add(road);

    this._buildEdgeLines(pts, halfW);
    this._buildCenterDashes(pts);
  }

  _buildEdgeLines(pts, halfW) {
    // Emissive neon edge ribbons (Asphalt-style glowing track borders).
    const mk = (offset, color) => {
      const positions = [];
      const w = 0.9;
      for (let i = 0; i <= pts.length; i++) {
        const p = pts[i % pts.length];
        const pNext = pts[(i + 1) % pts.length];
        const pPrev = pts[(i - 1 + pts.length) % pts.length];
        const tan = new THREE.Vector3().subVectors(pNext, pPrev).normalize();
        const right = new THREE.Vector3(tan.z, 0, -tan.x).normalize();
        const h = centerlineHeight(p.x, p.z) + 0.12;
        const cx = p.x + right.x * offset, cz = p.z + right.z * offset;
        positions.push(cx - right.x * w, h, cz - right.z * w);
        positions.push(cx + right.x * w, h, cz + right.z * w);
      }
      const idx = [];
      for (let i = 0; i < pts.length; i++) {
        const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
        idx.push(a, b, d, a, d, c);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 1.6, roughness: 0.4,
      });
      return new THREE.Mesh(g, m);
    };
    this.group.add(mk(halfW - 0.5, 0x33e0ff));   // cyan neon
    this.group.add(mk(-(halfW - 0.5), 0xff3da6)); // magenta neon
  }

  _buildCenterDashes(pts) {
    // Dashed yellow center line for road readability + sense of speed.
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffd23f, emissive: 0x5a4300, roughness: 0.6,
    });
    const dashGeo = new THREE.PlaneGeometry(0.6, 4);
    dashGeo.rotateX(-Math.PI / 2);
    const step = 14;
    for (let i = 0; i < pts.length; i += step) {
      const p = pts[i];
      const pNext = pts[(i + 1) % pts.length];
      const ang = Math.atan2(pNext.x - p.x, pNext.z - p.z);
      const dash = new THREE.Mesh(dashGeo, mat);
      dash.position.set(p.x, centerlineHeight(p.x, p.z) + 0.14, p.z);
      dash.rotation.y = ang;
      this.group.add(dash);
    }
  }

  _buildCheckpoints() {
    this.checkpoints = [];
    const n = CONFIG.NUM_CHECKPOINTS;

    for (let i = 0; i < n; i++) {
      const t = i / n;
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t);
      const right = new THREE.Vector3(tan.z, 0, -tan.x).normalize();
      const h = centerlineHeight(p.x, p.z);
      const pos = new THREE.Vector3(p.x, h, p.z);
      this.checkpoints.push({ pos, right: right.clone() });

      const isStart = i === 0;
      // Glowing gate posts on each side.
      const postGeo = new THREE.BoxGeometry(0.8, isStart ? 9 : 6, 0.8);
      const postColor = isStart ? 0xffffff : 0xffb300;
      const postMat = new THREE.MeshStandardMaterial({
        color: postColor, emissive: postColor, emissiveIntensity: 1.4,
      });
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, postMat);
        const ph = (isStart ? 9 : 6) / 2;
        post.position.set(
          p.x + right.x * (CONFIG.TRACK_WIDTH + 1) * side,
          h + ph,
          p.z + right.z * (CONFIG.TRACK_WIDTH + 1) * side
        );
        this.group.add(post);
      }
      // Translucent banner spanning the gate.
      const gh = isStart ? 4 : 3;
      const bannerGeo = new THREE.PlaneGeometry((CONFIG.TRACK_WIDTH + 1) * 2, gh);
      const bannerMat = new THREE.MeshBasicMaterial({
        color: isStart ? 0xffffff : 0xffb300,
        transparent: true, opacity: isStart ? 0.5 : 0.3, side: THREE.DoubleSide,
      });
      const banner = new THREE.Mesh(bannerGeo, bannerMat);
      const bh = (isStart ? 9 : 6) - gh / 2;
      banner.position.set(p.x, h + bh, p.z);
      banner.lookAt(p.x + tan.x, h + bh, p.z + tan.z);
      this.group.add(banner);
    }

    this.lap = { next: 0, count: 0, startTime: 0, lastTime: null, bestTime: null, justHit: false };
  }

  resetRace(nowMs) {
    this.lap.next = 0;
    this.lap.count = 0;
    this.lap.startTime = nowMs;
    this.lap.lastTime = null;
  }

  update(carPos, nowMs) {
    this.lap.justHit = false;
    const cp = this.checkpoints[this.lap.next];
    const d = Math.hypot(carPos.x - cp.pos.x, carPos.z - cp.pos.z);
    if (d < CONFIG.CHECKPOINT_RADIUS) {
      this.lap.next = (this.lap.next + 1) % this.checkpoints.length;
      this.lap.justHit = true;
      if (this.lap.next === 0) {
        if (this.lap.count > 0 || this.lap.startTime > 0) {
          const t = (nowMs - this.lap.startTime) / 1000;
          this.lap.lastTime = t;
          if (this.lap.bestTime == null || t < this.lap.bestTime) this.lap.bestTime = t;
        }
        this.lap.count++;
        this.lap.startTime = nowMs;
      }
    }
    return this.lap.justHit;
  }
}
