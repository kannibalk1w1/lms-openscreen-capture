import React from "react";
import ReactDOM from "react-dom/client";
import { I18nProvider } from "@/contexts/I18nContext";
import { LessonPlayer } from "./LessonPlayer";
import "./lessonPlayer.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<I18nProvider>
			<LessonPlayer api={window.lessonPlayer} />
		</I18nProvider>
	</React.StrictMode>,
);
