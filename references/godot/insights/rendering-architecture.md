## Key takeaways from Godot's rendering architecture

- Scene tree and RenderingServer are completely separate. One-directional, push-based communication via RID-keyed API.
- Scene nodes own RIDs that identify server-side objects. Nodes push state changes (transforms, visibility, resources). The server never reads from nodes.
- VisualInstance3D creates an RID on construction, hooks into a Scenario on enter_tree, pushes transforms on transform_changed.
- The rendering server maintains a fully independent object graph: Instance, Scenario (with DynamicBVH spatial index), Camera, Viewport — all RID-owned.
- Cameras are attached to Viewports. Each Viewport has its own render target. SubViewport enables render-to-texture.
- ViewportTexture is a Texture2D proxy pointing at a viewport's render target — any mesh can use it as a material texture (mirrors, security cameras, etc.).
- Scene tree and rendering use the same coordinate system (right-handed, Y-up). No remapping at the boundary.
- Physics interpolation (FTI) pushes interpolated transforms to the server — same space, different time.
- The rendering server is thread-safe because it never reads from the scene tree.
