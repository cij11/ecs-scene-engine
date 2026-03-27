# Code Review: feat-ESE-0012-04 — Buffer sync: upload, dispatch, readback lifecycle

## Files reviewed
- `engine/gpu/sync.ts` (310 lines)
- `engine/gpu/sync.test.ts` (225 lines)

## Acceptance Criteria Check

| Criterion | Status | Notes |
|-----------|--------|-------|
| uploadBuffers() copies dirty CPU TypedArrays to GPU | PASS | Uploads only dirty components, clears dirty flags after |
| Upload includes intent components | PASS | Any ComponentDef in kernel.read is uploaded if dirty |
| dispatchKernel() creates encoder, pass, dispatches, submits | PASS | Full dispatch pipeline with index buffer + uniform upload |
| readbackBuffers() maps GPU buffers back to CPU | PASS | Async with staging buffer, mapAsync, copy, cleanup |
| createGpuSystem() wraps into SystemFn | PASS | Upload → dispatch in one call, registers write claims |
| GPU-authoritative skip readback | PASS | readbackBuffers checks gpuAuthoritative set |
| Intent zeroing after consumption | PASS | By design — GPU kernel zeroes intents in WGSL body |
| Unit tests | PASS | 9 tests covering upload, dirty tracking, createGpuSystem |

## Code Quality

**Strengths:**
- Clean separation: uploadBuffers, dispatchKernel, readbackBuffers are independent composable functions
- createGpuSystem ties them together but each can be used standalone for multi-pass scenarios
- Correct buffer usage flags: writable components get COPY_SRC for readback
- Graceful null handling: createGpuSystem returns null when gpu is null

**Minor observations (non-blocking):**
- readbackBuffers creates a new staging buffer per field per frame — could be pooled in future for perf
- dispatchKernel uses magic component IDs (-1, -2) for index/uniform buffers — works but could use named constants
- No test for readbackBuffers (requires async mock complexity) — covered at integration level
- Uniform data passed as raw ArrayBuffer — caller must pack correctly. Type-safe uniform builder could come later.

## Verdict
**PASS** — All acceptance criteria met. 9 tests, CI green (216 total). No issues blocking progression.
