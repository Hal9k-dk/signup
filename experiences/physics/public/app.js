import { submitSignup } from "./signup-client.js";

const darkMode = window.matchMedia("(prefers-color-scheme: dark)");
const form = document.querySelector("#signup-form");
const submitButton = document.querySelector("#submit-button");
const formStatus = document.querySelector("#form-status");
const stage = document.querySelector("#physics-stage");
const stateLabel = document.querySelector("#challenge-state");
const timerLabel = document.querySelector("#challenge-timer");
const progress = document.querySelector("#challenge-progress");
let solved = false;
let sending = false;
let challenge;
const pageDecay = window.Matter ? createPageDecay() : null;

function updateSubmit() {
  submitButton.disabled = !solved || sending || !darkMode.matches;
}

function createChallenge() {
  const {
    Engine,
    Render,
    Runner,
    Bodies,
    Body,
    Composite,
    Constraint,
    Query,
    Events,
  } = Matter;
  const engine = Engine.create({ enableSleeping: true });
  const render = Render.create({
    element: stage,
    engine,
    options: {
      width: stage.clientWidth,
      height: stage.clientHeight,
      wireframes: false,
      background: "transparent",
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    },
  });
  const runner = Runner.create();
  const size = 46;
  const colors = ["#d4f76c", "#a5bf62", "#7a9250", "#e4ecbd"];
  let blocks = [];
  let floorY = 0;
  let floor;
  let drag = null;
  let heldFor = 0;
  let keyboardStep = 0;

  function reset() {
    if (!stage.clientWidth) return;
    release();
    Composite.clear(engine.world, false);
    Engine.clear(engine);
    drag = null;
    solved = false;
    heldFor = 0;
    keyboardStep = 0;
    updateSubmit();
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    Render.setSize(render, width, height);
    floorY = height - 22;
    const wallStyle = { fillStyle: "#39432c" };
    floor = Bodies.rectangle(width / 2, floorY + 15, width * 2, 30, {
      isStatic: true,
      render: wallStyle,
    });
    Composite.add(engine.world, [
      floor,
      Bodies.rectangle(-15, height / 2, 30, height * 3, {
        isStatic: true,
        render: { visible: false },
      }),
      Bodies.rectangle(width + 15, height / 2, 30, height * 3, {
        isStatic: true,
        render: { visible: false },
      }),
    ]);
    blocks = colors.map((color, i) =>
      Bodies.rectangle(
        size / 2 + 12 + (i * (width - size - 24)) / 3,
        60 + (i % 2) * 55,
        size,
        size,
        {
          friction: 0.8,
          frictionStatic: 1,
          restitution: 0.03,
          frictionAir: 0.025,
          chamfer: { radius: 2 },
          render: { fillStyle: color, strokeStyle: "#efffc4", lineWidth: 1 },
        },
      ),
    );
    Composite.add(engine.world, blocks);
    stateLabel.textContent = "VENTER PÅ ET LILLE MIRAKEL";
    timerLabel.textContent = "0.0 / 5s";
    progress.style.width = "0%";
    document.querySelector("#keyboard-build").textContent =
      "Byg med tastatur ↗";
    document.querySelector("#submit-hint").textContent =
      "↳ Løs tyngdekraften ved siden af for at sende.";
  }

  function release() {
    if (drag) Composite.remove(engine.world, drag);
    drag = null;
    stage.style.cursor = "grab";
  }

  function point(event) {
    const rect = render.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * render.options.width) / rect.width,
      y: ((event.clientY - rect.top) * render.options.height) / rect.height,
    };
  }

  stage.addEventListener("pointerdown", (event) => {
    if (
      !darkMode.matches ||
      (event.pointerType === "mouse" && event.button !== 0)
    )
      return;
    const position = point(event);
    const body = Query.point(blocks, position)[0];
    if (!body) return;
    release();
    // Wake a settled block before attaching the pointer constraint.
    Matter.Sleeping.set(body, false);
    drag = Constraint.create({
      pointA: position,
      bodyB: body,
      pointB: {
        x: position.x - body.position.x,
        y: position.y - body.position.y,
      },
      length: 0,
      stiffness: 0.15,
      damping: 0.12,
      render: { visible: false },
    });
    Composite.add(engine.world, drag);
    stage.setPointerCapture(event.pointerId);
    stage.style.cursor = "grabbing";
  });
  stage.addEventListener("pointermove", (event) => {
    if (drag) drag.pointA = point(event);
  });
  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);
  stage.addEventListener("lostpointercapture", release);

  // A keyboard/single-click alternative uses the same physics and five-second test.
  document.querySelector("#keyboard-build").addEventListener("click", () => {
    release();
    const order = [...blocks].sort((a, b) => b.position.y - a.position.y);
    // Rebuild the placed portion predictably, even after a manual attempt.
    keyboardStep = Math.min(keyboardStep + 1, 4);
    order.forEach((body, i) => {
      Matter.Sleeping.set(body, false);
      Body.setAngle(body, 0);
      Body.setVelocity(body, { x: 0, y: 0 });
      Body.setAngularVelocity(body, 0);
      Body.setPosition(
        body,
        i < keyboardStep
          ? {
              x: render.options.width / 2,
              y: floorY - size / 2 - i * size - 0.5,
            }
          : {
              x: size / 2 + 5,
              y: floorY - size / 2 - (i - keyboardStep) * size,
            },
      );
    });
    document.querySelector("#keyboard-build").textContent =
      keyboardStep < 4
        ? `Placér klods ${keyboardStep + 1} / 4 ↗`
        : "Tårn bygget. Vent…";
  });

  Events.on(engine, "afterUpdate", (event) => {
    if (solved) return;
    const stable = isStableStack(blocks, floor, Query.collides, drag);
    heldFor = stable ? Math.min(5000, heldFor + event.delta) : 0;
    progress.style.width = `${heldFor / 50}%`;
    timerLabel.textContent = `${(heldFor / 1000).toFixed(1)} / 5s`;
    stateLabel.textContent = stable
      ? "HOLD VEJRET. DET STÅR ENDNU."
      : "VENTER PÅ ET LILLE MIRAKEL";
    if (heldFor >= 5000) {
      solved = true;
      stateLabel.textContent = "MENNESKE BEKRÆFTET ✓";
      document.querySelector("#submit-hint").textContent =
        "↳ Tyngdekraften er tilfreds. Du kan sende nu.";
      updateSubmit();
    }
  });

  Events.on(render, "afterRender", () => {
    const context = render.context;
    context.font = "bold 13px monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    blocks.forEach((body, i) => {
      context.save();
      context.translate(body.position.x, body.position.y);
      context.rotate(body.angle);
      context.fillStyle = "#253018";
      context.fillText(["01", "02", "03", "04"][i], 0, 0);
      context.restore();
    });
  });

  document.querySelector("#reset-challenge").addEventListener("click", reset);
  new ResizeObserver(() => {
    if (
      stage.clientWidth &&
      (stage.clientWidth !== render.options.width ||
        stage.clientHeight !== render.options.height)
    )
      reset();
  }).observe(stage);
  reset();
  return {
    start() {
      Runner.run(runner, engine);
      Render.run(render);
    },
    stop() {
      release();
      Runner.stop(runner);
      Render.stop(render);
    },
  };
}

