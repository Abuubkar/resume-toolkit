import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aggregateGaps, createApplication, saveApplication } from "../src/index.js";
import { tempDir } from "./helpers.js";

function seed(root, id, requirements) {
  saveApplication(root, { ...createApplication({ id }), requirements }, { jd: "" });
}

describe("aggregateGaps", () => {
  it("says nothing when there is nothing", () => {
    assert.deepEqual(aggregateGaps(tempDir("gaps")), { total: 0, gaps: [] });
  });

  it("counts applications even when none of them has a gap", () => {
    const root = tempDir("gaps");
    seed(root, "a", [{ id: "r1", text: "Django", covers: ["role.acme"] }]);
    assert.deepEqual(aggregateGaps(root), { total: 1, gaps: [] });
  });

  // The reason tags exist: three postings, three phrasings, one lack.
  it("groups differently-worded requirements by their tag", () => {
    const root = tempDir("gaps");
    seed(root, "a", [{ id: "r1", text: "production Kubernetes experience", tag: "Kubernetes" }]);
    seed(root, "b", [{ id: "r1", text: "Kubernetes in production", tag: "Kubernetes" }]);
    seed(root, "c", [{ id: "r1", text: "K8s experience", tag: "Kubernetes" }]);

    const { total, gaps } = aggregateGaps(root);
    assert.equal(total, 3);
    assert.equal(gaps.length, 1);
    assert.deepEqual(gaps[0].applications, ["a", "b", "c"]);
    assert.equal(gaps[0].count, 3);
    assert.equal(gaps[0].label, "Kubernetes");
  });

  it("falls back to normalised text when no tag is given", () => {
    const root = tempDir("gaps");
    seed(root, "a", [{ id: "r1", text: "Kubernetes" }]);
    seed(root, "b", [{ id: "r1", text: "  kubernetes!  " }]);

    const { gaps } = aggregateGaps(root);
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].count, 2);
  });

  it("keeps tagged and untagged groups apart rather than guessing", () => {
    const root = tempDir("gaps");
    seed(root, "a", [{ id: "r1", text: "K8s", tag: "Kubernetes" }]);
    seed(root, "b", [{ id: "r1", text: "Kubernetes" }]);
    assert.equal(aggregateGaps(root).gaps.length, 2);
  });

  it("counts one application once, however often it restates a gap", () => {
    const root = tempDir("gaps");
    seed(root, "a", [
      { id: "r1", text: "Kubernetes", tag: "Kubernetes" },
      { id: "r2", text: "K8s operators", tag: "Kubernetes" },
    ]);

    const { gaps } = aggregateGaps(root);
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].count, 1);
  });

  it("ignores requirements that are covered", () => {
    const root = tempDir("gaps");
    seed(root, "a", [
      { id: "r1", text: "Django", tag: "Django", covers: ["role.acme"] },
      { id: "r2", text: "Kubernetes", tag: "Kubernetes", covers: [] },
    ]);
    assert.deepEqual(aggregateGaps(root).gaps.map((g) => g.label), ["Kubernetes"]);
  });

  it("ranks by frequency, then alphabetically", () => {
    const root = tempDir("gaps");
    seed(root, "a", [{ id: "r1", tag: "Kubernetes", text: "k8s" }, { id: "r2", tag: "Terraform", text: "tf" }]);
    seed(root, "b", [{ id: "r1", tag: "Kubernetes", text: "k8s" }, { id: "r2", tag: "Go", text: "go" }]);

    assert.deepEqual(aggregateGaps(root).gaps.map((g) => [g.label, g.count]), [
      ["Kubernetes", 2],
      ["Go", 1],
      ["Terraform", 1],
    ]);
  });
});
