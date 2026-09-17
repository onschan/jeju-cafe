import { Container, FederatedPointerEvent } from 'pixi.js';
import { TILE } from './textures';

export interface CameraOptions {
  world: Container;
  onTap: (cellX: number, cellY: number) => void;
  minScale?: number;
  maxScale?: number;
}

/** 드래그 이동·핀치 줌·탭(셀 좌표) 처리. 이동 거리가 짧으면 탭으로 본다. */
export function attachCamera(stage: Container, opts: CameraOptions): () => void {
  const { world, onTap, minScale = 0.75, maxScale = 3 } = opts;
  const pointers = new Map<number, { x: number; y: number }>();
  let dragStart: { x: number; y: number; wx: number; wy: number } | null = null;
  let moved = false;
  let pinchDist = 0;

  const down = (e: FederatedPointerEvent) => {
    pointers.set(e.pointerId, { x: e.globalX, y: e.globalY });
    if (pointers.size === 1) {
      dragStart = { x: e.globalX, y: e.globalY, wx: world.x, wy: world.y };
      moved = false;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  };
  const move = (e: FederatedPointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.globalX, y: e.globalY });
    if (pointers.size === 1 && dragStart) {
      const dx = e.globalX - dragStart.x;
      const dy = e.globalY - dragStart.y;
      if (Math.hypot(dx, dy) > 6) moved = true;
      world.x = dragStart.wx + dx;
      world.y = dragStart.wy + dy;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinchDist > 0) {
        const s = Math.min(maxScale, Math.max(minScale, world.scale.x * (d / pinchDist)));
        world.scale.set(s);
      }
      pinchDist = d;
      moved = true;
    }
  };
  const up = (e: FederatedPointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      if (!moved && dragStart) {
        const lx = (e.globalX - world.x) / world.scale.x;
        const ly = (e.globalY - world.y) / world.scale.y;
        onTap(Math.floor(lx / TILE), Math.floor(ly / TILE));
      }
      dragStart = null;
    }
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const s = Math.min(maxScale, Math.max(minScale, world.scale.x * (e.deltaY < 0 ? 1.1 : 0.9)));
    world.scale.set(s);
  };

  stage.eventMode = 'static';
  stage.hitArea = { contains: () => true };
  stage.on('pointerdown', down).on('pointermove', move).on('pointerup', up).on('pointerupoutside', up);
  window.addEventListener('wheel', wheel, { passive: false });
  return () => {
    stage.off('pointerdown', down).off('pointermove', move).off('pointerup', up).off('pointerupoutside', up);
    window.removeEventListener('wheel', wheel);
  };
}
