import { z } from "zod";
export const lessonOutputSchema = z
	.object({
		version: z.literal(1),
		preset: z.enum(["standard", "large-print", "high-contrast"]),
		language: z
			.string()
			.min(2)
			.max(64)
			.refine((value) => {
				try {
					return Intl.getCanonicalLocales(value).length === 1;
				} catch {
					return false;
				}
			}, "Invalid content language")
			.transform((value) => Intl.getCanonicalLocales(value)[0]),
		direction: z.enum(["auto", "ltr", "rtl"]),
		includeImages: z.boolean(),
		includeCode: z.boolean(),
	})
	.strict();
export type LessonOutput = z.infer<typeof lessonOutputSchema>;
export const defaultLessonOutput = (): LessonOutput => ({
	version: 1,
	preset: "standard",
	language: "en",
	direction: "auto",
	includeImages: true,
	includeCode: true,
});
export function lessonOutput(lesson: { output?: LessonOutput }): LessonOutput {
	return lesson.output ?? defaultLessonOutput();
}
export function guideAppearance(output: LessonOutput) {
	if (output.preset === "large-print")
		return {
			fontSize: 24,
			lineHeight: 1.8,
			foreground: "#111111",
			muted: "#333333",
			background: "#ffffff",
			codeBackground: "#eeeeee",
		};
	if (output.preset === "high-contrast")
		return {
			fontSize: 20,
			lineHeight: 1.7,
			foreground: "#000000",
			muted: "#000000",
			background: "#ffffff",
			codeBackground: "#ffffff",
		};
	return {
		fontSize: 18,
		lineHeight: 1.6,
		foreground: "#17202a",
		muted: "#46515d",
		background: "#ffffff",
		codeBackground: "#f1f3f5",
	};
}
