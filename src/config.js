// Central tuning constants for the arcade feel. Tweak here.

export const CONFIG = {
  // --- longitudinal (forward/back) ---
  ENGINE_ACCEL: 30,     // m/s^2 at full throttle
  BRAKE_ACCEL: 48,      // m/s^2 when braking against motion
  REVERSE_ACCEL: 14,    // m/s^2 when reversing
  TOP_SPEED: 62,        // m/s (~223 km/h)
  MAX_REVERSE: 18,      // m/s reverse cap
  DRAG: 0.35,           // quadratic-ish air drag (per s)
  ROLL_RESIST: 3.0,     // linear coast-down (per s)

  // --- steering / grip ---
  STEER_MAX: 2.7,          // rad/s max yaw at low speed
  STEER_SPEEDFALLOFF: 42,  // higher = keeps agility at speed
  GRIP: 6.5,               // lateral velocity kill rate (higher = grippier)
  DRIFT_GRIP: 1.7,         // reduced grip while drifting
  DRIFT_SPEED_MIN: 26,     // min speed (m/s) to auto-drift on hard steer
  PIVOT_SPEED: 6,          // below this, steering authority ramps down

  // --- nitro ---
  BOOST_TOP_MULT: 1.6,     // top speed multiplier while boosting
  BOOST_ACC_MULT: 1.9,     // acceleration multiplier while boosting
  BOOST_DRAIN: 0.5,        // meter/s while held (2s from full)
  BOOST_RECHARGE: 0.16,    // meter/s while not boosting
  BOOST_MIN_TO_START: 0.12,// can't re-trigger below this

  // --- camera ---
  CAM_BACK: 9.0,
  CAM_UP: 4.2,
  CAM_LOOKAHEAD: 9,
  CAM_DAMP: 0.0006,        // follow damping (lower = laggier)
  BASE_FOV: 68,
  FOV_SPEED_KICK: 16,
  FOV_BOOST_KICK: 14,

  // --- car ---
  GROUND_CLEARANCE: 0.35,  // lift so the chassis rides on the sand

  // --- world ---
  GROUND_SIZE: 900,
  GROUND_SEG: 240,
  FOG_NEAR: 70,
  FOG_FAR: 520,

  // --- race ---
  NUM_CHECKPOINTS: 12,
  CHECKPOINT_RADIUS: 16,
  TOTAL_LAPS: 3,
  TRACK_WIDTH: 14,         // half-width of drivable road
  OFFROAD_DRAG: 8,         // extra drag when off the track surface
};
