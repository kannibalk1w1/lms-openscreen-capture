// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GodotCheckpointComparison } from "./GodotCheckpointComparison";

const { compare } = vi.hoisted(() => ({ compare: vi.fn() }));
vi.mock("@/contexts/I18nContext", () => ({
	useScopedT: () => (key: string, vars?: Record<string, string | number>) => {
		const messages: Record<string, string> = {
			"lesson.checkpoints.title": "Compare scene checkpoints",
			"lesson.checkpoints.scope":
				"Compare checkpoints in the order you choose. Reverse comparisons are allowed.",
			"lesson.checkpoints.from": "From checkpoint",
			"lesson.checkpoints.to": "To checkpoint",
			"lesson.checkpoints.choose": "Choose a checkpoint",
			"lesson.checkpoints.compare": "Compare checkpoints",
			"lesson.checkpoints.failed":
				"Could not compare these checkpoints. Reimport the journal and try again.",
			"lesson.checkpoints.result": "Checkpoint comparison result",
			"lesson.checkpoints.counts": `Added ${vars?.added} · Removed ${vars?.removed} · Changed ${vars?.changed} · Changed fields ${vars?.changedFields}`,
			"lesson.checkpoints.added": "Nodes added",
			"lesson.checkpoints.removed": "Nodes removed",
			"lesson.checkpoints.changed": "Nodes changed",
			"lesson.checkpoints.node": `${vars?.name} (${vars?.type}) · ID ${vars?.id} · parent ${vars?.parent}`,
			"lesson.checkpoints.changedNode": `${vars?.before} → ${vars?.after} · ID ${vars?.id} · fields ${vars?.fields}`,
			"lesson.checkpoints.selection": `Selected node IDs changed from ${vars?.before} to ${vars?.after}.`,
			"lesson.checkpoints.none": "none",
		};
		return messages[key] ?? key;
	},
}));
vi.mock("@/lib/applicationIntegrations/godotScene", () => ({
	compareGodotSceneCheckpoints: compare,
}));

const checkpoints = [
	{ recordSequence: 13, label: "Enemy base", atMs: 2200, snapshotSequence: 12 },
	{ recordSequence: 47, label: "Enemy base", atMs: 8200, snapshotSequence: 46 },
];
const result = {
	from: checkpoints[0],
	to: checkpoints[1],
	counts: { added: 1, removed: 1, changed: 1, changedFields: 3 },
	added: [{ id: "node-3", name: "Sprite2D", type: "Sprite2D", parent: "enemy" }],
	removed: [{ id: "node-2", name: "OldSprite", type: "Sprite2D", parent: "enemy" }],
	changed: [
		{
			id: "enemy",
			nameBefore: "Enemy",
			nameAfter: "Enemy",
			fields: ["scale", "script", "texture"],
		},
	],
	selection: { before: ["node-2"], after: ["node-3"] },
};

beforeEach(() => {
	compare.mockReset();
});
afterEach(cleanup);
function show() {
	return render(<GodotCheckpointComparison source="raw-journal" checkpoints={checkpoints} />);
}
it("requires two distinct explicit choices and labels duplicate checkpoint names by record and time", () => {
	show();
	expect(
		(screen.getByRole("button", { name: "Compare checkpoints" }) as HTMLButtonElement).disabled,
	).toBe(true);
	const from = screen.getByLabelText("From checkpoint") as HTMLSelectElement;
	const to = screen.getByLabelText("To checkpoint") as HTMLSelectElement;
	expect(from.options[1].textContent).toContain("record #13 · 2200 ms");
	expect(to.options[2].textContent).toContain("record #47 · 8200 ms");
	fireEvent.change(from, { target: { value: "13" } });
	fireEvent.change(to, { target: { value: "13" } });
	expect(
		(screen.getByRole("button", { name: "Compare checkpoints" }) as HTMLButtonElement).disabled,
	).toBe(true);
	expect(compare).not.toHaveBeenCalled();
});
it("shows only bounded counts, node identities and changed field names; reversing is explicit", () => {
	compare.mockReturnValue(result);
	show();
	fireEvent.change(screen.getByLabelText("From checkpoint"), { target: { value: "13" } });
	fireEvent.change(screen.getByLabelText("To checkpoint"), { target: { value: "47" } });
	fireEvent.click(screen.getByRole("button", { name: "Compare checkpoints" }));
	expect(compare).toHaveBeenCalledWith("raw-journal", 13, 47);
	expect(screen.getByText("Added 1 · Removed 1 · Changed 1 · Changed fields 3")).toBeTruthy();
	expect(screen.getByText(/Sprite2D \(Sprite2D\) · ID node-3 · parent enemy/)).toBeTruthy();
	expect(screen.getByText(/Enemy → Enemy · ID enemy · fields scale, script, texture/)).toBeTruthy();
	expect(screen.getByText(/Selected node IDs changed from node-2 to node-3/)).toBeTruthy();
	expect(screen.queryByText(/res:\/\/|secret|payload value/i)).toBeNull();
	expect(screen.queryByRole("button", { name: /save|export|append/i })).toBeNull();

	fireEvent.change(screen.getByLabelText("From checkpoint"), { target: { value: "47" } });
	expect(screen.queryByRole("region", { name: "Checkpoint comparison result" })).toBeNull();
	fireEvent.change(screen.getByLabelText("To checkpoint"), { target: { value: "13" } });
	fireEvent.click(screen.getByRole("button", { name: "Compare checkpoints" }));
	expect(compare).toHaveBeenLastCalledWith("raw-journal", 47, 13);
});
it("replaces comparison errors with fixed copy and clears them when a choice changes", () => {
	compare.mockImplementation(() => {
		throw new Error("PRIVATE_RESOURCE_VALUE");
	});
	show();
	fireEvent.change(screen.getByLabelText("From checkpoint"), { target: { value: "13" } });
	fireEvent.change(screen.getByLabelText("To checkpoint"), { target: { value: "47" } });
	fireEvent.click(screen.getByRole("button", { name: "Compare checkpoints" }));
	expect(screen.getByRole("alert").textContent).toBe(
		"Could not compare these checkpoints. Reimport the journal and try again.",
	);
	expect(screen.queryByText("PRIVATE_RESOURCE_VALUE")).toBeNull();
	fireEvent.change(screen.getByLabelText("To checkpoint"), { target: { value: "13" } });
	expect(screen.queryByRole("alert")).toBeNull();
});
