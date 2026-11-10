import { LessonOperationError } from "../../src/lib/lesson/api";

interface EditorOwner {
	getURL(): string;
	isDestroyed(): boolean;
}
function canonicalURL(value: string) {
	try {
		const url = new URL(value);
		// Electron loadFile uses %20 while URLSearchParams uses + for query spaces.
		url.search = url.searchParams.toString();
		return url.toString();
	} catch {
		return null;
	}
}
/** Only windows created as editors can establish range-source authority. */
export class EditorRangeSessions {
	private readonly editors = new WeakMap<EditorOwner, { url: string; projectId: string | null }>();
	register(owner: EditorOwner, url: string) {
		const canonical = canonicalURL(url);
		if (canonical) this.editors.set(owner, { url: canonical, projectId: null });
	}
	select(owner: EditorOwner, projectId: string | null) {
		const editor = this.editors.get(owner);
		if (!editor || owner.isDestroyed() || canonicalURL(owner.getURL()) !== editor.url) return;
		// Replace even for the same ID: close/reopen must invalidate outstanding work.
		this.editors.set(owner, { ...editor, projectId });
	}
	/** A registered editor window still on its exact app page; no project or saved-state claim. */
	isEditorPage(owner: EditorOwner) {
		const editor = this.editors.get(owner);
		return !!editor && !owner.isDestroyed() && canonicalURL(owner.getURL()) === editor.url;
	}
	invalidate(owner: EditorOwner) {
		const editor = this.editors.get(owner);
		if (editor) this.editors.set(owner, { ...editor, projectId: null });
	}
	capture(owner: EditorOwner, hasUnsavedChanges: () => boolean) {
		const editor = this.editors.get(owner);
		const assertCurrent = () => {
			if (
				!editor?.projectId ||
				this.editors.get(owner) !== editor ||
				owner.isDestroyed() ||
				canonicalURL(owner.getURL()) !== editor.url ||
				hasUnsavedChanges()
			)
				throw new LessonOperationError("project-changed");
		};
		assertCurrent();
		return { owner, projectId: editor!.projectId!, assertCurrent };
	}
}
export const editorRangeSessions = new EditorRangeSessions();
