import { strict as assert } from "node:assert";
import { test } from "node:test";
import { spawnSync } from "node:child_process";

test("i tag SemVer producono titoli senza il nome del prodotto", () => {
  // Given / When / Then
  for (const [tag, expected] of [
    ["1.1.0", "1.1.0"],
    ["v2.0.0-rc.1+build.5", "2.0.0-rc.1+build.5"],
  ]) {
    const result = spawnSync(
      process.execPath,
      [".github/scripts/release-title.mjs", tag],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), expected);
  }
  const invalid = spawnSync(process.execPath, [
    ".github/scripts/release-title.mjs",
    "v01.2.3",
  ]);
  assert.notEqual(invalid.status, 0);
});
