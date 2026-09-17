import { Container, FederatedPointerEvent, Ticker } from 'pixi.js';
import { screenToCell } from './iso';

export interface CameraBounds { x: number; y: number; w: number; h: number }

export interface CameraOptions {
  world: Container;
  /** 휠 줌을 받을 캔버스. window 전체가 아니라 캔버스 위에서만 줌한다. */
  canvas: HTMLCanvasElement;
  /** 관성·고무줄을 매 프레임 진행할 티커 */
  ticker: Ticker;
  /** 뷰포트 크기(화면 px). resizeTo로 바뀌므로 매번 읽는다. */
  viewport: () => { width: number; height: number };
  /** 월드 좌표 경계(맵 바운딩 박스). null이면 경계 없음. */
  bounds: () => CameraBounds | null;
  onTap: (cellX: number, cellY: number) => void;
  minScale?: number;
  maxScale?: number;
}

const TAP_THRESHOLD_PX = 10;
/** 관성 감쇠(프레임당) · 정지 임계(px/프레임) */
const MOMENTUM_DECAY = 0.92;
const MOMENTUM_STOP = 0.1;
/** 경계 밖일 때 되돌아오는 비율(프레임당) */
const RUBBER_EASE = 0.15;
/** 경계 여유(월드 px) */
const BOUNDS_MARGIN = 200;
/** 속도 추정에 쓰는 최근 이동 창(ms) */
const VELOCITY_WINDOW_MS = 100;

/** 드래그 이동(관성)·핀치 줌·탭(셀 좌표)·경계 고무줄. 이동 거리가 짧으면 탭으로 본다. */
export function attachCamera(stage: Container, opts: CameraOptions): () => void {
  const { world, canvas, ticker, viewport, bounds, onTap, minScale = 1, maxScale = 3 } = opts;
  const pointers = new Map<number, { x: number; y: number }>();
  let dragStart: { x: number; y: number; wx: number; wy: number } | null = null;
  let moved = false;
  let pinchDist = 0;
  /** 최근 포인터 이동 샘플(속도 추정) */
  let samples: { t: number; x: number; y: number }[] = [];
  let vx = 0;
  let vy = 0;

  /** 화면점 (ax, ay)가 줌 전후로 같은 월드점을 가리키도록 스케일을 바꾼다. */
  const zoomAt = (s: number, ax: number, ay: number) => {
    const wx = (ax - world.x) / world.scale.x;
    const wy = (ay - world.y) / world.scale.y;
    world.scale.set(s);
    world.position.set(ax - wx * s, ay - wy * s);
  };
  const clampScale = (s: number) => Math.min(maxScale, Math.max(minScale, s));

  /** 경계 안에 들어오는 world.position 목표. 뷰포트가 경계보다 크면 가운데 정렬. */
  const targetPosition = (): { x: number; y: number } | null => {
    const b = bounds();
    if (!b) return null;
    const { width, height } = viewport();
    const s = world.scale.x;
    const axis = (pos: number, view: number, b0: number, bLen: number) => {
      const lo = (b0 - BOUNDS_MARGIN) * s;
      const hi = (b0 + bLen + BOUNDS_MARGIN) * s;
      if (hi - lo <= view) return view / 2 - (lo + hi) / 2;
      // 뷰포트 [−pos, −pos+view]가 [lo, hi] 안에 있어야 한다
      return Math.min(-lo, Math.max(view - hi, pos));
    };
    return { x: axis(world.x, width, b.x, b.w), y: axis(world.y, height, b.y, b.h) };
  };

  const pushSample = (x: number, y: number) => {
    const t = performance.now();
    samples.push({ t, x, y });
    while (samples.length > 1 && t - samples[0]!.t > VELOCITY_WINDOW_MS) samples.shift();
  };

  const down = (e: FederatedPointerEvent) => {
    pointers.set(e.pointerId, { x: e.globalX, y: e.globalY });
    vx = vy = 0;
    if (pointers.size === 1) {
      dragStart = { x: e.globalX, y: e.globalY, wx: world.x, wy: world.y };
      moved = false;
      samples = [];
      pushSample(e.globalX, e.globalY);
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
      pushSample(e.globalX, e.globalY);
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
      samples = [];
    } else if (pointers.size === 0) {
      if (!moved && dragStart) {
        const lx = (e.globalX - world.x) / world.scale.x;
        const ly = (e.globalY - world.y) / world.scale.y;
        const c = screenToCell(lx, ly);
        onTap(c.x, c.y);
      } else if (moved && samples.length >= 2) {
        // 마지막 이동 창의 평균 속도(px/ms) → px/프레임(60fps 기준)
        const first = samples[0]!;
        const last = samples[samples.length - 1]!;
        const dt = Math.max(1, last.t - first.t);
        if (performance.now() - last.t < VELOCITY_WINDOW_MS) {
          vx = ((last.x - first.x) / dt) * (1000 / 60);
          vy = ((last.y - first.y) / dt) * (1000 / 60);
        }
      }
      dragStart = null;
      samples = [];
    }
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoomAt(clampScale(world.scale.x * (e.deltaY < 0 ? 1.1 : 0.9)), e.clientX - rect.left, e.clientY - rect.top);
  };

  /** 손을 뗀 뒤: 관성으로 미끄러지고, 경계 밖이면 고무줄로 되돌아온다. */
  const tick = (t: Ticker) => {
    if (pointers.size > 0) return;
    const k = Math.min(2, t.deltaTime); // 프레임 드롭 시 과도한 점프 방지
    if (Math.abs(vx) > MOMENTUM_STOP || Math.abs(vy) > MOMENTUM_STOP) {
      world.x += vx * k;
      world.y += vy * k;
      const decay = Math.pow(MOMENTUM_DECAY, k);
      vx *= decay;
      vy *= decay;
    } else {
      vx = vy = 0;
    }
    const target = targetPosition();
    if (!target) return;
    const dx = target.x - world.x;
    const dy = target.y - world.y;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      if (dx !== 0 || dy !== 0) world.position.set(target.x, target.y);
      return;
    }
    // 경계를 벗어나면 관성은 빨리 죽이고 목표로 되돌아간다
    if (dx !== 0) vx *= 0.5;
    if (dy !== 0) vy *= 0.5;
    world.x += dx * RUBBER_EASE * k;
    world.y += dy * RUBBER_EASE * k;
  };

  stage.eventMode = 'static';
  stage.hitArea = { contains: () => true };
  stage.on('pointerdown', down).on('pointermove', move).on('pointerup', up).on('pointerupoutside', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  ticker.add(tick);
  return () => {
    ticker.remove(tick);
    stage.off('pointerdown', down).off('pointermove', move).off('pointerup', up).off('pointerupoutside', up);
    canvas.removeEventListener('wheel', wheel);
  };
}
