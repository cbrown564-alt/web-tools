import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, cp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runFormRehearsal,
  docxFixture,
  defaultFormProfile,
  validateFormProfile,
} from "../scripts/release/forms.mjs";
import { unzipSync, strFromU8 } from "fflate";
test("marked form delivery verifies attachments, error recovery, lost responses, validation and scoped cleanup on both devices", async () => {
  const dir = await mkdtemp(join(tmpdir(), "release-forms-"));
  try {
    const r = await runFormRehearsal(
      { id: "fixture", name: "Synthetic form rehearsal" },
      dir,
    );
    assert.equal(r.rows.length, 18);
    assert.equal(
      r.state,
      "passed",
      JSON.stringify(r.rows.filter((r) => r.state !== "passed")),
    );
    assert.equal(r.cleanupVerified, true);
    assert.equal(r.unrelatedRecordPreserved, true);
    assert.ok(
      r.rows
        .filter((r) => r.mode === "lost-response")
        .every((r) => r.retrySuppressed && r.deliveryFoundAfterResponseLoss),
    );
    assert.ok(
      r.rows
        .filter((r) => r.mode === "validation")
        .every((r) => r.validationVerified),
    );
    const marker = "WEBTOOLS-TEST-example";
    assert.ok(
      strFromU8(unzipSync(docxFixture(marker))["word/document.xml"]).includes(
        marker,
      ),
    );
    if (process.env.SAVE_RELEASE_FIXTURES) {
      await mkdir("output/verification/release", { recursive: true });
      await cp(dir, "output/verification/release/form-fixture", {
        recursive: true,
        force: true,
      });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("wrong receipt recipient fails and still removes every scoped test message", async () => {
  const dir = await mkdtemp(join(tmpdir(), "release-forms-wrong-"));
  try {
    const r = await runFormRehearsal(
      { id: "fixture", name: "Wrong-inbox fixture" },
      dir,
      { wrongRecipient: true },
    );
    assert.equal(r.state, "failed");
    assert.ok(
      r.rows.every((r) => r.state === "failed" && /recipient/.test(r.error)),
    );
    assert.equal(r.cleanupVerified, true);
    assert.equal(r.unrelatedRecordPreserved, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("configured isolated local profiles reuse the harness and reject external or mismatched environments", async () => {
  const { formFixture } = await import("../scripts/release/form-fixture.mjs");
  const fixture = await formFixture({
      id: "fixture",
      name: "Configured profile fixture",
    }),
    dir = await mkdtemp(join(tmpdir(), "release-profile-"));
  try {
    const profile = {
      ...defaultFormProfile,
      projectId: "fixture",
      baseUrl: fixture.base,
    };
    assert.throws(
      () =>
        validateFormProfile(
          { ...profile, baseUrl: "https://example.com" },
          "fixture",
        ),
      /loopback/,
    );
    assert.throws(() =>
      validateFormProfile({ ...profile, isolated: false }, "fixture"),
    );
    assert.throws(() => validateFormProfile(profile, "foreign"));
    fixture.messages.set("unrelated", { marker: "unrelated" });
    const result = await runFormRehearsal(
      { id: "fixture", name: "Configured local fixture" },
      dir,
      { profile },
    );
    assert.equal(result.mode, "configured-local");
    assert.equal(
      result.state,
      "passed",
      JSON.stringify(result.rows.filter((r) => r.state === "failed")),
    );
    assert.equal(result.cleanupVerified, true);
    assert.equal(fixture.messages.size, 1);
    assert.ok(fixture.messages.has("unrelated"));
  } finally {
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  }
});
