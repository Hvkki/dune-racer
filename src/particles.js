import * as THREE from 'three';

// A recycled pool of dust points spawned behind the car when drifting/boosting.
export class DustSystem {
  constructor(scene, max = 500) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max); // 0 = dead
    this.cursor = 0;

    // start all particles hidden far below
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -9999;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo = geo;

    const tex = DustSystem._makeSprite();
    const mat = new THREE.PointsMaterial({
      color: 0xd8c199,
      size: 2.2,
      map: tex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  static _makeSprite() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(230,210,160,0.7)');
    g.addColorStop(1, 'rgba(230,210,160,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    return t;
  }

  _spawn(n, car) {
    const back = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading)).multiplyScalar(-2.2);
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const j = i * 3;
      this.pos[j] = car.pos.x + back.x + (Math.random() - 0.5) * 1.4;
      this.pos[j + 1] = car.pos.y + 0.3;
      this.pos[j + 2] = car.pos.z + back.z + (Math.random() - 0.5) * 1.4;
      this.vel[j] = (Math.random() - 0.5) * 2.5;
      this.vel[j + 1] = Math.random() * 2 + 1;
      this.vel[j + 2] = (Math.random() - 0.5) * 2.5;
      this.life[i] = 1.0;
    }
  }

  update(car, dt) {
    const moving = car.speed > 4;
    const emit = moving
      ? Math.floor(car.driftFactor * 7 + (car.boost.active ? 5 : 0))
      : 0;
    if (emit > 0) this._spawn(emit, car);

    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      const j = i * 3;
      this.life[i] -= dt * 0.8;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      this.vel[j + 1] -= 3 * dt; // gravity settle
      if (this.life[i] <= 0) this.pos[j + 1] = -9999;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
