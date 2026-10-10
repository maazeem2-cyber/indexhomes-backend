import assert from "node:assert/strict";
import { computeDisplayPrice, computeIndex, STARTING_INDEX } from "./pricing.js";

assert.equal(computeIndex(0, 0), STARTING_INDEX);
assert.equal(computeIndex(5000, 2), 2500);
assert.equal(computeDisplayPrice(1000, 10, 10), 1000);
assert.equal(computeDisplayPrice(1000, 12, 10), 1200);
assert.equal(computeDisplayPrice(1500, 11, 10), 1650);

console.log("pricing tests passed");
