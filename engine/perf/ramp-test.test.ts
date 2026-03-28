import { describe, it, expect, vi } from "vitest";
import { createFpsMeter, createRampController, type RampTestConfig } from "./ramp-test.js";

describe("createFpsMeter", () => {
  it("returns initial FPS before any frames", () => {
    const meter = createFpsMeter(10, 60);
    expect(meter.currentFps()).toBe(60);
  });

  it("returns undefined until the sample window is full", () => {
    const meter = createFpsMeter(5, 60);
    for (let i = 0; i < 4; i++) {
      expect(meter.pushFrame(16.67)).toBeUndefined();
    }
    // 5th frame should produce a result
    const fps = meter.pushFrame(16.67);
    expect(fps).toBeDefined();
  });

  it("calculates FPS correctly from frame times", () => {
    const meter = createFpsMeter(5, 60);
    // 5 frames at exactly 10ms each = 100 fps
    for (let i = 0; i < 4; i++) {
      meter.pushFrame(10);
    }
    const fps = meter.pushFrame(10);
    expect(fps).toBeCloseTo(100, 1);
    expect(meter.currentFps()).toBeCloseTo(100, 1);
  });

  it("calculates FPS correctly for varying frame times", () => {
    const meter = createFpsMeter(4, 60);
    // Average of [10, 20, 30, 40] = 25ms per frame = 40 fps
    meter.pushFrame(10);
    meter.pushFrame(20);
    meter.pushFrame(30);
    const fps = meter.pushFrame(40);
    expect(fps).toBeCloseTo(40, 1);
  });

  it("resets accumulated samples", () => {
    const meter = createFpsMeter(3, 60);
    meter.pushFrame(10);
    meter.pushFrame(10);
    meter.reset();
    // After reset, need 3 more frames to get a reading
    expect(meter.pushFrame(20)).toBeUndefined();
    expect(meter.pushFrame(20)).toBeUndefined();
    const fps = meter.pushFrame(20);
    expect(fps).toBeCloseTo(50, 1);
  });

  it("resets FPS to initial value on reset", () => {
    const meter = createFpsMeter(2, 75);
    meter.pushFrame(10);
    meter.pushFrame(10); // now fps = 100
    expect(meter.currentFps()).toBeCloseTo(100, 1);
    meter.reset();
    expect(meter.currentFps()).toBe(75);
  });

  it("handles zero-duration frames gracefully", () => {
    const meter = createFpsMeter(2, 60);
    meter.pushFrame(0);
    const fps = meter.pushFrame(0);
    // 0ms frames should clamp to 999
    expect(fps).toBe(999);
  });

  it("starts a new window after each computation", () => {
    const meter = createFpsMeter(2, 60);
    // First window: 10ms avg = 100fps
    meter.pushFrame(10);
    meter.pushFrame(10);
    expect(meter.currentFps()).toBeCloseTo(100, 1);
    // Second window: 50ms avg = 20fps
    meter.pushFrame(50);
    const fps = meter.pushFrame(50);
    expect(fps).toBeCloseTo(20, 1);
  });
});

