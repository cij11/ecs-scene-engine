/**
 * Dynamic ramp-up performance testing framework.
 *
 * Runs a test function each animation frame, increases a parameter over time,
 * measures real-world FPS using performance.now(), and stops when FPS drops
 * below a configurable threshold.
 *
 * Extracted from the pattern used in ESE-0020 GPU physics demos.
 */

/** Configuration for a ramp-up performance test. */
export interface RampTestConfig {
  /** Human-readable name for this test. */
  name: string;
  /** Stop when FPS drops below this value (default 40). */
  fpsThreshold?: number;
  /** Starting parameter value (default 1). */
  initialValue?: number;
  /** How much to increase the parameter per step (default 1). */
  increment?: number;
  /** Milliseconds between parameter increments (default 1000). */
  stepIntervalMs?: number;
  /** Milliseconds to wait before starting ramp-up, letting things stabilize (default 2000). */
  warmupMs?: number;
  /** Number of frame time samples to average for FPS calculation (default 10). */
  sampleWindow?: number;
  /** Maximum parameter value — stop even if FPS is still above threshold. */
  maxValue?: number;
  /**
   * Called each step to apply the new parameter value.
   * This is where you add objects, increase grid size, etc.
   */
  onStep: (value: number) => void;
  /** Called when the test completes (FPS dropped or maxValue reached). */
  onComplete: (result: RampTestResult) => void;
  /**
   * Optional: called each frame with current stats for live HUD updates.
   * Not called during warmup.
   */
  onFrame?: (stats: RampTestFrameStats) => void;
}

/** Result returned when a ramp test completes. */
export interface RampTestResult {
  /** Name from config. */
  name: string;
  /** Parameter value when FPS dropped below threshold (or maxValue). */
  finalValue: number;
  /** FPS measured at the final value. */
  fpsAtThreshold: number;
  /** Whether the test stopped due to reaching maxValue rather than FPS drop. */
  reachedMax: boolean;
  /** All recorded samples: parameter value and measured FPS at each step. */
  samples: RampTestSample[];
  /** Total wall-clock time of the test in milliseconds. */
  elapsedMs: number;
}

/** A single sample recorded at each step transition. */
export interface RampTestSample {
  value: number;
  fps: number;
}

/** Stats passed to onFrame callback each frame. */
export interface RampTestFrameStats {
  currentValue: number;
  currentFps: number;
  isWarmup: boolean;
  elapsedMs: number;
}

/** Handle returned by startRampTest to allow cancellation. */
export interface RampTestHandle {
  /** Cancel the running test. onComplete will NOT be called. */
  cancel: () => void;
}

/**
 * Internal state for testable FPS calculation logic.
 * Separated from animation frame concerns for unit testing.
 */
export interface FpsMeter {
  /** Push a frame duration in milliseconds. Returns new FPS if window is full, else undefined. */
  pushFrame: (durationMs: number) => number | undefined;
  /** Get the most recently computed FPS (or the initial value). */
  currentFps: () => number;
  /** Reset accumulated samples. */
  reset: () => void;
}

/**
 * Create an FPS meter that averages over a sliding window of frame times.
 *
 * @param sampleWindow - Number of frame times to average (default 10).
 * @param initialFps - Starting FPS value before first measurement (default 60).
 */
export function createFpsMeter(sampleWindow = 10, initialFps = 60): FpsMeter {
  let frameTimes: number[] = [];
  let fps = initialFps;

  return {
    pushFrame(durationMs: number): number | undefined {
      frameTimes.push(durationMs);
      if (frameTimes.length >= sampleWindow) {
        const avgMs = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        fps = avgMs > 0 ? 1000 / avgMs : 999;
        frameTimes = [];
        return fps;
      }
      return undefined;
    },
    currentFps(): number {
      return fps;
    },
    reset(): void {
      frameTimes = [];
      fps = initialFps;
    },
  };
}

/**
 * Internal state machine for the ramp-up logic.
 * Separated from requestAnimationFrame for unit testing.
 */
