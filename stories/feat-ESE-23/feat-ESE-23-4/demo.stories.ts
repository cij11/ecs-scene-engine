import RAPIER from "@dimforge/rapier3d-deterministic";

export default {
  title: "Tickets/feat-ESE-0023/feat-ESE-0023-04 Demo: 500 spheres settling flat under gravity/Demo",
};

export const Demo = {
  render: () => {
    const container = document.createElement("div");
    container.style.cssText = "position: relative; width: 600px; height: 600px; background: #111;";

    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 600;
    container.appendChild(canvas);

    const hud = document.createElement("div");
    hud.style.cssText =
      "position: absolute; top: 8px; left: 8px; font-family: monospace; font-size: 13px; color: #0f0; line-height: 1.5;";
    container.appendChild(hud);

    const ctx = canvas.getContext("2d")!;

    setTimeout(() => {
      const world = new RAPIER.World(new RAPIER.Vector3(0, -9.81, 0));

      // --- Floor: fixed body with cuboid collider ---
      const floorBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0);
      const floorBody = world.createRigidBody(floorBodyDesc);
      const floorCollider = RAPIER.ColliderDesc.cuboid(50, 0.1, 50).setRestitution(0.1);
      world.createCollider(floorCollider, floorBody);

      // --- Dynamic sphere bodies ---
      const bodies: RAPIER.RigidBody[] = [];
      const TARGET_COUNT = 20_000;
      const INITIAL_BATCH = 5000;
      const GROWTH_BATCH = 5000;
      const MIN_FPS = 20;

      function spawnBatch(count: number) {
        for (let i = 0; i < count; i++) {
          const x = (Math.random() - 0.5) * 20; // [-10, 10]
          const z = (Math.random() - 0.5) * 20;
          const y = 0.5 + Math.random() * 10; // [0.5, 10.5] — lower drop for faster settling

          const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z);
          const rb = world.createRigidBody(bodyDesc);

          const colliderDesc = RAPIER.ColliderDesc.ball(0.2)
            .setRestitution(0.1)
            .setMass(1.0);
          world.createCollider(colliderDesc, rb);

          bodies.push(rb);
        }
      }

      // Initial batch
      spawnBatch(INITIAL_BATCH);

      // --- Simulation loop ---
      let running = true;
      let lastTime = performance.now();
      let fps = 60;
      let frameTime = 0;
      let growthStopped = false;
      let growthStopTime = 0;
      const SETTLE_DURATION = 30_000; // 30 seconds after growth stops to settle at low fps

      // Growth timer: add bodies every second
      let lastGrowthTime = performance.now();

      function tick() {
        if (!running) return;

        const now = performance.now();
        const dt = now - lastTime;
        lastTime = now;
        frameTime = dt;
        fps = 1000 / dt;

        // Growth logic
        if (!growthStopped) {
          if (now - lastGrowthTime >= 1000) {
            lastGrowthTime = now;

            if (bodies.length >= TARGET_COUNT || fps < MIN_FPS) {
              growthStopped = true;
              growthStopTime = now;
            } else {
              const remaining = TARGET_COUNT - bodies.length;
              const batch = Math.min(GROWTH_BATCH, remaining);
              spawnBatch(batch);
            }
          }
        }

        // Exit condition: 10s after growth stops
        if (growthStopped && now - growthStopTime > SETTLE_DURATION) {
          running = false;
          hud.textContent =
            `DONE | Bodies: ${bodies.length} | Final FPS: ${fps.toFixed(1)}`;
          return;
        }

        // Step physics
        world.step();

        // --- Render: SIDE VIEW Canvas2D (X vs Y plane) ---
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, 600, 600);

        // Map world: x=[-15,15] → canvas x=[0,600], y=[-1,30] → canvas y=[600,0] (flip Y)
        const scaleX = 600 / 30;
        const scaleY = 600 / 31;
        const offsetX = 300;

        // Draw floor line
        ctx.strokeStyle = "#555";
        ctx.lineWidth = 1;
        const floorY = 600 - (0 + 1) * scaleY; // y=0 in world
        ctx.beginPath();
        ctx.moveTo(0, floorY);
        ctx.lineTo(600, floorY);
        ctx.stroke();

        ctx.fillStyle = "#e87b35"; // orange
        for (let i = 0; i < bodies.length; i++) {
          const t = bodies[i]!.translation();
          const sx = t.x * scaleX + offsetX;
          const sy = 600 - (t.y + 1) * scaleY; // flip Y, offset by 1 for floor visibility
          const sr = Math.max(0.2 * scaleX, 1);

          ctx.beginPath();
          ctx.arc(sx, sy, sr, 0, Math.PI * 2);
          ctx.fill();
        }

        // HUD
        const status = growthStopped
          ? `SETTLING (${((now - growthStopTime) / 1000).toFixed(1)}s / 10s)`
          : "GROWING";
        hud.innerHTML =
          `Bodies: ${bodies.length}<br>` +
          `FPS: ${fps.toFixed(1)}<br>` +
          `Frame: ${frameTime.toFixed(1)} ms<br>` +
          `Status: ${status}`;

        requestAnimationFrame(tick);
      }

      requestAnimationFrame(tick);
    }, 0);

    return container;
  },
};
