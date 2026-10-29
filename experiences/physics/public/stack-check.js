"use strict";

// Use the physics engine's contacts, not axis-aligned bounding-box gaps or
// absolute angles: a block can rest on a corner or turn through 90/360 degrees.
function isStableStack(blocks, floor, collides, dragging) {
  if (dragging || blocks.length !== 4) return false;

  const ordered = [...blocks].sort((a, b) => b.position.y - a.position.y);
  function touching(a, b) {
    // Query the geometry directly: Matter marks solver pairs inactive once
    // bodies sleep, even though they are still resting against one another.
    return collides(a, [b]).length > 0;
  }

  return ordered.every((body, index) => {
    // Sleeping bodies may retain their pre-sleep velocity readings.
    if (
      !body.isSleeping &&
      (body.speed > 0.35 || Math.abs(body.angularVelocity) > 0.03)
    ) {
      return false;
    }
    const support = index === 0 ? floor : ordered[index - 1];
    if (!touching(body, support)) return false;
    if (index === 0) return true;

    // Require a tower, not four neighbours touching on the ground. Actual
    // contact plus vertical separation allows imperfect but supported stacks.
    const minimumRise =
      Math.min(
        body.bounds.max.y - body.bounds.min.y,
        support.bounds.max.y - support.bounds.min.y,
      ) * 0.4;
    return support.position.y - body.position.y > minimumRise;
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { isStableStack };
}
