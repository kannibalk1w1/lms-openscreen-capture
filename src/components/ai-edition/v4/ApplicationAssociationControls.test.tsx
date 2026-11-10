// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { applicationCaptureSchema } from "@/lib/applicationIntegrations/capture";
import { recordingClockSchema } from "@/lib/recordingFlags";
import {
	ApplicationAssociationControls,
	type ApplicationAssociationSelection,
} from "./ApplicationAssociationControls";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function capture(scope = "fixture-document") {
	return applicationCaptureSchema.parse({
		format: "openscreen-application-capture",
		version: 1,
		adapterId: "fixture-editor",
		instanceId: "editor-instance",
		sessionId: "capture-session",
		scope,
		clock: "unmapped",
		coverage: "sampled",
		stopReason: "user-stop",
		pollIntervalMs: 100,
		durationMs: 10000,
		baseline: { objects: [] },
		observations: [
			{ id: "observation", atMs: 1500, type: "edit", label: "Changed", payload: { value: 1 } },
		],
	});
}

function source(id = "source-one", endMs = 10000) {
	return {
		id,
		label: id === "source-one" ? "Recording one" : "Recording two",
		clock: recordingClockSchema.parse({
			sessionId:
				id === "source-one"
					? "a6b5f61e-00f4-42c1-8d4c-02abc4aa7326"
					: "9c635a36-8246-4dfb-a4b2-780163ca65a0",
			clock: "recording-control-active-ms",
			segments: [{ id: "segment-a", startMs: 0, endMs }],
		}),
	};
}

function show(
	props: {
		capture?: ReturnType<typeof capture>;
		sources?: ReturnType<typeof source>[];
		onPlan?: (selection: ApplicationAssociationSelection | null) => void;
	} = {},
) {
	vi.stubGlobal("crypto", webcrypto);
	const onPlan = props.onPlan ?? vi.fn();
	const view = render(
		<I18nProvider>
			<ApplicationAssociationControls
				capture={props.capture ?? capture()}
				sources={props.sources ?? [source()]}
				onPlan={onPlan}
			/>
		</I18nProvider>,
	);
	fireEvent.click(screen.getByText("Associate recording times"));
	return { ...view, onPlan };
}

function chooseSourceAndSegment() {
	fireEvent.change(screen.getByLabelText("Recording source"), { target: { value: "source-one" } });
	fireEvent.change(screen.getByLabelText("Uninterrupted recording interval"), {
		target: { value: "segment-a" },
	});
}

function fillRange(values: [string, string, string, string]) {
	const labels = [
		"Capture start (seconds)",
		"Capture end (seconds, exclusive)",
		"Recording start (seconds)",
		"Recording end (seconds, exclusive)",
	];
	labels.forEach((label, index) =>
		fireEvent.change(screen.getByLabelText(label), { target: { value: values[index] } }),
	);
}

it("requires an explicit source and one recording interval before authoring a range", async () => {
	show();
	fillRange(["1", "2", "1", "2"]);
	fireEvent.click(screen.getByRole("button", { name: "Add range" }));
	expect(await screen.findByText("Choose a recording source first.")).toBeTruthy();
	fireEvent.change(screen.getByLabelText("Recording source"), { target: { value: "source-one" } });
	fillRange(["1", "2", "1", "2"]);
	fireEvent.click(screen.getByRole("button", { name: "Add range" }));
	expect(
		await screen.findByText("Choose one uninterrupted recording interval first."),
	).toBeTruthy();
	fireEvent.change(screen.getByLabelText("Uninterrupted recording interval"), {
		target: { value: "segment-a" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Add range" }));
	await screen.findByRole("status");
	expect(screen.getByRole("status").textContent).toContain("Current manual association: 1 ranges");
});

it("authors two manual ranges with an unmapped gap and can clear the association", async () => {
	const onPlan = vi.fn();
	show({ onPlan });
	chooseSourceAndSegment();
	fillRange(["1.001", "2.001", "1.001", "2.001"]);
	fireEvent.click(screen.getByRole("button", { name: "Add range" }));
	await screen.findByText(/Current manual association: 1 ranges/);
	fillRange(["4", "5", "6", "7"]);
	fireEvent.click(screen.getByRole("button", { name: "Add range" }));
	await screen.findByText(/Current manual association: 2 ranges/);
	expect(onPlan).toHaveBeenLastCalledWith(
		expect.objectContaining({
			sourceId: "source-one",
			plan: expect.objectContaining({ spans: expect.any(Array) }),
		}),
	);
	const selection = onPlan.mock.calls.at(-1)?.[0];
	expect(selection?.plan.spans).toHaveLength(2);
	expect(selection?.plan.spans[0].applicationStartMs).toBe(1001);
	expect(selection?.plan.spans[0].applicationEndMs).toBeLessThan(
		selection?.plan.spans[1].applicationStartMs ?? 0,
	);
	fireEvent.click(screen.getByRole("button", { name: "Clear current calibration" }));
	expect(onPlan).toHaveBeenLastCalledWith(null);
	expect(screen.queryByRole("list", { name: "Associated ranges" })).toBeNull();
});

it("keeps a valid plan when a new range overlaps or exceeds the chosen interval", async () => {
	const onPlan = vi.fn();
	show({ onPlan });
	chooseSourceAndSegment();
	fillRange(["1", "2", "1", "2"]);
	fireEvent.click(screen.getByRole("button", { name: "Add range" }));
	await screen.findByText(/Current manual association: 1 ranges/);
	const validSelection = onPlan.mock.calls.at(-1)?.[0];

	fillRange(["1.5", "2.5", "4", "5"]);
	fireEvent.click(screen.getByRole("button", { name: "Add range" }));
	await screen.findByRole("alert");
	expect(onPlan.mock.calls.filter(([selection]) => selection !== null)).toHaveLength(1);
	expect(onPlan).toHaveBeenLastCalledWith(validSelection);

	fillRange(["4", "5", "9", "11"]);
	fireEvent.click(screen.getByRole("button", { name: "Add range" }));
	await screen.findByRole("alert");
	expect(onPlan.mock.calls.filter(([selection]) => selection !== null)).toHaveLength(1);
	expect(onPlan).toHaveBeenLastCalledWith(validSelection);
});

it("ignores a late plan when the capture is replaced during hashing", async () => {
	const onPlan = vi.fn();
	const view = show({ onPlan });
	chooseSourceAndSegment();
	fillRange(["1", "2", "1", "2"]);
	const originalDigest = webcrypto.subtle.digest.bind(webcrypto.subtle);
	let releaseDigest: () => void = () => undefined;
	const digestSpy = vi.spyOn(webcrypto.subtle, "digest");
	digestSpy.mockImplementationOnce(
		(algorithm, data) =>
			new Promise((resolve, reject) => {
				releaseDigest = () => {
					void originalDigest(algorithm, data).then(resolve, reject);
				};
			}),
	);
	fireEvent.click(screen.getByRole("button", { name: "Add range" }));
	await waitFor(() => expect(digestSpy).toHaveBeenCalledTimes(1));
	view.rerender(
		<I18nProvider>
			<ApplicationAssociationControls
				capture={capture("replacement-document")}
				sources={[source()]}
				onPlan={onPlan}
			/>
		</I18nProvider>,
	);
	await act(async () => releaseDigest());
	await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
	expect(onPlan.mock.calls.some(([selection]) => selection !== null)).toBe(false);
	expect(screen.queryByRole("list", { name: "Associated ranges" })).toBeNull();
});
