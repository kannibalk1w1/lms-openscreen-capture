import {
	exportTypingBundle,
	exportTypingPlayback,
	exportTypingSection,
	serializePortableTypingFile,
	type TypingPlaybackMode,
} from "./portable";
import type { TypingTake } from "./schema";

export type TypingExportKind = "section" | "text" | "playback";

export function prepareTypingDownload(
	take: TypingTake,
	sectionId: string,
	kind: TypingExportKind,
	projectId?: string,
	mode: TypingPlaybackMode = "captured-edits",
) {
	const file = exportTypingSection(take, sectionId, projectId);
	const baseName =
		file.take.title
			.replace(/\.[a-zA-Z0-9]{1,10}$/, "")
			.replace(/[^a-zA-Z0-9_-]+/g, "-")
			.slice(0, 80)
			.replace(/^-+|-+$/g, "") || "typing-section";
	const name = `${baseName}-event-${file.source.startSequence + 1}`;
	if (kind === "text")
		return {
			name: `${name}${/\.gd$/i.test(take.documentName) ? ".gd" : ".txt"}`,
			content: file.finalText,
			mime: "text/plain;charset=utf-8",
		};
	return {
		name: `${name}.${kind === "section" ? "typing-section" : "typing-playback"}.json`,
		content: serializePortableTypingFile(
			kind === "section" ? file : exportTypingPlayback(file, mode),
		),
		mime: "application/json;charset=utf-8",
	};
}

/** Uses Chromium's normal local download path. Does not save or change the project. */
export async function downloadTypingSection(
	take: TypingTake,
	sectionId: string,
	kind: TypingExportKind,
	projectId?: string,
	mode: TypingPlaybackMode = "captured-edits",
) {
	const file = prepareTypingDownload(take, sectionId, kind, projectId, mode);
	await downloadFile(file);
}

async function downloadFile(file: { content: string; mime: string; name: string }) {
	if (window.electronAPI?.saveTypingExport) {
		await window.electronAPI.saveTypingExport({ name: file.name, content: file.content });
		return;
	}
	const url = URL.createObjectURL(new Blob([file.content], { type: file.mime }));
	const link = document.createElement("a");
	link.href = url;
	link.download = file.name;
	document.body.append(link);
	try {
		link.click();
	} finally {
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
}

export async function downloadTypingBundle(
	sections: { take: TypingTake; sectionId: string; mode?: TypingPlaybackMode }[],
	mode: TypingPlaybackMode,
	projectId?: string,
) {
	const bundle = exportTypingBundle(sections, mode, projectId);
	await downloadFile({
		name: "typing-sections.typing-bundle.json",
		mime: "application/json;charset=utf-8",
		content: serializePortableTypingFile(bundle),
	});
}
