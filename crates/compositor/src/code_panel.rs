//! Native code cards: one SVG/image path shared by preview and export on all backends.
use crate::scene::{Scene, SceneAnnotation};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeToken {
    pub text: String,
    pub color: String,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeFrame {
    pub at: f64,
    pub tokens: Vec<CodeToken>,
    pub caret_line: i32,
    pub caret_column: i32,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodePanel {
    pub origin_sec: f64,
    pub duration_sec: f64,
    pub mode: String,
    pub pause_background: bool,
    pub blur_background: bool,
    pub theme: String,
    pub font_size: f32,
    pub first_line: u32,
    pub line_numbers: bool,
    pub title: String,
    pub frames: Vec<CodeFrame>,
}
fn xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

pub fn add_backdrops(scene: &mut Scene) {
    let mut annotations = Vec::new();
    for a in std::mem::take(&mut scene.annotations) {
        if a.code_panel.as_ref().is_some_and(|c| c.blur_background) {
            let mut backdrop = a.clone();
            backdrop.id.push_str("-backdrop");
            backdrop.kind = "code-blur".into();
            backdrop.code_panel = None;
            backdrop.space = Some("frame".into());
            backdrop.x = 0.;
            backdrop.y = 0.;
            backdrop.w = 1.;
            backdrop.h = 1.;
            annotations.push(backdrop);
        }
        annotations.push(a);
    }
    scene.annotations = annotations;
}

pub fn image_source(
    a: &SceneAnnotation,
    time: f32,
    size: [f32; 2],
    output_height: f32,
) -> Option<String> {
    let c = a.code_panel.as_ref()?;
    let progress = ((time as f64 - c.origin_sec) / (c.duration_sec - 0.6).max(0.1)).clamp(0., 1.);
    let frame = if c.mode == "faithful" {
        c.frames
            .iter()
            .rev()
            .find(|f| f.at <= progress)
            .or(c.frames.first())?
    } else {
        c.frames.first()?
    };
    let total: usize = frame.tokens.iter().map(|t| t.text.chars().count()).sum();
    let mut remaining = if c.mode == "clean" {
        (total as f64 * progress).floor() as usize
    } else {
        total
    };
    let mut lines: Vec<Vec<(char, &str)>> = vec![vec![]];
    for token in &frame.tokens {
        for ch in token.text.chars() {
            if remaining == 0 {
                break;
            }
            remaining -= 1;
            if ch == '\n' {
                lines.push(vec![]);
            } else if ch == '\t' {
                for _ in 0..4 {
                    lines.last_mut()?.push((' ', &token.color));
                }
            } else if ch != '\r' {
                lines.last_mut()?.push((ch, &token.color));
            }
        }
    }
    let (w, h) = (size[0].max(16.), size[1].max(16.));
    let font = (c.font_size * output_height / 1080.).max(5.);
    let cell = font * 0.6;
    let line_h = font * 1.5;
    let header = font * 2.;
    let pad = font * 0.8;
    let gutter = if c.line_numbers { font * 3.4 } else { 0. };
    let rows = ((h - header - pad) / line_h).floor().max(1.) as usize;
    let (caret_line, caret_column) = if c.mode == "clean" {
        (lines.len() - 1, lines.last()?.len())
    } else {
        (
            (frame.caret_line.max(0) as usize).min(lines.len() - 1),
            frame.caret_column.max(0) as usize,
        )
    };
    let scroll = caret_line.saturating_sub(rows - 1);
    let columns = ((w - 2. * pad - gutter) / cell).floor().max(1.) as usize;
    let horizontal = caret_column.saturating_sub(columns.saturating_sub(2));
    let (bg, fg, border, active, muted) = if c.theme == "light" {
        ("#f4f6fa", "#25334d", "#c1cad8", "#dce7f5", "#738098")
    } else {
        ("#17202d", "#dce3ef", "#40516c", "#24354c", "#80909f")
    };
    let title: String = c.title.chars().take(60).collect();
    let mut svg = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><defs><clipPath id="card"><rect x="0" y="0" width="{w}" height="{h}" rx="10"/></clipPath></defs><g clip-path="url(#card)"><rect width="{w}" height="{h}" rx="10" fill="{bg}" stroke="{border}" stroke-width="2"/><path d="M0 {header}H{w}" stroke="{border}"/><text x="{pad}" y="{}" fill="{muted}" font-family="IBM Plex Mono" font-size="{}">{}</text>"#,
        font * 1.3,
        font * 0.72,
        xml(&title)
    );
    let active_y = header + (caret_line - scroll) as f32 * line_h;
    svg.push_str(&format!(
        r#"<rect x="0" y="{active_y}" width="{w}" height="{line_h}" fill="{active}"/>"#
    ));
    for (row, line) in lines.iter().enumerate().skip(scroll).take(rows) {
        let y = header + (row - scroll) as f32 * line_h + font * 1.12;
        if c.line_numbers {
            svg.push_str(&format!(r#"<text x="{pad}" y="{y}" fill="{muted}" font-family="IBM Plex Mono" font-size="{font}">{}</text>"#,c.first_line+row as u32));
        }
        let visible: Vec<_> = line.iter().skip(horizontal).take(columns).collect();
        let mut index = 0;
        while index < visible.len() {
            let start = index;
            let color = visible[index].1;
            let mut text = String::new();
            while index < visible.len() && visible[index].1 == color {
                text.push(visible[index].0);
                index += 1;
            }
            let x = pad + gutter + start as f32 * cell;
            let length = (index - start) as f32 * cell;
            svg.push_str(&format!(r#"<text xml:space="preserve" x="{x}" y="{y}" fill="{}" font-family="IBM Plex Mono" font-size="{font}" textLength="{length}" lengthAdjust="spacingAndGlyphs">{}</text>"#,xml(color),xml(&text)));
        }
    }
    let x = pad + gutter + caret_column.saturating_sub(horizontal).min(columns) as f32 * cell;
    let y = header + (caret_line - scroll) as f32 * line_h;
    if progress < 1. || ((time * 2.) as i32) % 2 == 0 {
        svg.push_str(&format!(
            r#"<rect x="{x}" y="{}" width="{}" height="{font}" fill="{fg}"/>"#,
            y + font * 0.18,
            (font * 0.08).max(1.)
        ));
    }
    svg.push_str("</g></svg>");
    Some(format!("openscreen-code:{svg}"))
}

pub fn frozen_source(scene: &Scene, time: f64) -> Option<(crate::scene::SceneClip, f64)> {
    let a = scene.annotations.iter().rev().find(|a| {
        a.code_panel.as_ref().is_some_and(|c| c.pause_background)
            && time >= a.start_sec
            && time < a.end_sec
    })?;
    let clip = scene.clips.get(a.clip_index.unwrap_or(0))?;
    Some((
        clip.clone(),
        a.code_panel
            .as_ref()?
            .origin_sec
            .max(0.)
            .min(clip.source_end_sec),
    ))
}

/// Separate decoders hold a deterministic source frame while the real timeline keeps advancing.
#[derive(Default)]
pub struct FrozenBackground {
    cached: Option<(
        String,
        crate::pipeline::Decoder,
        Option<crate::pipeline::Decoder>,
    )>,
}
impl FrozenBackground {
    pub unsafe fn frames(
        &mut self,
        scene: Option<&Scene>,
        time: f64,
        gpu: &crate::d3d::Gpu,
    ) -> anyhow::Result<Option<(*mut crate::ffi::AVFrame, *mut crate::ffi::AVFrame, f64)>> {
        self.frames_for_source(scene.and_then(|scene| frozen_source(scene, time)), gpu)
    }
    pub unsafe fn frames_for_source(
        &mut self,
        request: Option<(crate::scene::SceneClip, f64)>,
        gpu: &crate::d3d::Gpu,
    ) -> anyhow::Result<Option<(*mut crate::ffi::AVFrame, *mut crate::ffi::AVFrame, f64)>> {
        let Some((clip, target)) = request else {
            self.cached = None;
            return Ok(None);
        };
        let key = format!(
            "{}|{}|{}|{}",
            clip.screen_path, clip.webcam_path, clip.webcam_offset_sec, target
        );
        if self.cached.as_ref().is_none_or(|(k, _, _)| k != &key) {
            let mut screen = crate::pipeline::Decoder::open_for_export(&clip.screen_path, gpu)?;
            screen.seek_to_or_last(target)?;
            let webcam = if clip.webcam_path.is_empty() {
                None
            } else {
                let mut d = crate::pipeline::Decoder::open_for_export(&clip.webcam_path, gpu)?;
                d.seek_to_or_last((target - clip.webcam_offset_sec).max(0.))?;
                Some(d)
            };
            self.cached = Some((key, screen, webcam));
        }
        let (_, screen, webcam) = self.cached.as_ref().unwrap();
        let sf = screen.cur_frame();
        let wf = webcam.as_ref().map(|d| d.cur_frame()).unwrap_or(sf);
        if sf.is_null() || wf.is_null() {
            anyhow::bail!("Frozen code background has no frame");
        }
        Ok(Some((sf, wf, target)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn annotation(mode: &str) -> SceneAnnotation {
        serde_json::from_value(serde_json::json!({"id":"code","kind":"code","startSec":1,"endSec":5,"x":0.1,"y":0.1,"w":0.8,"h":0.8,"codePanel":{"originSec":1,"durationSec":4,"mode":mode,"pauseBackground":true,"blurBackground":true,"theme":"dark","fontSize":26,"firstLine":1,"lineNumbers":true,"title":"lesson.gd","frames":[{"at":0,"tokens":[{"text":"var hp = 10\nprint(\"<safe>\")","color":"#c792ea"}],"caretLine":0,"caretColumn":3}]}})).unwrap()
    }
    #[test]
    fn code_progress_uses_time_and_escapes_source() {
        let a = annotation("clean");
        let early = image_source(&a, 1., [800., 500.], 1080.).unwrap();
        let last = image_source(&a, 4.9, [800., 500.], 1080.).unwrap();
        assert!(!early.contains("&lt;safe&gt;"));
        assert!(last.contains("&lt;safe&gt;"));
        assert!(last.contains("IBM Plex Mono"));
        assert!(last.contains("#c792ea"));
    }
    #[test]
    fn faithful_shows_the_captured_frame_instead_of_character_reveal() {
        let a = annotation("faithful");
        assert!(image_source(&a, 1., [800., 500.], 1080.)
            .unwrap()
            .contains("&lt;safe&gt;"));
    }
    #[test]
    fn code_raster_is_a_visible_rgba_panel() {
        let a = annotation("clean");
        let source = image_source(&a, 4.9, [800., 500.], 1080.).unwrap();
        let image = crate::svg_image::load(&source, 800).unwrap();
        assert_eq!(image.dimensions(), (800, 500));
        assert!(image.pixels().filter(|p| p[0] > 130 && p[2] > 130).count() > 100);
    }
}
