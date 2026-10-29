const { test } = require("node:test");
const assert = require("node:assert/strict");
const Matter = require("../public/vendor/matter.min.js");
const { isStableStack } = require("../public/stack-check.js");

function simulate({
  angles = [0, 0, 0, 0],
  offsets = [0, 0, 0, 0],
  row = false,
} = {}) {
  const { Engine, Bodies, Body, Composite } = Matter;
  const engine = Engine.create({ enableSleeping: true });
  const floor = Bodies.rectangle(200, 315, 800, 30, { isStatic: true });
  const blocks = angles.map((angle, i) => {
    const body = Bodies.rectangle(
      row ? 80 + i * 46 : 200 + offsets[i],
      row ? 277 : 277 - i * 46,
      46,
      46,
      {
        friction: 0.8,
        frictionStatic: 1,
        restitution: 0.03,
        frictionAir: 0.025,
        chamfer: { radius: 2 },
      },
    );
    Body.setAngle(body, angle);
    return body;
  });
  Composite.add(engine.world, [floor, ...blocks]);
  let consecutive = 0;
  let maxConsecutive = 0;
  for (let i = 0; i < 720; i++) {
    Engine.update(engine, 1000 / 60);
    consecutive = isStableStack(blocks, floor, Matter.Query.collides, false)
      ? consecutive + 1
      : 0;
    maxConsecutive = Math.max(maxConsecutive, consecutive);
  }
  return { engine, floor, blocks, maxConsecutive };
}

test("aligned tower stays valid for five seconds, including after sleeping", () => {
  const result = simulate();
  assert(result.maxConsecutive >= 300);
  assert(result.blocks.every((body) => body.isSleeping));
});

test("quarter-turns and full rotations do not disqualify upright squares", () => {
  assert(
    simulate({ angles: [Math.PI / 2, Math.PI, Math.PI * 2, -Math.PI / 2] })
      .maxConsecutive >= 300,
  );
});

test("a slightly crooked, offset tower still qualifies", () => {
  assert(
    simulate({ angles: [0.03, -0.04, 0.05, -0.03], offsets: [0, 3, -2, 4] })
      .maxConsecutive >= 300,
  );
});

test("a row on the floor is not a tower", () => {
  assert.equal(simulate({ row: true }).maxConsecutive, 0);
});

test("held blocks, missing contacts, missing blocks and moving towers do not qualify", () => {
  const { floor, blocks } = simulate();
  assert.equal(
    isStableStack(blocks, floor, Matter.Query.collides, true),
    false,
  );
  assert.equal(
    isStableStack(blocks, floor, () => [], false),
    false,
  );
  assert.equal(
    isStableStack(blocks.slice(1), floor, Matter.Query.collides, false),
    false,
  );
  Matter.Sleeping.set(blocks[3], false);
  Matter.Body.setVelocity(blocks[3], { x: 2, y: 0 });
  assert.equal(
    isStableStack(blocks, floor, Matter.Query.collides, false),
    false,
  );
});
