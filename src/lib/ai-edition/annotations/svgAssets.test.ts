// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { decodeSvgDataUrl, rotatedSvgGraphic, sanitizeSvg, svgDataUrl } from "./svgAssets";

describe("SVG drawing import", () => {
	it("preserves paths, gradients, internal references and Unicode metadata-free source", () => {
		const asset = sanitizeSvg(
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><title>Flèche</title><defs><linearGradient id="g"><stop stop-color="red"/></linearGradient></defs><path d="M0 0L40 10L0 20Z" fill="url(#g)"/></svg>',
		);
		expect(asset.width).toBe(40);
		expect(asset.svg).toContain("url(#g)");
		expect(asset.svg).toContain("<path");
		expect(asset.svg).not.toContain("<title");
		expect(decodeSvgDataUrl(svgDataUrl(asset.svg))).toBe(asset.svg);
		expect(
			new DOMParser().parseFromString(asset.svg, "image/svg+xml").querySelector("parsererror"),
		).toBeNull();
	});
	it("accepts shape drawings with dimensions and no namespace", () => {
		expect(
			sanitizeSvg('<svg width="32" height="16"><path d="M0 0L32 8L0 16Z"/></svg>'),
		).toMatchObject({ width: 32, height: 16 });
	});
	it.each([
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script></svg>',
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path onload="alert(1)"/></svg>',
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><use href="https://example.com/a.svg#head"/></svg>',
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="url(https://example.com/a)"/></svg>',
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="file:///private.png"/></svg>',
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 10"/>',
		'<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///a">]><svg viewBox="0 0 1 1"/>',
	])("rejects interactive, external, embedded-raster or invalid SVG input", (source) => {
		expect(() => sanitizeSvg(source)).toThrow();
	});
	it("expands a rotated graphic canvas instead of clipping its corners", () => {
		const a = sanitizeSvg('<svg viewBox="0 0 40 20"><rect width="40" height="20"/></svg>');
		const rotated = rotatedSvgGraphic(a.svg, 90);
		expect(rotated).toContain("rotate(90)");
		expect(rotated).toContain(a.svg);
	});
});
