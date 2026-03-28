import RAPIER from "@dimforge/rapier3d-deterministic";

export default {
  title: "Tickets/feat-ESE-0023/Validation/Rapier Micro Tests",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CANVAS_W = 600;
const CANVAS_H = 400;
const MARGIN = 40;

interface Check {
  label: string;
  pass: boolean;
}

interface TrajectoryPoint {
  x: number;
  y: number;
}

/**
 * Map world coordinates to canvas pixels.
 * worldBounds: { xMin, xMax, yMin, yMax }
 */
function worldToCanvas(
  wx: number,
  wy: number,
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
): { cx: number; cy: number } {
  const plotW = CANVAS_W - MARGIN * 2;
  const plotH = CANVAS_H - MARGIN * 2;
  const cx =
    MARGIN +
    ((wx - bounds.xMin) / (bounds.xMax - bounds.xMin || 1)) * plotW;
  // flip y — world up is canvas up
  const cy =
    MARGIN +
    (1 - (wy - bounds.yMin) / (bounds.yMax - bounds.yMin || 1)) * plotH;
  return { cx, cy };
}

function drawAxes(
  ctx: CanvasRenderingContext2D,
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
) {
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 1;
  ctx.beginPath();
  // x axis
  const left = worldToCanvas(bounds.xMin, 0, bounds);
  const right = worldToCanvas(bounds.xMax, 0, bounds);
  ctx.moveTo(left.cx, left.cy);
  ctx.lineTo(right.cx, right.cy);
  // y axis
  const bottom = worldToCanvas(0, bounds.yMin, bounds);
  const top = worldToCanvas(0, bounds.yMax, bounds);
  ctx.moveTo(bottom.cx, bottom.cy);
  ctx.lineTo(top.cx, top.cy);
  ctx.stroke();

  // labels
  ctx.fillStyle = "#888";
  ctx.font = "11px monospace";
  ctx.fillText(`x:[${bounds.xMin},${bounds.xMax}]`, MARGIN, CANVAS_H - 6);
  ctx.fillText(
    `y:[${bounds.yMin},${bounds.yMax}]`,
    CANVAS_W - MARGIN - 100,
    CANVAS_H - 6,
  );
}

function drawTrajectories(
  ctx: CanvasRenderingContext2D,
  trajectories: TrajectoryPoint[][],
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  ballRadius: number,
) {
  const colors = [
    "#e74c3c",
    "#3498db",
    "#2ecc71",
    "#f39c12",
    "#9b59b6",
    "#1abc9c",
    "#e67e22",
    "#2c3e50",
    "#d35400",
    "#8e44ad",
  ];
  const radiusPx = Math.max(
    2,
    (ballRadius / ((bounds.yMax - bounds.yMin) || 1)) * (CANVAS_H - MARGIN * 2),
  );

  for (let i = 0; i < trajectories.length; i++) {
    const traj = trajectories[i];
    const color = colors[i % colors.length];

    // trajectory dots (faded)
    ctx.fillStyle = color + "44";
    for (const pt of traj) {
      const { cx, cy } = worldToCanvas(pt.x, pt.y, bounds);
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // final position (solid circle)
    if (traj.length > 0) {
      const last = traj[traj.length - 1];
      const { cx, cy } = worldToCanvas(last.x, last.y, bounds);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

function drawFloor(
  ctx: CanvasRenderingContext2D,
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
) {
  const left = worldToCanvas(bounds.xMin, 0, bounds);
  const right = worldToCanvas(bounds.xMax, 0, bounds);
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 3]);
  ctx.beginPath();
  ctx.moveTo(left.cx, left.cy);
  ctx.lineTo(right.cx, right.cy);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawChecks(container: HTMLElement, checks: Check[]) {
  const div = document.createElement("div");
  div.style.fontFamily = "monospace";
  div.style.fontSize = "13px";
  div.style.marginTop = "8px";
  for (const c of checks) {
    const line = document.createElement("div");
    line.textContent = `${c.pass ? "PASS" : "FAIL"} ${c.label}`;
    line.style.color = c.pass ? "#2ecc71" : "#e74c3c";
    line.style.fontWeight = c.pass ? "normal" : "bold";
    div.appendChild(line);
  }
  container.appendChild(div);
}

function createCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  canvas.style.background = "#1a1a2e";
  canvas.style.borderRadius = "4px";
  return canvas;
}

/** Deterministic pseudo-random using a seed. */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const SingleBallDrop = {
  render: () => {
    const container = document.createElement("div");
    const canvas = createCanvas();
    container.appendChild(canvas);

    const RADIUS = 0.2;
    const STEPS = 120;
    const DT = 1 / 60;
    const SAMPLE_INTERVAL = 10;

    (async () => {
      await RAPIER.init();

      const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      world.timestep = DT;

      // Floor
      const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(10, 0.1, 10).setRestitution(0.1),
        floorBody,
      );

      // Ball
      const ballBodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(
        0,
        5,
        0,
      );
      const ballBody = world.createRigidBody(ballBodyDesc);
      world.createCollider(
        RAPIER.ColliderDesc.ball(RADIUS).setRestitution(0.1),
        ballBody,
      );

      const trajectory: TrajectoryPoint[] = [];

      for (let i = 0; i < STEPS; i++) {
        world.step();
        if (i % SAMPLE_INTERVAL === 0) {
          const pos = ballBody.translation();
          trajectory.push({ x: pos.x, y: pos.y });
        }
      }

      const finalPos = ballBody.translation();
      trajectory.push({ x: finalPos.x, y: finalPos.y });

      // Draw
      const bounds = { xMin: -2, xMax: 2, yMin: -0.5, yMax: 6 };
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      drawFloor(ctx, bounds);
      drawAxes(ctx, bounds);
      drawTrajectories(ctx, [trajectory], bounds, RADIUS);

      // Checks
      const checks: Check[] = [
        {
          label: `Final y = ${finalPos.y.toFixed(3)} (expected near ${RADIUS + 0.1})`,
          pass: Math.abs(finalPos.y - (RADIUS + 0.1)) < 0.15,
        },
        {
          label: `Ball settled (y < 1.0)`,
          pass: finalPos.y < 1.0,
        },
      ];
      drawChecks(container, checks);

      world.free();
    })();

    return container;
  },
};

export const TwoBallsStack = {
  render: () => {
    const container = document.createElement("div");
    const canvas = createCanvas();
    container.appendChild(canvas);

    const RADIUS = 0.2;
    const STEPS = 300;
    const DT = 1 / 60;
    const SAMPLE_INTERVAL = 10;

    (async () => {
      await RAPIER.init();

      const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      world.timestep = DT;

      // Floor
      const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(10, 0.1, 10).setRestitution(0.1),
        floorBody,
      );

      // Ball A — resting near floor
      const ballADesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(
        0,
        0.5,
        0,
      );
      const ballA = world.createRigidBody(ballADesc);
      world.createCollider(
        RAPIER.ColliderDesc.ball(RADIUS).setRestitution(0.1),
        ballA,
      );

      // Ball B — dropped from above
      const ballBDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(
        0,
        1.5,
        0,
      );
      const ballB = world.createRigidBody(ballBDesc);
      world.createCollider(
        RAPIER.ColliderDesc.ball(RADIUS).setRestitution(0.1),
        ballB,
      );

      const trajA: TrajectoryPoint[] = [];
      const trajB: TrajectoryPoint[] = [];

      for (let i = 0; i < STEPS; i++) {
        world.step();
        if (i % SAMPLE_INTERVAL === 0) {
          const pA = ballA.translation();
          trajA.push({ x: pA.x, y: pA.y });
          const pB = ballB.translation();
          trajB.push({ x: pB.x, y: pB.y });
        }
      }

      const finalA = ballA.translation();
      const finalB = ballB.translation();
      trajA.push({ x: finalA.x, y: finalA.y });
      trajB.push({ x: finalB.x, y: finalB.y });

      // Draw
      const bounds = { xMin: -2, xMax: 2, yMin: -0.5, yMax: 3 };
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      drawFloor(ctx, bounds);
      drawAxes(ctx, bounds);
      drawTrajectories(ctx, [trajA, trajB], bounds, RADIUS);

      // Sort by y so lower is A, upper is B
      const [lower, upper] =
        finalA.y < finalB.y ? [finalA, finalB] : [finalB, finalA];

      const expectedLower = RADIUS + 0.1; // ball center when on floor (floor halfY=0.1)
      const expectedUpper = expectedLower + RADIUS * 2; // stacked on top

      const checks: Check[] = [
        {
          label: `Lower ball y = ${lower.y.toFixed(3)} (expected near ${expectedLower.toFixed(2)})`,
          pass: Math.abs(lower.y - expectedLower) < 0.2,
        },
        {
          label: `Upper ball y = ${upper.y.toFixed(3)} (expected near ${expectedUpper.toFixed(2)})`,
          pass: Math.abs(upper.y - expectedUpper) < 0.3,
        },
        {
          label: `Both settled (y < 2.0)`,
          pass: finalA.y < 2.0 && finalB.y < 2.0,
        },
      ];
      drawChecks(container, checks);

      world.free();
    })();

    return container;
  },
};

export const TenBallsSettle = {
  render: () => {
    const container = document.createElement("div");
    const canvas = createCanvas();
    container.appendChild(canvas);

    const RADIUS = 0.2;
    const STEPS = 600;
    const DT = 1 / 60;
    const SAMPLE_INTERVAL = 10;
    const NUM_BALLS = 10;

    (async () => {
      await RAPIER.init();

      const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      world.timestep = DT;

      // Floor
      const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(10, 0.1, 10).setRestitution(0.1),
        floorBody,
      );

      const rng = seededRandom(42);

      const bodies: RAPIER.RigidBody[] = [];
      const trajectories: TrajectoryPoint[][] = [];

      for (let i = 0; i < NUM_BALLS; i++) {
        const startY = 1 + rng() * 9; // y in [1, 10]
        const startX = (rng() - 0.5) * 4; // x in [-2, 2]
        const desc = RAPIER.RigidBodyDesc.dynamic().setTranslation(
          startX,
          startY,
          0,
        );
        const body = world.createRigidBody(desc);
        world.createCollider(
          RAPIER.ColliderDesc.ball(RADIUS).setRestitution(0.1),
          body,
        );
        bodies.push(body);
        trajectories.push([]);
      }

      for (let i = 0; i < STEPS; i++) {
        world.step();
        if (i % SAMPLE_INTERVAL === 0) {
          for (let b = 0; b < bodies.length; b++) {
            const pos = bodies[b].translation();
            trajectories[b].push({ x: pos.x, y: pos.y });
          }
        }
      }

      // Record final positions
      const finalPositions = bodies.map((b) => b.translation());
      for (let b = 0; b < bodies.length; b++) {
        trajectories[b].push({
          x: finalPositions[b].x,
          y: finalPositions[b].y,
        });
      }

      // Draw
      const bounds = { xMin: -4, xMax: 4, yMin: -0.5, yMax: 11 };
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      drawFloor(ctx, bounds);
      drawAxes(ctx, bounds);
      drawTrajectories(ctx, trajectories, bounds, RADIUS);

      // Checks
      const allSettled = finalPositions.every((p) => p.y < 1.0);
      const maxY = Math.max(...finalPositions.map((p) => p.y));

      const checks: Check[] = [
        {
          label: `All balls y < 1.0 (max y = ${maxY.toFixed(3)})`,
          pass: allSettled,
        },
        {
          label: `All ${NUM_BALLS} balls present`,
          pass: finalPositions.length === NUM_BALLS,
        },
      ];
      drawChecks(container, checks);

      world.free();
    })();

    return container;
  },
};

