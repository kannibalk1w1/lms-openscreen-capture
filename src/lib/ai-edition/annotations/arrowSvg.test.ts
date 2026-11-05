import { describe, expect, it } from "vitest";
import type { SceneAnnotation } from "../../../native/sceneDescription";
import { resolveSvgAnnotation } from "./arrowSvg";
import { decodeSvgDataUrl, svgDataUrl } from "./svgAssets";

const asset = {
	svg: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10" viewBox="0 0 20 10"><path d="M0 0L20 5L0 10Z" fill="currentColor"/></svg>',
	width: 20,
	height: 10,
};
const source: SceneAnnotation = {
	id: "arrow",
	kind: "figure",
	space: "frame",
	startSec: 0,
	endSec: 2,
	x: 0.1,
	y: 0.1,
	w: 0.8,
	h: 0.8,
	zIndex: 0,
	figure: {
		direction: "right",
		color: "#ff0000",
		strokeWidth: 4,
		connector: {
			shape: "curved",
			tail: { x: 0.1, y: 0.2 },
			head: { x: 0.8, y: 0.7 },
			bend: { x: 0.5, y: 0.1 },
		},
	},
};
describe("native SVG scene preparation", () => {
	it("retains default connector rendering and source geometry", () => {
		expect(resolveSvgAnnotation(source, { width: 1920, height: 1080 })).toBe(source);
	});
	it("builds a padded SVG with dashed shaft and custom heads at both ends", () => {
		const input = {
			...source,
			figure: {
				...source.figure!,
				linePattern: "dashed" as const,
				headStyle: "custom" as const,
				headEnds: "both" as const,
				headSvg: asset,
			},
		};
		const out = resolveSvgAnnotation(input, { width: 1920, height: 1080 });
		const svg = decodeSvgDataUrl(out.imagePath!)!;
		expect(out.kind).toBe("image");
		expect(svg).toContain("stroke-dasharray");
		expect(svg.split(asset.svg)).toHaveLength(3);
		expect(svg).toContain("rotate(");
		expect(out.x).toBeLessThan(input.x);
		expect(input.figure?.connector?.shape).toBe("curved");
	});
	it("rotates whole SVG graphics exactly once", () => {
		const graphic = {
			...source,
			kind: "image" as const,
			figure: undefined,
			imagePath: svgDataUrl(asset.svg),
			imageRotation: 45,
		};
		const out = resolveSvgAnnotation(graphic, { width: 1920, height: 1080 });
		expect(decodeSvgDataUrl(out.imagePath!)!).toContain("rotate(45)");
		expect(out.imageRotation).toBeUndefined();
		expect(resolveSvgAnnotation(out, { width: 1920, height: 1080 })).toEqual(out);
	});
});
