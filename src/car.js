import * as THREE from 'three';
import { CONFIG } from './config.js';

// Builds a low-poly car mesh and runs kinematic arcade physics.
export class Car {
  constructor(scene, heightFn) {
    this.heightFn = heightFn;
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.vel = new THREE.Vector3();
    this.driftFactor = 0;
    this.speed = 0;

    // nitro state
    this.boost = { meter: 1, active: false };

    this.mesh = this._buildMesh();
    scene.add(this.mesh);

    this._wheels = this.mesh.userData.wheels;
    this._boostFlames = this.mesh.userData.flames;
  }

  _buildMesh() {
    const car = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff5722, roughness: 0.4, metalness: 0.5 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.3 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x113355, roughness: 0.2, metalness: 0.7 });

    // main body
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 4.2), bodyMat);
    body.position.y = 0.7;
    body.castShadow = true;
    car.add(body);

    // lower chassis (wider, darker)
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 4.0), darkMat);
    chassis.position.y = 0.4;
    car.add(chassis);

    // cabin
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 1.9), bodyMat);
    cabin.position.set(0, 1.15, -0.2);
    cabin.castShadow = true;
    car.add(cabin);

    // windshield
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.7), glassMat);
    glass.position.set(0, 1.18, -0.2);
    car.add(glass);

    // rear spoiler
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.5), darkMat);
    spoiler.position.set(0, 1.15, 2.0);
    car.add(spoiler);
    for (const sx of [-0.8, 0.8]) {
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.15), darkMat);
      stand.position.set(sx, 0.95, 2.0);
      car.add(stand);
    }

    // wheels
    const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const wheels = [];
    const wx = 1.05, wz = 1.4;
    for (const [x, z] of [[-wx, wz], [wx, wz], [-wx, -wz], [wx, -wz]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(x, 0.5, z);
      w.castShadow = true;
      car.add(w);
      wheels.push(w);
    }

    // headlights
    for (const sx of [-0.6, 0.6]) {
      const hl = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.2, 0.1),
        new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffee88, emissiveIntensity: 0.6 })
      );
      hl.position.set(sx, 0.7, -2.1);
      car.add(hl);
    }

    // nitro flames (hidden unless boosting)
    const flames = [];
    for (const sx of [-0.5, 0.5]) {
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 1.4, 8),
        new THREE.MeshBasicMaterial({ color: 0x33bbff, transparent: true, opacity: 0.9, fog: false })
      );
      flame.rotation.x = -Math.PI / 2;
      flame.position.set(sx, 0.6, 2.4);
      flame.visible = false;
      car.add(flame);
      flames.push(flame);
    }

    car.userData.wheels = wheels;
    car.userData.flames = flames;
    return car;
  }

  reset(pos, heading) {
    this.pos.copy(pos);
    this.pos.y = this.heightFn(pos.x, pos.z);
    this.heading = heading;
    this.vel.set(0, 0, 0);
    this.driftFactor = 0;
    this.boost.meter = 1;
    this.boost.active = false;
  }

  _updateBoost(cmd, dt) {
    const b = this.boost;
    b.active = cmd.nitro && b.meter > 0 && (b.active || b.meter > CONFIG.BOOST_MIN_TO_START);
    if (b.active) {
      b.meter -= CONFIG.BOOST_DRAIN * dt;
      if (b.meter <= 0) { b.meter = 0; b.active = false; }
    } else {
      b.meter = Math.min(1, b.meter + CONFIG.BOOST_RECHARGE * dt);
    }
  }

  step(cmd, dt, track) {
    this._updateBoost(cmd, dt);

    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);

    let vForward = this.vel.dot(fwd);
    let vLateral = this.vel.dot(right);
    const speed = this.vel.length();

    // --- steering (inverse with speed, ramps down near standstill) ---
    const steerAuthority = CONFIG.STEER_MAX * (CONFIG.STEER_SPEEDFALLOFF / (CONFIG.STEER_SPEEDFALLOFF + speed));
    const moveFactor = THREE.MathUtils.clamp(speed / CONFIG.PIVOT_SPEED, 0, 1);
    const dir = vForward >= 0 ? 1 : -1;
    this.heading += cmd.steer * steerAuthority * dt * dir * moveFactor;

    // --- longitudinal ---
    const topNow = this.boost.active ? CONFIG.TOP_SPEED * CONFIG.BOOST_TOP_MULT : CONFIG.TOP_SPEED;
    const accelNow = this.boost.active ? CONFIG.ENGINE_ACCEL * CONFIG.BOOST_ACC_MULT : CONFIG.ENGINE_ACCEL;
    if (cmd.throttle) vForward += accelNow * dt;
    if (cmd.brake) vForward -= (vForward > 0 ? CONFIG.BRAKE_ACCEL : CONFIG.REVERSE_ACCEL) * dt;

    // drag + rolling resistance
    vForward -= vForward * CONFIG.DRAG * dt;
    vForward -= Math.sign(vForward) * CONFIG.ROLL_RESIST * dt;

    // off-road penalty
    if (track) {
      const d = track.distanceToTrack(this.pos.x, this.pos.z);
      if (d > CONFIG.TRACK_WIDTH) {
        vForward -= Math.sign(vForward) * CONFIG.OFFROAD_DRAG * dt;
      }
    }

    vForward = THREE.MathUtils.clamp(vForward, -CONFIG.MAX_REVERSE, topNow);

    // --- lateral grip / drift ---
    const drifting = cmd.handbrake || (Math.abs(cmd.steer) > 0 && speed > CONFIG.DRIFT_SPEED_MIN);
    const gripNow = drifting ? CONFIG.DRIFT_GRIP : CONFIG.GRIP;
    vLateral -= vLateral * Math.min(gripNow * dt, 1);

    // recompose velocity
    this.vel.copy(fwd).multiplyScalar(vForward).addScaledVector(right, vLateral);
    this.pos.addScaledVector(this.vel, dt);

    // stick to terrain height
    this.pos.y = this.heightFn(this.pos.x, this.pos.z);

    this.speed = this.vel.length();
    this.driftFactor = Math.abs(vLateral) / (this.speed + 0.001);

    this._applyToMesh(vLateral, vForward, dt);
  }

  _applyToMesh(vLateral, vForward, dt) {
    this.mesh.position.copy(this.pos);
    this.mesh.position.y += 0.0;
    this.mesh.rotation.y = this.heading;
    // visual lean into the drift
    this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, -vLateral * 0.015, 0.2);
    // slight pitch under accel/brake
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, -vForward * 0.0015, 0.15);

    // spin wheels based on forward speed
    const spin = vForward * dt * 2;
    for (const w of this._wheels) w.rotation.x += spin;
    // steer front wheels visually
    this._wheels[0].rotation.y = 0; // kept simple; body yaw conveys turning

    // nitro flames flicker
    for (const f of this._boostFlames) {
      f.visible = this.boost.active;
      if (this.boost.active) {
        f.scale.z = 0.7 + Math.random() * 0.6;
        f.material.color.setHex(Math.random() < 0.5 ? 0x33bbff : 0xffaa33);
      }
    }
  }
}
