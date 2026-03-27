# GPU Gems 3 Ch. 32 — Broad-Phase Collision Detection

## What it is
NVIDIA's canonical algorithm for GPU broad-phase collision detection using spatial hashing and parallel radix sort. From GPU Gems 3 (2007), still the foundation most implementations build on.

## Source
https://developer.nvidia.com/gpugems/gpugems3/part-v-physics-simulation/chapter-32-broad-phase-collision-detection-cuda

## The algorithm

### Phase 1: Cell ID construction
- One thread per object
- Compute home cell (H) from centroid spatial hash
- Compute up to 2^d-1 phantom cells (P) where bounding volume overlaps neighboring cells
- Store (cellID, objectID) pairs with control bits

### Phase 2: Parallel radix sort
- Sort (cellID, objectID) array by cellID
- 4 passes for 32-bit keys, each pass:
  1. Setup & tabulation: count radix occurrences (256 threads, 12 groups/block)
  2. Radix summation: parallel prefix sums
  3. Reordering: scatter to output

### Phase 3: Collision cell list creation
- Scan sorted array for cell ID transitions
- Parallel prefix sum for offsets
- Record: start position, H count, P count per cell

### Phase 4: Collision testing
- One thread per collision cell
- Test H objects against all H+P objects in same cell
- Control bit AND operations prevent duplicate pair tests across passes

### Duplicate prevention
Each object has control bits encoding which cells it spans. When testing a pair, check if the pair shares a cell with a lower-type home cell — if so, that cell will handle the test. Elegant bit-twiddling avoidance of redundant work.

## Performance
- 30,720 objects: 79 fps (450M candidate pairs → 203K actual pairs)
- 26x faster than CPU implementation
- Sort and traversal are the bottlenecks

## Comparison with simpler grid approach (Unity GPU Physics)

| | Sort-based (GPU Gems) | Grid-based (Unity) |
|---|---|---|
| Complexity | Higher — radix sort + prefix sums | Lower — atomic insert to fixed grid |
| Missed collisions | None | Possible if >4 objects per cell |
| Memory | Proportional to objects | Proportional to grid volume |
| Better for | Dense scenes, many objects per cell | Sparse scenes, uniform distribution |

## What we should adopt
- Home cell + phantom cell concept for objects spanning multiple cells
- Control bits for duplicate prevention (important for correctness)

## Recommended approach for our PoC
Start with the simpler grid approach (Unity style) for the proof-of-concept. Move to sort-based if we hit the 4-per-cell limit in practice. The sort-based approach is strictly superior but significantly more code.
