import { describe, it, expect } from "vitest";
import { computeViewport } from "./aspect-ratio.js";

describe("computeViewport", () => {
  describe("stretch", () => {
    it("fills entire destination regardless of mismatch", () => {
      const vp = computeViewport(16 / 9, 1 / 2, "stretch");
      expect(vp).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    });
  });

  describe("letterbox", () => {
    it("wide camera on tall quad — bars top/bottom", () => {
      // Camera 16:9 (1.78), destination 1:2 (0.5)
      const vp = computeViewport(16 / 9, 1 / 2, "letterbox");

      expect(vp.x).toBeCloseTo(0);
      expect(vp.width).toBeCloseTo(1);
      // Height should be less than 1 (scaled down)
      expect(vp.height).toBeLessThan(1);
      // Bars should be symmetric
      expect(vp.y).toBeCloseTo((1 - vp.height) / 2);
    });

    it("square camera on wide quad — bars left/right", () => {
      // Camera 1:1, destination 2:1
      const vp = computeViewport(1, 2, "letterbox");

      expect(vp.y).toBeCloseTo(0);
      expect(vp.height).toBeCloseTo(1);
      // Width should be less than 1
      expect(vp.width).toBeCloseTo(0.5);
      // Bars symmetric
      expect(vp.x).toBeCloseTo(0.25);
    });

    it("is the default mode", () => {
      const vp = computeViewport(16 / 9, 1 / 2);
      const explicit = computeViewport(16 / 9, 1 / 2, "letterbox");
      expect(vp).toEqual(explicit);
    });
  });

  describe("truncate", () => {
    it("wide camera on tall quad — crops sides", () => {
      // Camera 16:9, destination 1:2
      const vp = computeViewport(16 / 9, 1 / 2, "truncate");

      expect(vp.y).toBeCloseTo(0);
      expect(vp.height).toBeCloseTo(1);
      // Width extends beyond 1 (cropped)
      expect(vp.width).toBeGreaterThan(1);
      // x is negative (cropped from left)
      expect(vp.x).toBeLessThan(0);
    });

    it("square camera on wide quad — crops top/bottom", () => {
      // Camera 1:1, destination 2:1
      const vp = computeViewport(1, 2, "truncate");

      expect(vp.x).toBeCloseTo(0);
      expect(vp.width).toBeCloseTo(1);
      // Height extends beyond 1
      expect(vp.height).toBeGreaterThan(1);
      // y is negative
      expect(vp.y).toBeLessThan(0);
    });
  });

  describe("no mismatch", () => {
    it("same aspect ratio — all modes produce full viewport", () => {
      const stretch = computeViewport(16 / 9, 16 / 9, "stretch");
      const letterbox = computeViewport(16 / 9, 16 / 9, "letterbox");
      const truncate = computeViewport(16 / 9, 16 / 9, "truncate");

      const full = { x: 0, y: 0, width: 1, height: 1 };
      expect(stretch).toEqual(full);
      expect(letterbox).toEqual(full);
      expect(truncate).toEqual(full);
    });
  });
});
