//! Shared image decoding, including vector SVGs rasterized for the render target.
//! resvg executes no scripts; all external/embedded image resolution is disabled.
use anyhow::{bail, Context, Result};
/// Content and render-size identity: equal-length SVG edits must replace cached pixels.
pub fn source_key(source: &str, target_side: u32) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    source.hash(&mut hash); target_side.hash(&mut hash); hash.finish()
}
pub fn load(path: &str, target_side: u32) -> Result<image::RgbaImage> {
    let svg = path.starts_with("openscreen-code:") || path.starts_with("data:image/svg+xml") || path.to_ascii_lowercase().ends_with(".svg");
    if !svg {
        return Ok(if let Some(bytes) = crate::frame_geometry::decode_data_uri(path) {
            image::load_from_memory(&bytes)?.to_rgba8()
        } else { image::open(path)?.to_rgba8() });
    }
    let bytes = if let Some(source) = path.strip_prefix("openscreen-code:") { source.as_bytes().to_vec() } else { match crate::frame_geometry::decode_data_uri(path) { Some(bytes) => bytes, None => std::fs::read(path)? } };
    if bytes.len() > 2 * 1024 * 1024 { bail!("SVG drawing exceeds size limit"); }
    let mut options = resvg::usvg::Options::default();
    static FONTS: std::sync::OnceLock<std::sync::Arc<resvg::usvg::fontdb::Database>> = std::sync::OnceLock::new();
    options.fontdb = FONTS.get_or_init(|| {
        let mut db=resvg::usvg::fontdb::Database::new();
        for file in crate::text_fonts::embedded_font_files() { let _=db.load_font_file(file); }
        db.load_system_fonts();db.set_monospace_family("IBM Plex Mono");std::sync::Arc::new(db)
    }).clone();
    options.image_href_resolver = resvg::usvg::ImageHrefResolver {
        resolve_data: Box::new(|_, _, _| None), resolve_string: Box::new(|_, _| None),
    };
    let tree = resvg::usvg::Tree::from_data(&bytes, &options).context("invalid SVG drawing")?;
    let size = tree.size();
    let scale = target_side.clamp(1, 4096) as f32 / size.width().max(size.height());
    let w = (size.width()*scale).ceil().max(1.0) as u32;
    let h = (size.height()*scale).ceil().max(1.0) as u32;
    let mut pixmap = resvg::tiny_skia::Pixmap::new(w,h).context("SVG target allocation")?;
    resvg::render(&tree,resvg::tiny_skia::Transform::from_scale(scale,scale),&mut pixmap.as_mut());
    let mut rgba = pixmap.take();
    for p in rgba.chunks_exact_mut(4) { let a=p[3] as u32; if a>0 && a<255 { for c in &mut p[..3] { *c=((*c as u32*255+a/2)/a).min(255) as u8; } } }
    image::RgbaImage::from_raw(w,h,rgba).context("SVG pixel layout")
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn renders_vectors_at_target_size_with_straight_alpha() {
        let source = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSJyZWQiIG9wYWNpdHk9IjAuNSIvPjwvc3ZnPg==";
        let img=load(source,128).unwrap();assert_eq!(img.dimensions(),(128,128));let p=img.get_pixel(64,64);assert!(p[0]>250);assert!((120..=135).contains(&p[3]));
    }
}
