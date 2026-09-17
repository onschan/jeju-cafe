import { Container, FederatedPointerEvent } from 'pixi.js';
import { TILE } from './textures';

export interface CameraOptions {
  world: Container;
  /** 휠 줌을 받을 캔버스. window 전체가 아니라 캔버스 위에서만 줌한다. */
  canvas: HTMLCanvasElement;
  onTap: (cellX: number, cellY: number) => void;
  minScale?: number;
  maxScale?: number;
}

const TAP_THRESHOLD_PX = 10;

/** 드래그 이동·핀치 줌·탭(셀 좌표) 처리. 이동 거리가 짧으면 탭으로 본다. */
export function attachCamera(stage: Container, opts: CameraOptions): () => void {
  const { world, canvas, onTap, minScale = 0.75, maxScale = 3 } = opts;
  const pointers = new Map<number, { x: number; y: number }>();
  let dragStart: { x: number; y: number; wx: number; wy: number } | null = null;
  let moved = false;
  let pinchDist = 0;

  /** 화면점 (ax, ay)가 줌 전후로 같은 월드점을 가리키도록 스케일을 바꾼다. */
  const zoomAt = (s: number, ax: number, ay: number) => {
    const wx = (ax - world.x) / world.scale.x;
    const wy = (ay - world.y) / world.scale.y;
    world.scale.set(s);
    world.position.set(ax - wx * s, ay - wy * s);
  };
  const clampScale = (s: number) => Math.min(maxScale, Math.max(minScale, s));

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
      if (Math.hypot(dx, dy) > TAP_THRESHOLD_PX) moved = true;
      world.x = dragStart.wx + dx;
      world.y = dragStart.wy + dy;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinchDist > 0) {
        zoomAt(clampScale(world.scale.x * (d / pinchDist)), (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      }
      pinchDist = d;
      moved = true;
    }
  };
  const up = (e: FederatedPointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 1) {
      // 핀치에서 손가락 하나가 떨어지면 남은 손가락 기준으로 드래그를 다시 시작한다 (점프 방지)
      const [rest] = [...pointers.values()];
      dragStart = { x: rest!.x, y: rest!.y, wx: world.x, wy: world.y };
      pinchDist = 0;
    } else if (pointers.size === 0) {
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
    const rect = canvas.getBoundingClientRect();
    zoomAt(clampScale(world.scale.x * (e.deltaY < 0 ? 1.1 : 0.9)), e.clientX - rect.left, e.clientY - rect.top);
  };

  stage.eventMode = 'static';
  stage.hitArea = { contains: () => true };
  stage.on('pointerdown', down).on('pointermove', move).on('pointerup', up).on('pointerupoutside', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  return () => {
    stage.off('pointerdown', down).off('pointermove', move).off('pointerup', up).off('pointerupoutside', up);
    canvas.removeEventListener('wheel', wheel);
  };
}
