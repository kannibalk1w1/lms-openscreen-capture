import { describe, expect, it } from "vitest";
import { annotationRegionSchema } from "../schema";
import {
	changeConnectorShape,
	connectorPatch,
	connectorPoints,
	nextStepNumber,
} from "./connectors";

const base = {
	id: "a",
	startMs: 0,
	endMs: 2000,
	type: "figure",
	content: "",
	position: { x: 0, y: 0 },
	size: { width: 10, height: 10 },
	style: {},
	zIndex: 0,
};
function region(patch: ReturnType<typeof connectorPatch>) {
	return annotationRegionSchema.parse({ ...base, ...patch });
}
describe("vector connectors", () => {
	it("preserves arbitrary reversed endpoints through save/reopen and rectangular scaling", () => {
		const r = region(
			connectorPatch({ x: 83, y: 12 }, { x: 17, y: 74 }, { x: 50, y: 43 }, "straight"),
		);
		const headSvg = {
			svg: '<svg viewBox="0 0 20 10"><path d="M0 0L20 5L0 10Z"/></svg>',
			width: 20,
			height: 10,
		};
		Object.assign(r.figureData!, {
			headSvg,
			headStyle: "custom",
			headEnds: "both",
			linePattern: "dashed",
			headScale: 1.5,
		});
		const parsed = annotationRegionSchema.parse(JSON.parse(JSON.stringify(r)));
		expect(parsed.figureData).toMatchObject({
			headSvg,
			headStyle: "custom",
			headEnds: "both",
			linePattern: "dashed",
			headScale: 1.5,
		});
		expect(changeConnectorShape(parsed, "elbow").figureData).toMatchObject({
			headSvg,
			headStyle: "custom",
			headScale: 1.5,
		});
		expect(connectorPoints(parsed)).toEqual({
			tail: { x: 83, y: 12 },
			head: { x: 17, y: 74 },
			bend: { x: 50, y: 43 },
		});
		const enlarged = {
			...parsed,
			size: { width: parsed.size.width * 1.2, height: parsed.size.height * 0.8 },
		};
		expect(connectorPoints(enlarged).tail.x).toBeCloseTo(
			parsed.position.x + (83 - parsed.position.x) * 1.2,
		);
		expect(enlarged.figureData?.connector?.shape).toBe("straight");
	});
	it("changes shape without moving endpoints or losing colour and line thickness", () => {
		const r = region(
			connectorPatch({ x: 10, y: 20 }, { x: 80, y: 70 }, { x: 45, y: 45 }, "straight"),
		);
		r.figureData!.color = "#abcdef";
		r.figureData!.strokeWidth = 9;
		for (const shape of ["curved", "elbow", "straight"] as const) {
			const next = { ...r, ...changeConnectorShape(r, shape) };
			const p = connectorPoints(next);
			expect(p.tail.x).toBeCloseTo(10);
			expect(p.head.y).toBeCloseTo(70);
			expect(next.figureData).toMatchObject({
				color: "#abcdef",
				strokeWidth: 9,
				connector: { shape },
			});
		}
	});
	it("rejects non-finite or out-of-range persisted control points", () => {
		const r = region(
			connectorPatch({ x: 10, y: 20 }, { x: 80, y: 70 }, { x: 45, y: 45 }, "curved"),
		);
		r.figureData!.connector!.head.x = Number.NaN;
		expect(() => annotationRegionSchema.parse(r)).toThrow();
	});
	it("numbers step boxes after the highest existing step, ignoring other text", () => {
		expect(
			nextStepNumber([
				{ type: "text", content: "3. Open settings" },
				{ type: "text", content: "Notes" },
				{ type: "figure", content: "100. Ignore" },
			]),
		).toBe(4);
	});
});
