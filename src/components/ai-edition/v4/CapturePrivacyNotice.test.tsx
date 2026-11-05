// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AxcutAsset } from "@/lib/ai-edition/schema";
import { CapturePrivacyNotice } from "./CapturePrivacyNotice";

vi.mock("@/contexts/I18nContext", () => ({ useScopedT: () => (key: string) => key }));
afterEach(cleanup);
const asset: AxcutAsset = {
	id: "video",
	kind: "video",
	originalPath: "/tmp/take.mp4",
	label: "Take",
	cameraTrack: null,
};
it.each([
	"missing",
	"legacy",
	"pending",
	"invalid",
	"mismatch",
	"bound",
	"unavailable",
	"interrupted",
	"conflict",
] as const)("shows %s association status with its privacy limits", (status) => {
	render(
		<CapturePrivacyNotice
			asset={{ ...asset, capturePrivacy: { status, journalPresent: false } }}
		/>,
	);
	expect(screen.getByText(`capturePrivacy.${status}`)).toBeInTheDocument();
	expect(screen.getByText("capturePrivacy.limit")).toBeInTheDocument();
});
it("shows an absent receipt as unverified and omits audio assets", () => {
	const { rerender } = render(<CapturePrivacyNotice asset={asset} />);
	expect(screen.getByText("capturePrivacy.missing")).toBeInTheDocument();
	rerender(<CapturePrivacyNotice asset={{ ...asset, kind: "audio" }} />);
	expect(screen.queryByText("capturePrivacy.title")).not.toBeInTheDocument();
});
