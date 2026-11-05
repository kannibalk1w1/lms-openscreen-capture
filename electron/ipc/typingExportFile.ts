import fs from "node:fs/promises";
import { z } from "zod";
import { parsePortableTypingFiles } from "../../src/lib/typing/portable";
import { MAX_TYPING_BYTES, MAX_TYPING_TEXT } from "../../src/lib/typing/schema";

const requestSchema = z
	.object({
		name: z
			.string()
			.max(180)
			.regex(/^[a-zA-Z0-9_-]+\.(?:typing-(?:section|playback|bundle)\.json|gd|txt)$/),
		content: z.string().max(MAX_TYPING_BYTES),
	})
	.strict();
export type TypingExportSaveResult = { status: "saved"; path: string } | { status: "cancelled" };

/** The renderer supplies content, never a write path. Only the user's save dialog selects one. */
export async function saveTypingExportFile(
	request: unknown,
	pickPath: (name: string) => Promise<string | null>,
): Promise<TypingExportSaveResult> {
	const file = requestSchema.parse(request);
	if (Buffer.byteLength(file.content, "utf8") > MAX_TYPING_BYTES)
		throw new Error("Typing export exceeds 8 MiB");
	if (file.name.endsWith(".json")) {
		const data: unknown = JSON.parse(file.content);
		parsePortableTypingFiles(data);
		const format = z.object({ format: z.string() }).parse(data).format;
		if (!file.name.endsWith(`.${format.replace("openscreen-", "")}.json`))
			throw new Error("Typing export name does not match its format");
	} else if (file.content.length > MAX_TYPING_TEXT) throw new Error("Typing text limit exceeded");
	const destination = await pickPath(file.name);
	if (!destination) return { status: "cancelled" };
	await fs.writeFile(destination, file.content, "utf8");
	return { status: "saved", path: destination };
}
