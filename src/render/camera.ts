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
  /** 손가락을 댄 칸에서 드래그를 카메라 대신 가져갈지 (고스트 옮기기·길 칠하기). true면 이 드래그는 화면을 안 움직인다. */
  dragCapture?: (cellX: number, cellY: number) => boolean;
  /** 가져간 드래그가 새 칸에 들어갈 때마다 (누른 칸 포함) */
  onDragCell?: (cellX: number, cellY: number) => void;
  /** 가져간 드래그가 끝날 때 */
  onDragEnd?: () => void;
  /** 손가락을 움직이지 않고 400ms 누르고 있으면 (보기 모드에서 오브젝트 들어 올리기). true를 돌려주면 그 뒤 드래그를 가져간다. */
  onLongPress?: (cellX: number, cellY: number) => boolean;
  /** 러시처럼 **빠르게 연타하는 구간**인가. true면 누르는 즉시 onTap을 치고 길게 누르기·더블탭을 끈다.
   *  (러시에서 같은 자리를 연달아 누르면 더블탭으로 먹히고, 조금만 오래 누르면 「들어 올리기」가 돼
   *   탭이 씹혔다 — 45초짜리 미니게임에서 손가락이 안 먹는 느낌의 정체다.) */
  fastTap?: () => boolean;
  /** ui3 숏컷: 같은 칸을 DOUBLE_TAP_MS 안에 두 번 탭. true를 돌려주면 그 탭은 onTap으로 안 간다. */
  onDoubleTap?: (cellX: number, cellY: number) => boolean;
  minScale?: number;
  maxScale?: number;
}

const TAP_THRESHOLD_PX = 10;
/** 길게 누르기 판정 시간 */
export const LONG_PRESS_MS = 400;
/** ui3: 같은 칸 두 번 탭을 더블 탭으로 보는 간격 */
export const DOUBLE_TAP_MS = 320;
/** 관성 감쇠(프레임당) · 정지 임계(px/프레임) */
const MOMENTUM_DECAY = 0.92;
const MOMENTUM_STOP = 0.1;
/** 경계 밖일 때 되돌아오는 비율(프레임당) */
const RUBBER_EASE = 0.15;
/** 경계 여유(월드 px) */
const BOUNDS_MARGIN = 200;
/** 속도 추정에 쓰는 최근 이동 창(ms) */
const VELOCITY_WINDOW_MS = 100;
/** 손을 뗀 신호(pointerup·pointercancel)를 놓친 포인터를 버리는 시간.
 *  이게 없으면 놓친 포인터 하나가 영원히 남아 다음 누름이 전부 「핀치」로 먹히고 — 탭이 통째로 죽는다.
 *  러시에서 「눌러도 아무 일도 안 난다」의 정체 중 하나. 되살아나는 데 새로고침이 필요했다. */
const STALE_POINTER_MS = 2000;

