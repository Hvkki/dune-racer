import * as THREE from 'three';
import { CONFIG } from './config.js';

// Smooth chase camera with speed-based FOV, boost kick, and screen shake.
export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.camera.fov = CONFIG.BASE_FOV;
    this.camera.updateProjectionMatrix();
    this._target = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._initialized = false;
  }

  // frame-rate-independent lerp factor
  static _damp(k, dt) { return 1 - Math.pow(k, dt); }

  snapTo(car) {
    const fwd = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
    this._target.copy(car.pos).addScaledVector(fwd, -CONFIG.CAM_BACK);
    this._target.y += CONFIG.CAM_UP;
    this.camera.position.copy(this._target);
    this._look.copy(car.pos).addScaledVector(fwd, CONFIG.CAM_LOOKAHEAD);
    this.camera.lookAt(this._look);
    this._initialized = true;
  }

  update(car, dt) {
    if (!this._initialized) { this.snapTo(car); return; }

    const fwd = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));

    // desired position behind + above
    this._target.copy(car.pos).addScaledVector(fwd, -CONFIG.CAM_BACK);
    this._target.y += CONFIG.CAM_UP;

    const s = ChaseCamera._damp(CONFIG.CAM_DAMP, dt);
    this.camera.position.lerp(this._target, s);

    // look ahead of the car
    this._look.copy(car.pos).addScaledVector(fwd, CONFIG.CAM_LOOKAHEAD);
    this.camera.lookAt(this._look);

    // speed + boost FOV
    const speedT = THREE.MathUtils.clamp(car.speed / CONFIG.TOP_SPEED, 0, 1);
    const targetFOV = CONFIG.BASE_FOV + speedT * CONFIG.FOV_SPEED_KICK + (car.boost.active ? CONFIG.FOV_BOOST_KICK : 0);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, ChaseCamera._damp(0.001, dt));
    this.camera.updateProjectionMatrix();

    // screen shake from boost + drift (recomputed each frame so it self-decays)
    const shakeAmp = (car.boost.active ? 0.12 : 0) + car.driftFactor * 0.09 * speedT;
    if (shakeAmp > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * shakeAmp;
      this.camera.position.y += (Math.random() - 0.5) * shakeAmp;
    }
  }
}
