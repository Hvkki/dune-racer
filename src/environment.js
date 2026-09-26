import * as THREE from 'three';
import { CONFIG } from './config.js';

// --- cheap value noise (no external deps) ---
function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

// Bold, clearly-visible rolling dunes. Higher amplitude + a low-frequency
// primary wave so the horizon actually undulates like sand dunes.
function rawDune(wx, wz) {
  let h = 0;
  // primary big dunes
  h += (vnoise(wx * 0.0045, wz * 0.0045) - 0.5) * 34;
  // secondary ridges
  h += (vnoise(wx * 0.011, wz * 0.011) - 0.5) * 14;
  // fine ripples
  h += (vnoise(wx * 0.03, wz * 0.03) - 0.5) * 3.5;
  return h;
}

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export class Environment {
  constructor(scene) {
    this.scene = scene;
    this._track = null; // set later via attachTrack for flattening
    this._buildSky();
    this._buildLights();
    // Height function used everywhere. Before a track is attached this is raw dunes.
    this.heightFn = (x, z) => this._height(x, z);
  }

  // Height at a world point. Near the track we grade a smooth, banked corridor
  // that sits at the track's own centerline height so the road never floats
  // or gets buried, while the surrounding desert keeps its full dunes.
  _height(x, z) {
    const raw = rawDune(x, z);
    if (!this._track) return raw;

    const { dist, height: roadH } = this._track.nearest(x, z);
    // Tight corridor: fully graded to road height within the road + a small
    // shoulder, then blend back to dunes over a short band so the walls of the
    // corridor read as banked sand berms hugging the track.
    const flatBand = CONFIG.TRACK_WIDTH + 26;   // wide graded raceway + run-off
    const fadeBand = CONFIG.TRACK_WIDTH + 70;   // dunes fully back well outside
    const k = smoothstep(flatBand, fadeBand, dist); // 0 on road, 1 in dunes
    // Blend between the road height (flat corridor) and full dunes.
    return THREE.MathUtils.lerp(roadH, raw, k);
  }

  attachTrack(track) {
    this._track = track;
    this._buildGround();
    this._scatterProps();
  }

  _buildSky() {
    // Warm, hazy desert atmosphere (Cairo-style). Fog tint matches the horizon.
    this.scene.fog = new THREE.Fog(0xf0cf95, CONFIG.FOG_NEAR, CONFIG.FOG_FAR);

    const skyGeo = new THREE.SphereGeometry(760, 32, 20);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        top: { value: new THREE.Color(0x2f6fd0) },   // deep blue zenith
        mid: { value: new THREE.Color(0x7fb2e8) },   // pale blue
        bot: { value: new THREE.Color(0xf0d4a0) },   // warm sand haze at horizon
        sunDir: { value: new THREE.Vector3(0.5, 0.55, -0.6).normalize() },
        sunColor: { value: new THREE.Color(0xffe9c0) },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
        uniform vec3 sunDir; uniform vec3 sunColor;
        void main() {
          float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = h < 0.5
            ? mix(bot, mid, h * 2.0)
            : mix(mid, top, (h - 0.5) * 2.0);
          // sun glow
          float d = max(dot(vDir, sunDir), 0.0);
          col += sunColor * pow(d, 10.0) * 0.35;     // broad glow
          col += sunColor * pow(d, 500.0) * 1.2;     // bright core
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));
    this._skyMat = skyMat;
  }

  _buildLights() {
    // Strong warm key light (low-ish sun => long dramatic shadows).
    const sun = new THREE.DirectionalLight(0xffe9c2, 3.1);
    sun.position.set(220, 240, -260);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -180; c.right = 180; c.top = 180; c.bottom = -180;
    c.near = 1; c.far = 800;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);
    this.sun = sun;

    // Cool sky fill / warm ground bounce for that HDR desert contrast.
    this.scene.add(new THREE.HemisphereLight(0x9fc4ff, 0xd9a860, 0.85));
    this.scene.add(new THREE.AmbientLight(0xfff0d0, 0.25));

    // Subtle cool rim from opposite the sun to separate the car from the sand.
    const rim = new THREE.DirectionalLight(0x88bbff, 0.7);
    rim.position.set(-200, 120, 220);
    this.scene.add(rim);
  }

  _buildGround() {
    const G = CONFIG.GROUND_SIZE, SEG = CONFIG.GROUND_SEG;
    const geo = new THREE.PlaneGeometry(G, G, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setY(i, this._height(p.getX(i), p.getZ(i)));
    }
    geo.computeVertexNormals();

    // Warm saturated sand with a hint of sheen for that "simulated HDR" look.
    const mat = new THREE.MeshStandardMaterial({
      color: 0xe0ad5e, roughness: 0.92, metalness: 0.02,
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  _makeRock() {
    const g = new THREE.IcosahedronGeometry(THREE.MathUtils.randFloat(1.2, 3.6), 0);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(
        i,
        pos.getX(i) * (0.8 + Math.random() * 0.4),
        pos.getY(i) * (0.55 + Math.random() * 0.4),
        pos.getZ(i) * (0.8 + Math.random() * 0.4)
      );
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      color: 0xa5764a, roughness: 1.0, flatShading: true,
    }));
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  _makeCactus() {
    const grp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a7d40, roughness: 0.85 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 5.5, 8), mat);
    trunk.position.y = 2.75;
    grp.add(trunk);
    for (const s of [-1, 1]) {
      if (Math.random() < 0.3) continue;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 2.0, 7), mat);
      arm.position.set(s * 0.7, 3.0, 0);
      arm.rotation.z = s * 0.5;
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 1.6, 7), mat);
      tip.position.set(s * 1.15, 4.2, 0);
      grp.add(arm, tip);
    }
    grp.traverse((o) => { o.castShadow = true; });
    return grp;
  }

  _scatterProps() {
    const half = CONFIG.GROUND_SIZE / 2 - 20;
    let placed = 0;
    let attempts = 0;
    const target = 260;
    while (placed < target && attempts < target * 8) {
      attempts++;
      const x = THREE.MathUtils.randFloatSpread(half * 2);
      const z = THREE.MathUtils.randFloatSpread(half * 2);
      // keep props off the road + shoulder
      if (this._track && this._track.nearest(x, z).dist < CONFIG.TRACK_WIDTH + 8) continue;
      const o = Math.random() < 0.66 ? this._makeRock() : this._makeCactus();
      o.position.set(x, this._height(x, z) - 0.3, z);
      o.rotation.y = Math.random() * Math.PI * 2;
      const s = THREE.MathUtils.randFloat(0.9, 1.8);
      o.scale.setScalar(s);
      this.scene.add(o);
      placed++;
    }
  }
}
