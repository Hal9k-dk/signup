"use strict";

// Begin dismantling after 15 minutes of active signup time.
const PAGE_DECAY_DELAY_MS = 15 * 60 * 1000;
const PAGE_DECAY_PIECE_INTERVAL_MS = 1400;

function createPageDecay() {
  const { Engine, Bodies, Body, Composite } = Matter;
  const engine = Engine.create({ enableSleeping: true });
  const layer = document.querySelector("#debris-layer");
  const controls = document.querySelector("#decay-controls");
  const toggle = document.querySelector("#toggle-decay");
  const message = document.querySelector("#decay-message");
  const theme = matchMedia("(prefers-color-scheme: dark)");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  // Never detach both a container and its contents.
  const targets = [
    ...document.querySelectorAll(
      [
        ".site-header > *",
        ".intro > div:first-child > *",
        ".hero-art",
        ".form-panel > .panel-heading",
        ".section-description",
        ".field-grid > label",
        ".membership",
        ".message-label",
        ".submit-section",
        ".privacy-note",
        ".challenge-panel > *",
        ".note-panel > *",
        "footer > *",
      ].join(","),
    ),
  ];
  const fallen = new Map();
  let paused = reducedMotion.matches;
  let completed = false;
  let started = false;
  let elapsed = 0;
  let nextPieceAt = PAGE_DECAY_DELAY_MS;
  let previousTime;
  let frame;

  function walls() {
    const width = innerWidth;
    const height = innerHeight;
    Composite.add(engine.world, [
      Bodies.rectangle(width / 2, height + 30, width * 3, 60, {
        isStatic: true,
      }),
      Bodies.rectangle(-30, height / 2, 60, height * 3, { isStatic: true }),
      Bodies.rectangle(width + 30, height / 2, 60, height * 3, {
        isStatic: true,
      }),
    ]);
  }

  function snapshot(original) {
    const clone = original.cloneNode(true);
    const sources = [original, ...original.querySelectorAll("*")];
    const copies = [clone, ...clone.querySelectorAll("*")];
    sources.forEach((source, index) => {
      const copy = copies[index];
      const computed = getComputedStyle(source);
      // Preserve appearance outside the original CSS/layout context.
      for (const property of computed) {
        copy.style.setProperty(property, computed.getPropertyValue(property));
      }
      copy.removeAttribute("id");
      copy.removeAttribute("name");
      if (
        source instanceof HTMLInputElement ||
        source instanceof HTMLTextAreaElement
      ) {
        copy.value = source.value;
        if (source instanceof HTMLInputElement) copy.checked = source.checked;
      }
      if (source instanceof HTMLCanvasElement) {
        copy.getContext("2d").drawImage(source, 0, 0);
      }
    });
    clone.inert = true;
    clone.setAttribute("aria-hidden", "true");
    return clone;
  }

  function dropNextPiece() {
    const original = targets.find((element) => {
      if (fallen.has(element)) return false;
      const rect = element.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < innerHeight
      );
    });
    if (!original) return;
    const rect = original.getBoundingClientRect();
    const clone = snapshot(original);
    const wrapper = document.createElement("div");
    wrapper.className = "page-debris";
    wrapper.style.width = `${rect.width}px`;
    wrapper.style.height = `${rect.height}px`;
    Object.assign(clone.style, {
      position: "relative",
      top: "auto",
      left: "auto",
      right: "auto",
      bottom: "auto",
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: "0",
      transform: "none",
    });
    wrapper.append(clone);
    layer.append(wrapper);
    const body = Bodies.rectangle(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      rect.width,
      rect.height,
      { restitution: 0.2, friction: 0.65, frictionAir: 0.012 },
    );
    Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.045);
    Body.setVelocity(body, { x: (Math.random() - 0.5) * 2, y: 0 });
    Composite.add(engine.world, body);
    // Keep the real form and its layout intact. Rebuilding never loses input.
    fallen.set(original, {
      body,
      wrapper,
      visibility: original.style.visibility,
      inert: original.inert,
    });
    original.style.visibility = "hidden";
    original.inert = true;
    if (!started) {
      started = true;
      updateControls();
    }
  }

  function updateControls() {
    controls.hidden = !started || !theme.matches || completed;
    toggle.textContent = paused ? "▶ Mere kaos" : "Ⅱ Pause kaos";
    message.textContent = paused
      ? "TYNGDEKRAFT PÅ PAUSE"
      : "TIDEN ER GÅET // SIDEN SKILLER SIG SELV AD";
  }

  function tick(time) {
    const delta =
      previousTime === undefined ? 0 : Math.min(time - previousTime, 50);
    previousTime = time;
    if (!paused && !completed && theme.matches && !document.hidden) {
      elapsed += delta;
      if (elapsed >= nextPieceAt) {
        dropNextPiece();
        nextPieceAt = elapsed + PAGE_DECAY_PIECE_INTERVAL_MS;
      }
      if (delta > 0) Engine.update(engine, Math.min(delta, 1000 / 60));
      for (const { body, wrapper } of fallen.values()) {
        wrapper.style.transform = `translate(${body.position.x}px, ${body.position.y}px) rotate(${body.angle}rad) translate(-50%, -50%)`;
      }
    }
    frame = requestAnimationFrame(tick);
  }

  function rebuild() {
    for (const [original, piece] of fallen) {
      original.style.visibility = piece.visibility;
      original.inert = piece.inert;
      piece.wrapper.remove();
    }
    fallen.clear();
    Composite.clear(engine.world, false);
    Engine.clear(engine);
    walls();
    elapsed = 0;
    nextPieceAt = PAGE_DECAY_DELAY_MS;
    previousTime = undefined;
  }

  toggle.addEventListener("click", () => {
    paused = !paused;
    updateControls();
  });
  document.querySelector("#rebuild-page").addEventListener("click", () => {
    paused = true;
    rebuild();
    updateControls();
  });
  // Old viewport coordinates are invalid after resizing; recover safely.
  window.addEventListener("resize", rebuild);
  theme.addEventListener("change", () => {
    previousTime = undefined;
    updateControls();
  });
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) {
      paused = true;
      rebuild();
      updateControls();
    }
  });
  document.addEventListener("visibilitychange", () => {
    previousTime = undefined;
  });
  walls();
  updateControls();
  frame = requestAnimationFrame(tick);
  return {
    finish() {
      completed = true;
      rebuild();
      cancelAnimationFrame(frame);
      updateControls();
    },
  };
}