describe("createRampController", () => {
  function makeConfig(overrides: Partial<RampTestConfig> = {}): RampTestConfig {
    return {
      name: "test",
      fpsThreshold: 40,
      initialValue: 10,
      increment: 10,
      stepIntervalMs: 100,
      warmupMs: 0, // No warmup for most tests
      sampleWindow: 2, // Small window for fast tests
      onStep: vi.fn(),
      onComplete: vi.fn(),
      ...overrides,
    };
  }

  it("calls onStep with initialValue immediately", () => {
    const onStep = vi.fn();
    createRampController(makeConfig({ onStep }));
    expect(onStep).toHaveBeenCalledWith(10);
  });

  it("increments value after stepIntervalMs", () => {
    const onStep = vi.fn();
    const ctrl = createRampController(makeConfig({ onStep, stepIntervalMs: 100 }));

    // Simulate frames at 60fps (16.67ms) for 110ms
    // FPS meter has window of 2, so after 2 frames it computes FPS
    for (let i = 0; i < 7; i++) {
      ctrl.tick(16.67);
    }
    // After ~116ms (7 * 16.67), should have stepped once
    expect(onStep).toHaveBeenCalledWith(20);
  });

  it("stops when FPS drops below threshold", () => {
    const onStep = vi.fn();
    const ctrl = createRampController(
      makeConfig({
        onStep,
        fpsThreshold: 40,
        stepIntervalMs: 50,
        sampleWindow: 2,
      }),
    );

    // Simulate fast frames to get past first step
    // Tick 1: warmup (warmupMs=0, transitions out immediately)
    ctrl.tick(10);
    // Ticks 2-6: measuring phase at ~100fps
    ctrl.tick(10);
    ctrl.tick(10);
    ctrl.tick(10);
    ctrl.tick(10);
    const result1 = ctrl.tick(10); // step timer hits 50ms, increments, still above threshold
    expect(result1).toBe("continue");

    // Now simulate very slow frames (50ms each = 20fps, well below 40fps threshold).
    // First tick completes a meter window that straddles fast/slow (10ms + 50ms = avg 30ms = ~33fps).
    // That's below 40, so the sudden-drop check should fire.
    ctrl.tick(50);
    ctrl.tick(50); // meter completes window: avg(10, 50) = 30ms = 33fps < 40 threshold

    // The sudden-drop check fires when newFps is below threshold
    const finalResult = ctrl.getResult();
    expect(finalResult.fpsAtThreshold).toBeLessThan(40);
  });

  it("stops when maxValue is reached", () => {
    const ctrl = createRampController(
      makeConfig({
        initialValue: 1,
        increment: 1,
        maxValue: 3,
        stepIntervalMs: 20,
        sampleWindow: 2,
      }),
    );

    // Simulate fast frames — FPS will stay high
    // Need to tick enough to cross multiple step boundaries
    for (let i = 0; i < 100; i++) {
      const status = ctrl.tick(5); // 200fps, way above threshold
      if (status === "complete") {
        const result = ctrl.getResult();
        expect(result.reachedMax).toBe(true);
        expect(result.finalValue).toBeLessThanOrEqual(3);
        return;
      }
    }
    // Should have completed by now
    expect.unreachable("Test should have completed due to maxValue");
  });

  it("respects warmup period", () => {
    const onStep = vi.fn();
    const ctrl = createRampController(
      makeConfig({
        onStep,
        warmupMs: 100,
        stepIntervalMs: 50,
        sampleWindow: 2,
      }),
    );

    // During warmup, step timer should not advance
    const callCountAfterInit = onStep.mock.calls.length; // 1 for initialValue
    for (let i = 0; i < 5; i++) {
      ctrl.tick(10); // 50ms total, still in warmup
    }
    // Should not have called onStep again during warmup
    expect(onStep.mock.calls.length).toBe(callCountAfterInit);

    // Finish warmup
    for (let i = 0; i < 6; i++) {
      ctrl.tick(10); // 110ms > 100ms warmup
    }

    // Now step timer should be active — tick past stepIntervalMs
    for (let i = 0; i < 8; i++) {
      ctrl.tick(10);
    }
    // Should have stepped to next value
    expect(onStep).toHaveBeenCalledWith(20);
  });

  it("calls onFrame callback each frame", () => {
    const onFrame = vi.fn();
    const ctrl = createRampController(
      makeConfig({
        onFrame,
        warmupMs: 0,
        sampleWindow: 2,
      }),
    );

    ctrl.tick(16); // tick 1: warmup phase (warmupMs=0 transitions out after this tick)
    ctrl.tick(16); // tick 2: measuring phase
    ctrl.tick(16); // tick 3: measuring phase

    expect(onFrame).toHaveBeenCalledTimes(3);
    // First tick is processed in warmup phase before transitioning out
    expect(onFrame.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        currentValue: 10,
        isWarmup: true,
      }),
    );
    // Subsequent ticks are in measuring phase
    expect(onFrame.mock.calls[1]![0]).toEqual(
      expect.objectContaining({
        currentValue: 10,
        isWarmup: false,
      }),
    );
  });

  it("records samples at each step", () => {
    const ctrl = createRampController(
      makeConfig({
        initialValue: 1,
        increment: 1,
        stepIntervalMs: 20,
        sampleWindow: 2,
        fpsThreshold: 10, // Low threshold so we don't stop early
      }),
    );

    // Tick fast frames to pass several steps
    for (let i = 0; i < 50; i++) {
      const status = ctrl.tick(5);
      if (status === "complete") break;
    }

    const result = ctrl.getResult();
    expect(result.samples.length).toBeGreaterThan(1);
    // Samples should have increasing values
    for (let i = 1; i < result.samples.length; i++) {
      expect(result.samples[i]!.value).toBeGreaterThanOrEqual(result.samples[i - 1]!.value);
    }
  });

  it("reports elapsedMs in result", () => {
    const ctrl = createRampController(
      makeConfig({
        maxValue: 11,
        stepIntervalMs: 20,
        sampleWindow: 2,
      }),
    );

    for (let i = 0; i < 100; i++) {
      const status = ctrl.tick(5);
      if (status === "complete") break;
    }

    const result = ctrl.getResult();
    expect(result.elapsedMs).toBeGreaterThan(0);
  });

  it("uses default config values", () => {
    const onStep = vi.fn();
    const onComplete = vi.fn();
    const ctrl = createRampController({
      name: "defaults-test",
      onStep,
      onComplete,
    });

    // Should have called onStep with default initialValue of 1
    expect(onStep).toHaveBeenCalledWith(1);

    const result = ctrl.getResult();
    expect(result.name).toBe("defaults-test");
  });

  it("does not exceed maxValue when incrementing", () => {
    const onStep = vi.fn();
    const ctrl = createRampController(
      makeConfig({
        initialValue: 8,
        increment: 5,
        maxValue: 10,
        stepIntervalMs: 20,
        sampleWindow: 2,
      }),
    );

    for (let i = 0; i < 100; i++) {
      const status = ctrl.tick(5);
      if (status === "complete") break;
    }

    // onStep should never have been called with a value > 10
    for (const call of onStep.mock.calls) {
      expect(call[0]).toBeLessThanOrEqual(10);
    }
  });
});
