import type { NativeCursorType } from "@/native/contracts";
import { DEFAULT_CURSOR_SPRITES } from "./cursorThemes";

/** Embedded PNGs keep projects portable and undoable without an external asset folder. */
export interface CustomCursor {
	dataUrl: string;
	hotspotX: number;
	hotspotY: number;
}
export type CustomCursors = Partial<Record<NativeCursorType, CustomCursor>>;
export const CUSTOM_CURSOR_MAX_BYTES = 1024 * 1024;
export const CUSTOM_CURSOR_MAX_DIMENSION = 256;

export function readCustomCursors(value: unknown): CustomCursors {
	if (!value || typeof value !== "object") return {};
	const result: CustomCursors = {};
	for (const type of Object.keys(DEFAULT_CURSOR_SPRITES) as NativeCursorType[]) {
		const entry = (value as Record<string, unknown>)[type];
		if (!entry || typeof entry !== "object") continue;
		const { dataUrl, hotspotX, hotspotY } = entry as Record<string, unknown>;
		if (
			typeof dataUrl !== "string" ||
			dataUrl.length > CUSTOM_CURSOR_MAX_BYTES * 1.4 ||
			!/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(dataUrl) ||
			typeof hotspotX !== "number" ||
			!Number.isFinite(hotspotX) ||
			typeof hotspotY !== "number" ||
			!Number.isFinite(hotspotY)
		)
			continue;
		result[type] = {
			dataUrl,
			hotspotX: Math.max(0, Math.min(1, hotspotX)),
			hotspotY: Math.max(0, Math.min(1, hotspotY)),
		};
	}
	return result;
}

export async function importCustomCursor(file: File): Promise<CustomCursor> {
	if (
		file.size > CUSTOM_CURSOR_MAX_BYTES ||
		(file.type ? file.type !== "image/png" : !/\.png$/i.test(file.name))
	) {
		throw new Error("unsupported cursor image");
	}
	const dataUrl = await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () =>
			typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("read failed"));
		reader.onerror = () => reject(new Error("read failed"));
		reader.readAsDataURL(file);
	});
	const image = await new Promise<HTMLImageElement>((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("invalid PNG"));
		img.src = dataUrl;
	});
	if (
		!image.naturalWidth ||
		!image.naturalHeight ||
		image.naturalWidth > CUSTOM_CURSOR_MAX_DIMENSION ||
		image.naturalHeight > CUSTOM_CURSOR_MAX_DIMENSION
	) {
		throw new Error("cursor image too large");
	}
	const base64 = dataUrl.split(",")[1];
	if (!base64?.startsWith("iVBORw0KGgo")) throw new Error("invalid PNG signature");
	return { dataUrl: `data:image/png;base64,${base64}`, hotspotX: 0, hotspotY: 0 };
}
