/**
 * Three.js renderer — implements the Renderer interface.
 *
 * Uses WebGLRenderer (WebGPURenderer can be swapped in when stable).
 * Manages an internal Three.js Scene. Consumers interact only via
 * opaque RenderHandles.
 */

import * as THREE from "three";
import type { Renderer, RenderHandle, RenderObjectParams, RenderTransform } from "../renderer.js";

export class ThreeJSRenderer implements Renderer {
  private scene = new THREE.Scene();
  private threeRenderer: THREE.WebGLRenderer | null = null;
  private activeCamera: THREE.Camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

  private objects = new Map<RenderHandle, THREE.Object3D>();
  private cameras = new Map<RenderHandle, THREE.Camera>();
  private baseScale = new Map<RenderHandle, [number, number, number]>();
  private renderTargets = new Map<string, THREE.WebGLRenderTarget>();
  private nextHandle: RenderHandle = 1;

  async init(target: HTMLElement): Promise<void> {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(target.clientWidth, target.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.autoClear = false;
    target.appendChild(renderer.domElement);
    this.threeRenderer = renderer;

    this.scene.background = new THREE.Color(0x1a1a2e);
  }

  createObject(params: RenderObjectParams): RenderHandle {
    const handle = this.nextHandle++;
    let obj: THREE.Object3D;

    switch (params.type) {
      case "mesh": {
        let geometry: THREE.BufferGeometry;
        switch (params.geometry) {
          case "sphere":
            geometry = new THREE.SphereGeometry(0.5, 16, 16);
            break;
          case "cone":
            geometry = new THREE.ConeGeometry(0.3, 1, 8);
            break;
          case "arrow": {
            // Arrow: a cone (head) on top of a cylinder (shaft)
            const group = new THREE.Group();
            const shaftMat = new THREE.MeshStandardMaterial({
              color: params.color ?? 0x888888,
              roughness: params.roughness ?? 0.5,
              metalness: params.metalness ?? 0.0,
            });
            const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8), shaftMat);
            shaft.position.y = -0.2;
            const head = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 8), shaftMat);
            head.position.y = 0.3;
            group.add(shaft, head);
            if (params.scaleX || params.scaleY || params.scaleZ) {
              group.scale.set(params.scaleX ?? 1, params.scaleY ?? 1, params.scaleZ ?? 1);
            }
            this.baseScale.set(handle, [
              params.scaleX ?? 1,
              params.scaleY ?? 1,
              params.scaleZ ?? 1,
            ]);
            this.objects.set(handle, group);
            this.scene.add(group);
            return handle;
          }
          case "box":
          default:
            geometry = new THREE.BoxGeometry(1, 1, 1);
            break;
        }
        const material = new THREE.MeshStandardMaterial({
          color: params.color ?? 0x888888,
          roughness: params.roughness ?? 0.5,
          metalness: params.metalness ?? 0.0,
        });
        obj = new THREE.Mesh(geometry, material);
        const bsx = params.scaleX ?? 1;
        const bsy = params.scaleY ?? 1;
        const bsz = params.scaleZ ?? 1;
        obj.scale.set(bsx, bsy, bsz);
        // Store base scale so updateTransform can multiply rather than overwrite
        this.baseScale.set(handle, [bsx, bsy, bsz]);
        break;
      }
      case "light": {
        switch (params.lightType) {
          case "directional":
            obj = new THREE.DirectionalLight(params.color ?? 0xffffff, params.intensity ?? 1);
            break;
          case "spot": {
            const spot = new THREE.SpotLight(params.color ?? 0xffffff, params.intensity ?? 1);
            if (params.angle !== undefined) spot.angle = params.angle;
            obj = spot;
            break;
          }
          case "ambient":
            obj = new THREE.AmbientLight(params.color ?? 0xffffff, params.intensity ?? 0.5);
            break;
          case "point":
          default: {
            const point = new THREE.PointLight(params.color ?? 0xffffff, params.intensity ?? 1);
            if (params.range !== undefined) point.distance = params.range;
            obj = point;
            break;
          }
        }
        break;
      }
      case "renderQuad": {
        const geometry = new THREE.PlaneGeometry(params.width, params.height);
        const material = new THREE.MeshStandardMaterial({ color: 0x000000 });
        obj = new THREE.Mesh(geometry, material);
        // Texture binding happens later via setMaterialTexture
        break;
      }
      case "camera": {
        let cam: THREE.Camera;
        if (params.projection === "orthographic") {
          cam = new THREE.OrthographicCamera(
            -10,
            10,
            10,
            -10,
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
    const base = this.baseScale.get(handle);
    if (base) {
      obj.scale.set(t.sx * base[0], t.sy * base[1], t.sz * base[2]);
    } else {
      obj.scale.set(t.sx, t.sy, t.sz);
    }
  }

  removeObject(handle: RenderHandle): void {
    const obj = this.objects.get(handle);
    if (!obj) return;

    this.scene.remove(obj);

    const disposeMesh = (mesh: THREE.Mesh) => {
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material.dispose();
      }
    };

    if (obj instanceof THREE.Mesh) {
      disposeMesh(obj);
    } else if (obj instanceof THREE.Group) {
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) disposeMesh(child);
      });
    }

    this.objects.delete(handle);
    this.baseScale.delete(handle);
    this.cameras.delete(handle);
  }

  setActiveCamera(handle: RenderHandle): void {
    const cam = this.cameras.get(handle);
    if (cam) this.activeCamera = cam;
  }

  lookAt(handle: RenderHandle, x: number, y: number, z: number): void {
    const obj = this.objects.get(handle);
    if (!obj) return;
    obj.lookAt(x, y, z);
  }

  beginFrame(): void {
    if (!this.threeRenderer) return;
    this.threeRenderer.clear();
  }

  endFrame(): void {
    this.render();
  }

  resize(width: number, height: number): void {
    if (!this.threeRenderer) return;
    this.threeRenderer.setSize(width, height);

    if (this.activeCamera instanceof THREE.PerspectiveCamera) {
      this.activeCamera.aspect = width / height;
      this.activeCamera.updateProjectionMatrix();
    }
  }

  createRenderTarget(id: string, width: number, height: number): void {
    const target = new THREE.WebGLRenderTarget(width, height);
    this.renderTargets.set(id, target);
  }

  destroyRenderTarget(id: string): void {
    const target = this.renderTargets.get(id);
    if (target) {
      target.dispose();
      this.renderTargets.delete(id);
    }
  }

  setRenderTarget(id: string | null): void {
    if (!this.threeRenderer) return;
    if (id === null) {
      this.threeRenderer.setRenderTarget(null);
    } else {
      const target = this.renderTargets.get(id);
      if (target) this.threeRenderer.setRenderTarget(target);
    }
  }

  setViewport(x: number, y: number, width: number, height: number): void {
    if (!this.threeRenderer) return;
    const size = this.threeRenderer.getSize(new THREE.Vector2());
    const px = Math.round(x * size.x);
    const py = Math.round(y * size.y);
    const pw = Math.round(width * size.x);
    const ph = Math.round(height * size.y);
    this.threeRenderer.setViewport(px, py, pw, ph);
    this.threeRenderer.setScissor(px, py, pw, ph);
    this.threeRenderer.setScissorTest(true);
  }

  resetViewport(): void {
    if (!this.threeRenderer) return;
    const size = this.threeRenderer.getSize(new THREE.Vector2());
    this.threeRenderer.setViewport(0, 0, size.x, size.y);
    this.threeRenderer.setScissorTest(false);
  }

  setMaterialTexture(handle: RenderHandle, renderTargetId: string): void {
    const obj = this.objects.get(handle);
    if (!obj) return;
    const target = this.renderTargets.get(renderTargetId);
    if (!target) return;

    if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
      obj.material.map = target.texture;
      obj.material.needsUpdate = true;
    }
  }

  render(): void {
    if (!this.threeRenderer) return;
    this.threeRenderer.clear();
    this.threeRenderer.render(this.scene, this.activeCamera);
  }

  destroy(): void {
    for (const handle of this.objects.keys()) {
      this.removeObject(handle);
    }
    for (const [id] of this.renderTargets) {
      this.destroyRenderTarget(id);
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
