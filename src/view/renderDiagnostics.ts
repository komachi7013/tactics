import type Phaser from 'phaser';

const frameEvents = ['prestep', 'step', 'poststep', 'prerender', 'postrender'] as const;

// A separate native RAF request is observational: it does not call Phaser.tick,
// replace a global callback, wake the game, or re-register Phaser's RAF request.
export function observeScheduling(source: {
  events: { on: (event: string, listener: () => void) => unknown; off: (event: string, listener: () => void) => unknown };
  read: () => unknown;
  requestFrame: (callback: (time: number) => void) => number;
  cancelFrame: (id: number) => void;
}, done: (value: unknown) => void, timeoutMs = 3000) {
  const before = source.read();
  const counts = Object.fromEntries(frameEvents.map(name => [name, 0])) as Record<typeof frameEvents[number], number>;
  const listeners = frameEvents.map(name => { const fn = () => { counts[name]++; }; source.events.on(name, fn); return { name, fn }; });
  let nativeFrame: { status: string; timestamp?: number; error?: string } = { status: 'pending' };
  let requestId: number | undefined;
  try { requestId = source.requestFrame(timestamp => { nativeFrame = { status: 'delivered', timestamp }; }); }
  catch (error) { nativeFrame = { status: 'request-threw', error: String(error) }; }
  const timer = setTimeout(() => {
    cancel();
    if (nativeFrame.status === 'pending') nativeFrame = { status: 'not-delivered-within-timeout' };
    try { done({ status: 'scheduling-observed', before, after: source.read(), nativeFrame, events: counts }); }
    catch (error) { done({ status: 'diagnostic-error', error: String(error) }); }
  }, timeoutMs);
  function cancel() {
    clearTimeout(timer);
    for (const { name, fn } of listeners) source.events.off(name, fn);
    if (requestId !== undefined && nativeFrame.status === 'pending') source.cancelFrame(requestId);
  }
  return cancel;
}

function schedulingState(game: Phaser.Game) {
  const loop = game.loop, raf = loop.raf;
  return { frame: loop.frame, started: loop.started, running: loop.running, forceSetTimeOut: loop.forceSetTimeOut,
    now: loop.now, lastTime: loop.lastTime, rawDelta: loop.rawDelta, time: loop.time, framesThisSecond: loop.framesThisSecond,
    raf: { isRunning: raf.isRunning, isSetTimeOut: raf.isSetTimeOut, timeOutID: raf.timeOutID },
    gameRunning: game.isRunning, gamePaused: game.isPaused,
    documentVisibility: document.visibilityState, documentHidden: document.hidden, documentHasFocus: document.hasFocus() };
}

export function readPixelBuffer(gl: WebGLRenderingContext, width: number, height: number) {
  // getError consumes the debug error queue; retain all consumed values in the
  // report, bounded for CONTEXT_LOST_WEBGL. No GL draw state is changed.
  const errors = () => {
    const result: number[] = [];
    for (let i = 0; i < 8; i++) { const error = gl.getError(); if (error === gl.NO_ERROR) break; result.push(error); }
    return result;
  };
  const priorErrors = errors();
  const data = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
  const readErrors = errors();
  if (readErrors.length || gl.isContextLost()) return { status: 'readback-error', priorErrors, readErrors };
  let nonBackground = 0, transparent = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) transparent++;
    if (data[i + 3] > 0 && (Math.abs(data[i] - 23) > 3 || Math.abs(data[i + 1] - 59) > 3 || Math.abs(data[i + 2] - 64) > 3)) nonBackground++;
  }
  const centerOffset = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
  return { status: 'readback-returned', priorErrors, readErrors, total: width * height, nonBackground, transparent,
    center: Array.from(data.slice(centerOffset, centerOffset + 4)) };
}

// DEV-only, explicitly requested observation. Never starts, redraws or alters a
// scene, camera, renderer, command or save. Read pixels in POST_RENDER while the
// default WebGL buffer is still valid (preserveDrawingBuffer is normally false).
export function observeNextRender(
  events: Pick<Phaser.Events.EventEmitter, 'once' | 'off'>,
  read: () => unknown,
  done: (value: unknown) => void,
  timeoutMs = 3000,
) {
  let timer: ReturnType<typeof setTimeout>;
  const cancel = () => { clearTimeout(timer); events.off('postrender', capture); };
  const capture = () => {
    cancel();
    try { done({ status: 'captured', frame: read() }); }
    catch (error) { done({ status: 'diagnostic-error', error: String(error) }); }
  };
  events.once('postrender', capture);
  timer = setTimeout(() => { cancel(); done({ status: 'no-post-render-within-timeout' }); }, timeoutMs);
  return cancel;
}

