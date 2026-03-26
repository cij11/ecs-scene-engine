/**
 * Three.js renderer — implements the Renderer interface.
 *
 * Uses WebGLRenderer (WebGPURenderer can be swapped in when stable).
 * Manages an internal Three.js Scene. Consumers interact only via
 * opaque RenderHandles.
 */

import * as THREE from "three";
import type {
  Renderer,
  RenderHandle,
  RenderObjectParams,
  RenderTransform,
} from "../renderer.js";

export class ThreeJSRenderer implements Renderer {
  private scene = new THREE.Scene();
  private threeRenderer: THREE.WebGLRenderer | null = null;
  private activeCamera: THREE.Camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

  private objects = new Map<RenderHandle, THREE.Object3D>();
  private cameras = new Map<RenderHandle, THREE.Camera>();
  private nextHandle: RenderHandle = 1;

  async init(target: HTMLElement): Promise<void> {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(target.clientWidth, target.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    target.appendChild(renderer.domElement);
    this.threeRenderer = renderer;

    this.scene.background = new THREE.Color(0x111111);
  }

  createObject(params: RenderObjectParams): RenderHandle {
    const handle = this.nextHandle++;
    let obj: THREE.Object3D;

    switch (params.type) {
      case "mesh": {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({
          color: params.color ?? 0x888888,
          roughness: params.roughness ?? 0.5,
          metalness: params.metalness ?? 0.0,
        });
        obj = new THREE.Mesh(geometry, material);
        break;
      }
      case "light": {
        switch (params.lightType) {
          case "directional":
            obj = new THREE.DirectionalLight(
              params.color ?? 0xffffff,
              params.intensity ?? 1,
            );
            break;
          case "spot": {
            const spot = new THREE.SpotLight(
              params.color ?? 0xffffff,
              params.intensity ?? 1,
            );
            if (params.angle !== undefined) spot.angle = params.angle;
            obj = spot;
            break;
          }
          case "ambient":
            obj = new THREE.AmbientLight(
              params.color ?? 0xffffff,
              params.intensity ?? 0.5,
            );
            break;
          case "point":
          default: {
            const point = new THREE.PointLight(
              params.color ?? 0xffffff,
              params.intensity ?? 1,
            );
            if (params.range !== undefined) point.distance = params.range;
            obj = point;
            break;
          }
        }
        break;
      }
      case "camera": {
        let cam: THREE.Camera;
        if (params.projection === "orthographic") {
          cam = new THREE.OrthographicCamera(-10, 10, 10, -10,
            params.near ?? 0.1,
            params.far ?? 1000,
          );
        } else {
          cam = new THREE.PerspectiveCamera(
            params.fov ?? 75,
            this.getAspect(),
            params.near ?? 0.1,
            params.far ?? 1000,
          );
        }
        this.cameras.set(handle, cam);
        obj = cam;
        break;
      }
    }

    this.objects.set(handle, obj);
    this.scene.add(obj);
    return handle;
  }

  updateTransform(handle: RenderHandle, t: RenderTransform): void {
    const obj = this.objects.get(handle);
    if (!obj) return;

    obj.position.set(t.px, t.py, t.pz);
    obj.quaternion.set(t.rx, t.ry, t.rz, t.rw);
    obj.scale.set(t.sx, t.sy, t.sz);
  }

  removeObject(handle: RenderHandle): void {
    const obj = this.objects.get(handle);
    if (!obj) return;

    this.scene.remove(obj);

    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach(m => m.dispose());
      } else {
        obj.material.dispose();
      }
    }

    this.objects.delete(handle);
    this.cameras.delete(handle);
  }

  setActiveCamera(handle: RenderHandle): void {
    const cam = this.cameras.get(handle);
    if (cam) this.activeCamera = cam;
  }

  beginFrame(): void {
    // No-op — Three.js doesn't need explicit frame begin
  }

  endFrame(): void {
    if (!this.threeRenderer) return;
    this.threeRenderer.render(this.scene, this.activeCamera);
  }

  resize(width: number, height: number): void {
    if (!this.threeRenderer) return;
    this.threeRenderer.setSize(width, height);

    if (this.activeCamera instanceof THREE.PerspectiveCamera) {
      this.activeCamera.aspect = width / height;
      this.activeCamera.updateProjectionMatrix();
    }
  }

  destroy(): void {
    for (const handle of this.objects.keys()) {
      this.removeObject(handle);
    }
    this.threeRenderer?.dispose();
    this.threeRenderer?.domElement.remove();
    this.threeRenderer = null;
  }

  private getAspect(): number {
    if (this.threeRenderer) {
      const size = this.threeRenderer.getSize(new THREE.Vector2());
      return size.x / size.y;
    }
    return 16 / 9;
  }
}
