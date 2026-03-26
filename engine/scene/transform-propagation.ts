/**
 * Transform propagation — offsets child world entity transforms
 * by the parent entity's world-space transform.
 *
 * Used by the view sync layer to position interior entities
 * in world space relative to their parent entity.
 */

export interface TransformData {
  px: number; py: number; pz: number;
  rx: number; ry: number; rz: number; rw: number;
  sx: number; sy: number; sz: number;
}

/**
 * Combine a parent transform with a local child transform.
 * Applies parent rotation to child position, then adds parent position.
 * Multiplies parent and child quaternions for rotation.
 * Multiplies scales.
 */
export function combineTransforms(
  parent: TransformData,
  local: TransformData,
): TransformData {
  // Rotate local position by parent quaternion
  const rotatedPos = rotateByQuaternion(
    local.px * parent.sx, local.py * parent.sy, local.pz * parent.sz,
    parent.rx, parent.ry, parent.rz, parent.rw,
  );

  // Combine quaternions (parent * local)
  const qr = multiplyQuaternions(
    parent.rx, parent.ry, parent.rz, parent.rw,
    local.rx, local.ry, local.rz, local.rw,
  );

  return {
    px: parent.px + rotatedPos.x,
    py: parent.py + rotatedPos.y,
    pz: parent.pz + rotatedPos.z,
    rx: qr.x, ry: qr.y, rz: qr.z, rw: qr.w,
    sx: parent.sx * local.sx,
    sy: parent.sy * local.sy,
    sz: parent.sz * local.sz,
  };
}

function rotateByQuaternion(
  vx: number, vy: number, vz: number,
  qx: number, qy: number, qz: number, qw: number,
): { x: number; y: number; z: number } {
  // q * v * q^-1 (optimised)
  const ix = qw * vx + qy * vz - qz * vy;
  const iy = qw * vy + qz * vx - qx * vz;
  const iz = qw * vz + qx * vy - qy * vx;
  const iw = -qx * vx - qy * vy - qz * vz;

  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  };
}

function multiplyQuaternions(
  ax: number, ay: number, az: number, aw: number,
  bx: number, by: number, bz: number, bw: number,
): { x: number; y: number; z: number; w: number } {
  return {
    x: aw * bx + ax * bw + ay * bz - az * by,
    y: aw * by + ay * bw + az * bx - ax * bz,
    z: aw * bz + az * bw + ax * by - ay * bx,
    w: aw * bw - ax * bx - ay * by - az * bz,
  };
}