function syncTheme() {
  if (darkMode.matches) {
    if (!window.Matter) {
      stateLabel.textContent = "FYSIKKEN KUNNE IKKE INDLÆSES. GENINDLÆS SIDEN.";
      return;
    }
    challenge ??= createChallenge();
    if (!document.hidden) challenge.start();
  } else {
    challenge?.stop();
  }
  updateSubmit();
}

darkMode.addEventListener("change", syncTheme);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) challenge?.stop();
  else syncTheme();
});
syncTheme();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!solved || sending || !darkMode.matches || !form.reportValidity()) return;
  sending = true;
  updateSubmit();
  submitButton.firstElementChild.textContent = "Sender…";
  formStatus.textContent = "";
  try {
    const result = await submitSignup(form);
    if (!result.ok) {
      formStatus.textContent =
        Object.values(result.fields || {}).join(" ") ||
        result.error ||
        "Noget gik galt. Prøv igen.";
      const invalid = Object.keys(result.fields || {})[0];
      if (invalid) form.elements.namedItem(invalid)?.focus();
      return;
    }
    pageDecay?.finish();
    formStatus.textContent = result.message;
    form.reset();
  } catch {
    formStatus.textContent =
      "Ingen forbindelse til serveren. Prøv igen om lidt.";
  } finally {
    sending = false;
    submitButton.firstElementChild.textContent = "Send indmeldelse";
    updateSubmit();
  }
});
