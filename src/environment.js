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

// Raw dune height (before flattening near the track).
function rawDune(wx, wz) {
  let h = 0, amp = 7, f = 0.006;
  for (let o = 0; o < 4; o++) {
    h += (vnoise(wx * f, wz * f) - 0.5) * amp;
    amp *= 0.5;
    f *= 2.1;
  }
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

  _height(x, z) {
    const raw = rawDune(x, z);
    if (!this._track) return raw;
    // Flatten near the racing line: blend raw height toward the road height.
    const dist = this._track.distanceToTrack(x, z);
    const flatBand = CONFIG.TRACK_WIDTH + 6;   // fully flat within this
    const fadeBand = CONFIG.TRACK_WIDTH + 40;  // blend out to here
    const k = smoothstep(flatBand, fadeBand, dist); // 0 near road, 1 far
    return raw * k;
  }

  attachTrack(track) {
    this._track = track;
    this._buildGround();
    this._scatterProps();
  }

  _buildSky() {
    this.scene.fog = new THREE.Fog(0xe4c99a, CONFIG.FOG_NEAR, CONFIG.FOG_FAR);

    const skyGeo = new THREE.SphereGeometry(700, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        top: { value: new THREE.Color(0x5aa9ff) },
        bot: { value: new THREE.Color(0xf3d9a8) },
      },
      vertexShader: `
        varying float h;
        void main() {
          h = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying float h;
        uniform vec3 top;
        uniform vec3 bot;
        void main() {
          float t = clamp(h * 0.5 + 0.5, 0.0, 1.0);
          gl_FragColor = vec4(mix(bot, top, t), 1.0);
        }`,
    });
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));

    // A soft sun disc up in the sky.
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(24, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff3d0, transparent: true, opacity: 0.9, fog: false })
    );
    sunDisc.position.set(180, 220, -300);
    sunDisc.lookAt(0, 0, 0);
    this.scene.add(sunDisc);
  }

  _buildLights() {
    const sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
    sun.position.set(120, 180, -80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -160; c.right = 160; c.top = 160; c.bottom = -160;
    c.near = 1; c.far = 600;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);
    this.sun = sun;

    this.scene.add(new THREE.HemisphereLight(0xbfd6ff, 0xc2a26a, 0.75));
    this.scene.add(new THREE.AmbientLight(0xffe8c0, 0.22));
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

    const mat = new THREE.MeshStandardMaterial({
      color: 0xd9b673, roughness: 1.0, metalness: 0.0,
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  _makeRock() {
    const g = new THREE.IcosahedronGeometry(THREE.MathUtils.randFloat(0.8, 2.6), 0);
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
      color: 0x8a7a63, roughness: 1.0, flatShading: true,
    }));
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  _makeCactus() {
    const grp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x3f6d3a, roughness: 0.9 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 4, 8), mat);
    trunk.position.y = 2;
    grp.add(trunk);
    for (const s of [-1, 1]) {
      if (Math.random() < 0.35) continue;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.6, 7), mat);
      arm.position.set(s * 0.55, 2.2, 0);
      arm.rotation.z = s * 0.5;
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.3, 7), mat);
      tip.position.set(s * 0.92, 3.1, 0);
      grp.add(arm, tip);
    }
    grp.traverse((o) => { o.castShadow = true; });
    return grp;
  }

  _scatterProps() {
    const half = CONFIG.GROUND_SIZE / 2 - 20;
    let placed = 0;
    let attempts = 0;
    const target = 220;
    while (placed < target && attempts < target * 6) {
      attempts++;
      const x = THREE.MathUtils.randFloatSpread(half * 2);
      const z = THREE.MathUtils.randFloatSpread(half * 2);
      // keep props off the road
      if (this._track && this._track.distanceToTrack(x, z) < CONFIG.TRACK_WIDTH + 6) continue;
      const o = Math.random() < 0.68 ? this._makeRock() : this._makeCactus();
      o.position.set(x, this._height(x, z), z);
      o.rotation.y = Math.random() * Math.PI * 2;
      const s = THREE.MathUtils.randFloat(0.8, 1.6);
      o.scale.setScalar(s);
      this.scene.add(o);
      placed++;
    }
  }
}
