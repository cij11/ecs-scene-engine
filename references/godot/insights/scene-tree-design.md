## Key takeaways from Godot's scene tree

- SceneTree is a singleton MainLoop. Root is always a Window node.
- Nodes store children in a HashMap by name (O(1) lookup) with a separate sorted cache vector for ordered iteration.
- Parent and owner are separate concepts. Owner defines scene file boundaries for serialisation.
- Signals are point-to-point connections on Object, not Node. No automatic bubbling. Stored as HashMap<Callable, Slot> per signal.
- Lifecycle propagation is recursive tree walk: enter_tree is top-down, ready and exit_tree are bottom-up.
- Processing is NOT a tree traversal — it's a flat sorted list dispatch by priority. Nodes opt in via set_process(true).
- Scene serialisation uses flat integer-indexed arrays (SceneState). Tree is reconstructed at instantiation time.
- Deferred operations: queue_free() defers to delete queue, flushed at end of each tick. Per-group CallQueue for deferred method calls.
- Sub-scene instancing creates regular nodes — no live link to the source scene file.
- Optional multithreading via per-subtree ProcessGroup dispatch to WorkerThreadPool.