export interface RampController {
  /**
   * Called each frame with the frame duration in ms.
   * Returns 'continue' | 'complete' to indicate whether the test should keep running.
   */
  tick: (frameDurationMs: number) => "continue" | "complete";
  /** Get the current result (valid after 'complete' or for inspection). */
  getResult: () => RampTestResult;
}

/**
 * Create a ramp controller — the pure logic for ramp-up testing,
 * decoupled from requestAnimationFrame for testability.
 */
export function createRampController(config: RampTestConfig): RampController {
  const fpsThreshold = config.fpsThreshold ?? 40;
  const initialValue = config.initialValue ?? 1;
  const increment = config.increment ?? 1;
  const stepIntervalMs = config.stepIntervalMs ?? 1000;
  const warmupMs = config.warmupMs ?? 2000;
  const sampleWindow = config.sampleWindow ?? 10;
  const maxValue = config.maxValue ?? Infinity;

  const fpsMeter = createFpsMeter(sampleWindow);
  const samples: RampTestSample[] = [];

  let currentValue = initialValue;
  let warmupTimer = 0;
  let stepTimer = 0;
  let elapsed = 0;
  let reachedMax = false;
  let isWarmup = true;

  // Apply the initial value
  config.onStep(currentValue);

  return {
    tick(frameDurationMs: number): "continue" | "complete" {
      elapsed += frameDurationMs;

      // Warmup phase — let things stabilize before measuring
      if (isWarmup) {
        warmupTimer += frameDurationMs;
        fpsMeter.pushFrame(frameDurationMs);
        if (config.onFrame) {
          config.onFrame({
            currentValue,
            currentFps: fpsMeter.currentFps(),
            isWarmup: true,
            elapsedMs: elapsed,
          });
        }
        if (warmupTimer >= warmupMs) {
          isWarmup = false;
          fpsMeter.reset();
          // Record initial sample
          samples.push({ value: currentValue, fps: fpsMeter.currentFps() });
        }
        return "continue";
      }

      // Measure FPS
      const newFps = fpsMeter.pushFrame(frameDurationMs);

      if (config.onFrame) {
        config.onFrame({
          currentValue,
          currentFps: fpsMeter.currentFps(),
          isWarmup: false,
          elapsedMs: elapsed,
        });
      }

      // Accumulate step timer
      stepTimer += frameDurationMs;

      if (stepTimer >= stepIntervalMs) {
        stepTimer = 0;
        const currentFps = fpsMeter.currentFps();

        // Record sample at current value
        samples.push({ value: currentValue, fps: currentFps });

        // Check if FPS has dropped below threshold
        if (currentFps < fpsThreshold) {
          return "complete";
        }

        // Check if we've reached the max
        if (currentValue >= maxValue) {
          reachedMax = true;
          return "complete";
        }

        // Increment and apply
        currentValue = Math.min(currentValue + increment, maxValue);
        config.onStep(currentValue);
      }

      // Also check FPS on every measurement update (not just step boundaries)
      // so we catch sudden drops
      if (newFps !== undefined && newFps < fpsThreshold && !isWarmup && samples.length > 0) {
        samples.push({ value: currentValue, fps: newFps });
        return "complete";
      }

      return "continue";
    },

    getResult(): RampTestResult {
      const lastSample = samples[samples.length - 1];
      return {
        name: config.name,
        finalValue: lastSample?.value ?? currentValue,
        fpsAtThreshold: lastSample?.fps ?? fpsMeter.currentFps(),
        reachedMax,
        samples,
        elapsedMs: elapsed,
      };
    },
  };
}

/**
 * Start a ramp-up performance test using requestAnimationFrame.
 *
 * This is the main entry point for browser usage. It creates a ramp controller
 * and drives it with real animation frames.
 *
 * @returns A handle to cancel the test.
 */
export function startRampTest(config: RampTestConfig): RampTestHandle {
  const controller = createRampController(config);
  let cancelled = false;
  let lastFrameTime = performance.now();

  function frame(): void {
    if (cancelled) return;

    const now = performance.now();
    const dt = now - lastFrameTime;
    lastFrameTime = now;

    const status = controller.tick(dt);

    if (status === "complete") {
      config.onComplete(controller.getResult());
      return;
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  return {
    cancel(): void {
      cancelled = true;
    },
  };
}
