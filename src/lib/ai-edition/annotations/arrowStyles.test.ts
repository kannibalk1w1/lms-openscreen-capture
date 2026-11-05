// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import {
	arrowStyle,
	lastArrowStyle,
	loadArrowStyles,
	readArrowStyle,
	rememberArrowStyle,
	saveArrowStyles,
} from "./arrowStyles";

afterEach(() => localStorage.clear());
it("stores only appearance, retaining SVG source across library reloads", () => {
	const svg = { svg: '<svg viewBox="0 0 10 10"/>', width: 10, height: 10 };
	const style = arrowStyle({
		arrowDirection: "right",
		color: "#123456",
		strokeWidth: 5,
		headStyle: "custom",
		headSvg: svg,
		connector: {
			shape: "straight",
			tail: { x: 0, y: 0 },
			head: { x: 1, y: 1 },
			bend: { x: 0.5, y: 0.5 },
		},
	});
	expect(style).not.toHaveProperty("connector");
	saveArrowStyles([{ id: "one", name: "Teaching", style }]);
	expect(loadArrowStyles()[0].style.headSvg).toEqual(svg);
	rememberArrowStyle(style);
	expect(lastArrowStyle()).toEqual(style);
});
it("ignores malformed preset input", () => {
	expect(readArrowStyle({ color: "red", strokeWidth: Number.NaN })).toBeNull();
	localStorage.setItem("openscreen-arrow-styles-v1", "broken");
	expect(loadArrowStyles()).toEqual([]);
});