export const HundredBallsPile = {
  render: () => {
    const container = document.createElement("div");
    const canvas = createCanvas();
    container.appendChild(canvas);

    const RADIUS = 0.2;
    const STEPS = 600;
    const DT = 1 / 60;
    const SAMPLE_INTERVAL = 10;
    const NUM_BALLS = 100;

    (async () => {
      await RAPIER.init();

      const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      world.timestep = DT;

      // Floor
      const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(10, 0.1, 10).setRestitution(0.1),
        floorBody,
      );

      const rng = seededRandom(123);

      const bodies: RAPIER.RigidBody[] = [];
      const trajectories: TrajectoryPoint[][] = [];

      for (let i = 0; i < NUM_BALLS; i++) {
        const startY = 1 + rng() * 19; // y in [1, 20]
        const startX = (rng() - 0.5) * 6; // x in [-3, 3]
        const desc = RAPIER.RigidBodyDesc.dynamic().setTranslation(
          startX,
          startY,
          0,
        );
        const body = world.createRigidBody(desc);
        world.createCollider(
          RAPIER.ColliderDesc.ball(RADIUS).setRestitution(0.1),
          body,
        );
        bodies.push(body);
        trajectories.push([]);
      }

      for (let i = 0; i < STEPS; i++) {
        world.step();
        if (i % SAMPLE_INTERVAL === 0) {
          for (let b = 0; b < bodies.length; b++) {
            const pos = bodies[b].translation();
            trajectories[b].push({ x: pos.x, y: pos.y });
          }
        }
      }

      // Record final positions
      const finalPositions = bodies.map((b) => b.translation());
      for (let b = 0; b < bodies.length; b++) {
        trajectories[b].push({
          x: finalPositions[b].x,
          y: finalPositions[b].y,
        });
      }

      // Draw
      const bounds = { xMin: -6, xMax: 6, yMin: -0.5, yMax: 22 };
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      drawFloor(ctx, bounds);
      drawAxes(ctx, bounds);
      drawTrajectories(ctx, trajectories, bounds, RADIUS);

      // Checks
      const allBelowY5 = finalPositions.every((p) => p.y < 5);
      const allInXBounds = finalPositions.every(
        (p) => p.x >= -5 && p.x <= 5,
      );
      const maxY = Math.max(...finalPositions.map((p) => p.y));
      const maxAbsX = Math.max(...finalPositions.map((p) => Math.abs(p.x)));

      const checks: Check[] = [
        {
          label: `All balls y < 5 (max y = ${maxY.toFixed(3)})`,
          pass: allBelowY5,
        },
        {
          label: `All balls |x| < 5 (max |x| = ${maxAbsX.toFixed(3)})`,
          pass: allInXBounds,
        },
        {
          label: `All ${NUM_BALLS} balls present`,
          pass: finalPositions.length === NUM_BALLS,
        },
      ];
      drawChecks(container, checks);

      world.free();
    })();

    return container;
  },
};