export function readRenderFrame(game: Phaser.Game, scene: Phaser.Scene, host: HTMLElement) {
  const camera = scene.cameras.main;
  const roots = scene.children.getChildren();
  const rect = (element: Element) => {
    const r = element.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height];
  };
  const object = (value: Phaser.GameObjects.GameObject) => {
    const v = value as Phaser.GameObjects.Container;
    return { type: v.type, active: v.active, visible: v.visible, alpha: v.alpha,
      renderFlags: v.renderFlags, cameraFilter: v.cameraFilter,
      willRender: v.willRender(camera), position: [v.x, v.y], scale: [v.scaleX, v.scaleY],
      rotation: v.rotation, children: v.list?.length ?? 0 };
  };
  const canvas = game.canvas;
  const css = [];
  for (let element: HTMLElement | null = canvas; element; element = element.parentElement) {
    const c = getComputedStyle(element);
    css.push({ tag: element.tagName, id: element.id, rect: rect(element), display: c.display,
      visibility: c.visibility, opacity: c.opacity, transform: c.transform, zIndex: c.zIndex,
      overflow: c.overflow, clipPath: c.clipPath });
  }
  const r = canvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(innerWidth - 1, r.left + r.width / 2));
  const y = Math.max(0, Math.min(innerHeight - 1, r.top + r.height / 2));
  const top = document.elementFromPoint(x, y);
  const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  const gl = renderer.gl;
  let pixels: unknown = { status: 'not-webgl' };
  if (gl) {
    const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const parameters = { width, height, contextLost: gl.isContextLost(), defaultFramebuffer: framebuffer === null,
      viewport: Array.from(gl.getParameter(gl.VIEWPORT) as Int32Array),
      scissor: Array.from(gl.getParameter(gl.SCISSOR_BOX) as Int32Array),
      scissorEnabled: gl.isEnabled(gl.SCISSOR_TEST), colorWrite: gl.getParameter(gl.COLOR_WRITEMASK) };
    if (framebuffer !== null || gl.isContextLost() || width * height > 4_000_000 || !width || !height) {
      pixels = { status: 'readback-skipped', ...parameters };
    } else {
      pixels = { ...parameters, ...readPixelBuffer(gl, width, height) };
    }
  }
  return { frameNumber: game.loop.frame, loopRunning: game.loop.running, gamePaused: game.isPaused,
    documentVisibility: document.visibilityState, renderer: renderer.type,
    scene: { status: scene.sys.settings.status, visible: scene.sys.settings.visible, active: scene.sys.settings.active },
    camera: { visible: camera.visible, alpha: camera.alpha, viewport: [camera.x, camera.y, camera.width, camera.height],
      scroll: [camera.scrollX, camera.scrollY], zoom: [camera.zoomX, camera.zoomY],
      renderListCount: camera.renderList.length },
    roots: roots.map(object), firstChildren: (roots[0] as Phaser.GameObjects.Container | undefined)?.list?.slice(0, 4).map(object),
    boardRect: rect(host), canvasCount: host.querySelectorAll('canvas').length, css,
    hitTest: { point: [x, y], tag: top?.tagName, id: top?.id, isCanvas: top === canvas }, pixels };
}

export function installRenderDiagnostics(details: HTMLDetailsElement, game: Phaser.Game, scene: Phaser.Scene, host: HTMLElement) {
  const button = document.createElement('button'); button.textContent = 'フレーム診断を取得';
  const output = document.createElement('pre'); output.style.whiteSpace = 'pre-wrap';
  let cancel: (() => void) | undefined;
  button.onclick = () => {
    cancel?.(); button.disabled = true; output.textContent = '次の描画フレームを待っています。';
    const requested = { frameNumber: game.loop.frame, loopRunning: game.loop.running, gamePaused: game.isPaused,
      sceneStatus: scene.sys.settings.status, sceneVisible: scene.sys.settings.visible,
      cameraVisible: scene.cameras.main?.visible, cameraAlpha: scene.cameras.main?.alpha };
    cancel = observeNextRender(game.events, () => readRenderFrame(game, scene, host), value => {
      output.textContent = JSON.stringify({ requested, frameNumberAfter: game.loop.frame, result: value }, null, 2);
      button.disabled = false; cancel = undefined;
    });
  };
  details.append(button, output);
  const schedulerButton = document.createElement('button'); schedulerButton.textContent = 'スケジューラ診断を取得（3秒）';
  const schedulerOutput = document.createElement('pre'); schedulerOutput.style.whiteSpace = 'pre-wrap';
  let cancelScheduling: (() => void) | undefined;
  let removeErrorObservers: (() => void) | undefined;
  schedulerButton.onclick = () => {
    cancelScheduling?.(); removeErrorObservers?.(); schedulerButton.disabled = true;
    schedulerOutput.textContent = 'スケジューラを3秒間観測しています。';
    const errors: unknown[] = [];
    const error = (e: ErrorEvent) => { if (errors.length < 8) errors.push({ type: 'error', message: e.message, filename: e.filename, line: e.lineno, column: e.colno }); };
    const rejection = (e: PromiseRejectionEvent) => { if (errors.length < 8) errors.push({ type: 'unhandledrejection', reason: String(e.reason) }); };
    window.addEventListener('error', error); window.addEventListener('unhandledrejection', rejection);
    removeErrorObservers = () => { window.removeEventListener('error', error); window.removeEventListener('unhandledrejection', rejection); };
    cancelScheduling = observeScheduling({ events: game.events, read: () => schedulingState(game),
      requestFrame: cb => window.requestAnimationFrame(cb), cancelFrame: id => window.cancelAnimationFrame(id) }, result => {
      removeErrorObservers?.(); removeErrorObservers = undefined; cancelScheduling = undefined;
      schedulerOutput.textContent = JSON.stringify({ result, errors }, null, 2); schedulerButton.disabled = false;
    });
  };
  details.append(schedulerButton, schedulerOutput);
  return () => { cancel?.(); cancelScheduling?.(); removeErrorObservers?.(); button.remove(); output.remove(); schedulerButton.remove(); schedulerOutput.remove(); };
}
