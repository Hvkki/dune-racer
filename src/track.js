import * as THREE from 'three';
import { CONFIG } from './config.js';

// A looped race track defined by a Catmull-Rom curve. Provides:
//  - the road mesh (a flat ribbon extruded along the curve)
//  - checkpoint gates for sequential lap detection
//  - helpers for distance-to-track (used to flatten dunes + off-road drag)

const CONTROL_POINTS = [
  [0, 0], [90, 12], [150, 90], [110, 175], [20, 210],
  [-80, 195], [-150, 130], [-175, 30], [-130, -70], [-40, -95], [40, -60],
].map(([x, z]) => new THREE.Vector3(x, 0, z));

export class Track {
  constructor(scene, heightFn) {
    this.curve = new THREE.CatmullRomCurve3(CONTROL_POINTS, true, 'catmullrom', 0.5);
    this.heightFn = heightFn; // terrain height sampler (for placing the road on dunes)

    // Precompute a dense polyline for nearest-point queries.
    this._samples = this.curve.getSpacedPoints(600);

    this.group = new THREE.Group();
    this._buildRoad();
    this._buildCheckpoints();
    scene.add(this.group);

    // Starting transform: on the curve at t=0, facing along the tangent.
    const start = this.curve.getPointAt(0);
    const tan = this.curve.getTangentAt(0);
    this.startPos = new THREE.Vector3(start.x, this.heightFn(start.x, start.z), start.z);
    this.startHeading = Math.atan2(tan.x, tan.z);
  }

  _buildRoad() {
    const N = 600;
    const pts = this.curve.getSpacedPoints(N);
    const halfW = CONFIG.TRACK_WIDTH;

    const positions = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= N; i++) {
      const p = pts[i % pts.length];
      // tangent via neighboring points
      const pNext = pts[(i + 1) % pts.length];
      const pPrev = pts[(i - 1 + pts.length) % pts.length];
      const tan = new THREE.Vector3().subVectors(pNext, pPrev).normalize();
      const right = new THREE.Vector3(tan.z, 0, -tan.x).normalize();

      const h = this.heightFn(p.x, p.z) + 0.15; // sit slightly above sand
      const left = new THREE.Vector3(p.x - right.x * halfW, h, p.z - right.z * halfW);
      const rgt = new THREE.Vector3(p.x + right.x * halfW, h, p.z + right.z * halfW);

      positions.push(left.x, left.y, left.z);
      positions.push(rgt.x, rgt.y, rgt.z);
      uvs.push(0, i / 8);
      uvs.push(1, i / 8);
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

    const mat = new THREE.MeshStandardMaterial({
      color: 0x5a5148, roughness: 0.95, metalness: 0.0,
    });
    const road = new THREE.Mesh(geo, mat);
    road.receiveShadow = true;
    this.group.add(road);

    // Painted edge lines for readability.
    this._buildEdgeLines(pts, halfW);
  }

  _buildEdgeLines(pts, halfW) {
    const mk = (offset, color) => {
      const linePts = [];
      for (let i = 0; i <= pts.length; i++) {
        const p = pts[i % pts.length];
        const pNext = pts[(i + 1) % pts.length];
        const pPrev = pts[(i - 1 + pts.length) % pts.length];
        const tan = new THREE.Vector3().subVectors(pNext, pPrev).normalize();
        const right = new THREE.Vector3(tan.z, 0, -tan.x).normalize();
        const h = this.heightFn(p.x, p.z) + 0.2;
        linePts.push(new THREE.Vector3(p.x + right.x * offset, h, p.z + right.z * offset));
      }
      const g = new THREE.BufferGeometry().setFromPoints(linePts);
      return new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
    };
    this.group.add(mk(halfW - 0.6, 0xffd97a));
    this.group.add(mk(-(halfW - 0.6), 0xffd97a));
  }

  _buildCheckpoints() {
    this.checkpoints = [];
    const n = CONFIG.NUM_CHECKPOINTS;
    const startFinishMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222 });
    const gateMat = new THREE.MeshBasicMaterial({
      color: 0xffb300, transparent: true, opacity: 0.28, side: THREE.DoubleSide,
    });

    for (let i = 0; i < n; i++) {
      const t = i / n;
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t);
      const right = new THREE.Vector3(tan.z, 0, -tan.x).normalize();
      const h = this.heightFn(p.x, p.z);
      const pos = new THREE.Vector3(p.x, h, p.z);
      this.checkpoints.push({ pos, right: right.clone() });

      // Visual gate: a translucent plane spanning the track, taller for start/finish.
      const isStart = i === 0;
      const gh = isStart ? 9 : 6;
      const geo = new THREE.PlaneGeometry(CONFIG.TRACK_WIDTH * 2, gh);
      const gate = new THREE.Mesh(geo, isStart ? startFinishMat.clone() : gateMat);
      if (isStart) gate.material.transparent = true, gate.material.opacity = 0.5;
      gate.position.set(p.x, h + gh / 2, p.z);
      gate.lookAt(p.x + tan.x, h + gh / 2, p.z + tan.z);
      this.group.add(gate);
    }

    this.lap = { next: 0, count: 0, startTime: 0, lastTime: null, bestTime: null, justHit: false };
  }

  resetRace(nowMs) {
    this.lap.next = 0;
    this.lap.count = 0;
    this.lap.startTime = nowMs;
    this.lap.lastTime = null;
    // keep bestTime across resets
  }

  // Returns true when a checkpoint was hit this call (for HUD ping).
  update(carPos, nowMs) {
    this.lap.justHit = false;
    const cp = this.checkpoints[this.lap.next];
    const d = Math.hypot(carPos.x - cp.pos.x, carPos.z - cp.pos.z);
    if (d < CONFIG.CHECKPOINT_RADIUS) {
      this.lap.next = (this.lap.next + 1) % this.checkpoints.length;
      this.lap.justHit = true;
      if (this.lap.next === 0) {
        // completed a full loop in order
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

  // Nearest distance from a world XZ point to the track centerline.
  distanceToTrack(x, z) {
    let best = Infinity;
    for (let i = 0; i < this._samples.length; i++) {
      const s = this._samples[i];
      const dx = x - s.x, dz = z - s.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) best = d2;
    }
    return Math.sqrt(best);
  }
}