/** 드래그 이동(관성)·핀치 줌·탭(셀 좌표)·경계 고무줄. 이동 거리가 짧으면 탭으로 본다. */
export function attachCamera(stage: Container, opts: CameraOptions): () => void {
  // 30×24 맵 전체(1,728px)를 폰에서 한눈에 보려면 ×0.4까지 줄일 수 있어야 한다
  const { world, canvas, ticker, viewport, bounds, onTap, fastTap, dragCapture, onDragCell, onDragEnd, onLongPress, onDoubleTap, minScale = 0.4, maxScale = 3 } = opts;
  /** ui3 더블 탭: 마지막 탭의 칸·시각 */
  let lastTap: { x: number; y: number; t: number } | null = null;
  let pressTimer = 0;
  const clearPress = () => { if (pressTimer) { window.clearTimeout(pressTimer); pressTimer = 0; } };
  const pointers = new Map<number, { x: number; y: number; t: number }>();
  let dragStart: { x: number; y: number; wx: number; wy: number } | null = null;
  let moved = false;
  let firedFast = false; // 러시 연타: 누를 때 이미 onTap을 쳤나
  /** 카메라 대신 앱이 가져간 드래그: 마지막으로 알린 칸 */
  let captured: { x: number; y: number } | null = null;
  const cellOf = (gx: number, gy: number) => screenToCell((gx - world.x) / world.scale.x, (gy - world.y) / world.scale.y);
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

  /** 손 뗀 신호를 놓친 포인터를 버린다 (브라우저가 pointercancel조차 안 줄 때의 마지막 보루) */
  const dropStale = (now: number) => {
    for (const [id, p] of pointers) if (now - p.t > STALE_POINTER_MS) pointers.delete(id);
  };
  const down = (e: FederatedPointerEvent) => {
    const now = performance.now();
    dropStale(now);
    pointers.set(e.pointerId, { x: e.globalX, y: e.globalY, t: now });
    vx = vy = 0;
    if (pointers.size === 1) {
      dragStart = { x: e.globalX, y: e.globalY, wx: world.x, wy: world.y };
      moved = false;
      samples = [];
      pushSample(e.globalX, e.globalY);
      const c = cellOf(e.globalX, e.globalY);
      firedFast = false; // 앞 누름의 떼기를 놓쳤어도 이번 누름은 살아 있다 (안 지우면 다음 탭 하나가 통째로 씹힌다)
      if (fastTap?.()) { firedFast = true; onTap(c.x, c.y); return; } // 누르는 즉시 — 떼기를 기다리지 않는다
      if (dragCapture?.(c.x, c.y)) {
        captured = c;
        onDragCell?.(c.x, c.y);
      } else if (onLongPress) {
        clearPress();
        pressTimer = window.setTimeout(() => {
          pressTimer = 0;
          if (pointers.size !== 1 || moved || captured || !dragStart) return;
          if (onLongPress(c.x, c.y)) {
            captured = c;
            world.position.set(dragStart.wx, dragStart.wy); // 누르는 동안 살짝 밀린 화면은 되돌린다
            onDragCell?.(c.x, c.y);
          }
        }, LONG_PRESS_MS);
      }
    } else if (pointers.size === 2) {
      clearPress();
      if (captured) { captured = null; onDragEnd?.(); }
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  };
  const move = (e: FederatedPointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.globalX, y: e.globalY, t: performance.now() });
    if (pointers.size === 1 && captured) {
      const c = cellOf(e.globalX, e.globalY);
      if (c.x !== captured.x || c.y !== captured.y) { captured = c; onDragCell?.(c.x, c.y); }
      moved = true;
    } else if (pointers.size === 1 && dragStart) {
      const dx = e.globalX - dragStart.x;
      const dy = e.globalY - dragStart.y;
      if (Math.hypot(dx, dy) > TAP_THRESHOLD_PX) { moved = true; clearPress(); }
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
    clearPress();
    pointers.delete(e.pointerId);
    if (pointers.size === 1) {
      // 핀치에서 손가락 하나가 떨어지면 남은 손가락 기준으로 드래그를 다시 시작한다 (점프 방지)
      const [rest] = [...pointers.values()];
      dragStart = { x: rest!.x, y: rest!.y, wx: world.x, wy: world.y };
      pinchDist = 0;
      samples = [];
    } else if (pointers.size === 0) {
      if (captured) {
        captured = null;
        onDragEnd?.();
      } else if (firedFast) {
        firedFast = false; // 이미 누를 때 쳤다
      } else if (!moved && dragStart) {
        const lx = (e.globalX - world.x) / world.scale.x;
        const ly = (e.globalY - world.y) / world.scale.y;
        const c = screenToCell(lx, ly);
        const now = performance.now();
        const twice = !!lastTap && lastTap.x === c.x && lastTap.y === c.y && now - lastTap.t < DOUBLE_TAP_MS;
        lastTap = twice ? null : { x: c.x, y: c.y, t: now }; // 세 번째 탭이 또 더블이 되지 않게
        if (!(twice && onDoubleTap?.(c.x, c.y))) onTap(c.x, c.y);
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
  // pointercancel도 「손을 뗐다」로 친다 — 안 받으면 그 포인터가 map에 남아 다음 탭부터 전부 핀치로 먹힌다
  stage.on('pointerdown', down).on('pointermove', move).on('pointerup', up).on('pointerupoutside', up).on('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  ticker.add(tick);
  return () => {
    clearPress();
    ticker.remove(tick);
    stage.off('pointerdown', down).off('pointermove', move).off('pointerup', up).off('pointerupoutside', up).off('pointercancel', up);
    canvas.removeEventListener('wheel', wheel);
  };
}
