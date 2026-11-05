//! Optional compositor input source. Never runs alongside evdev. A disconnected
//! or invalid stream becomes unavailable; switching sources mid-take could double
//! count held buttons, so recovery requires a new recording.
use crate::{events::timestamp_ms, Message};
use serde::Deserialize;
use std::io::{BufRead, BufReader};
use std::os::unix::net::UnixStream;
use std::sync::mpsc::Sender;
use std::time::Duration;

pub const DRIVER: &str = "linux-kwin";
pub const SCOPE: &str = "global-compositor-buttons";

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Edge {
    sequence: u64,
    code: u16,
    pressed: bool,
}

fn parse_edge(line: &str, expected: u64) -> Result<Edge, String> {
    let edge: Edge = serde_json::from_str(line).map_err(|e| e.to_string())?;
    if edge.sequence != expected || !(0x110..=0x117).contains(&edge.code) {
        return Err("invalid button or missing compositor sequence".into());
    }
    Ok(edge)
}

pub fn spawn_reader(sender: &Sender<Message>) -> super::input::ClickCapture {
    let Some(runtime) = std::env::var_os("XDG_RUNTIME_DIR") else {
        return super::input::ClickCapture::NoDevice;
    };
    let path = std::path::PathBuf::from(runtime).join("openscreen-kwin-input-v1.sock");
    let Ok(stream) = UnixStream::connect(path) else {
        return super::input::ClickCapture::NoDevice;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
    let mut reader = BufReader::new(stream);
    let mut hello = String::new();
    // Limit even a malformed local producer; do not allocate unbounded lines.
    if read_line(&mut reader, &mut hello).is_err() || hello != "openscreen-kwin-buttons-v1\n" {
        return super::input::ClickCapture::NoDevice;
    }
    let _ = reader.get_ref().set_read_timeout(None);
    let sender = sender.clone();
    std::thread::spawn(move || {
        let Err(reason) = forward_edges(&mut reader, &sender) else {
            return;
        };
        let _ = sender.send(Message::InputStatus {
            state: "unavailable",
            driver: DRIVER,
            scope: SCOPE,
        });
        let _ = sender.send(Message::PointerDiscontinuity {
            device: DRIVER.into(),
            observed_at: std::time::Instant::now(),
            reason: "stream-lost",
            detail: format!("KWin stream ended: {reason}; restart recording to reconnect"),
        });
    });
    super::input::ClickCapture::Active
}

fn forward_edges(reader: &mut impl BufRead, sender: &Sender<Message>) -> Result<(), String> {
    let mut sequence = 0;
    loop {
        let mut line = String::new();
        read_line(reader, &mut line)?;
        let edge = parse_edge(&line, sequence)?;
        sequence += 1;
        let observed_at = std::time::Instant::now();
        sender
            .send(Message::PointerButton {
                timestamp_ms: timestamp_ms(),
                monotonic_ms: crate::events::monotonic_ms_at(observed_at),
                observed_at,
                code: edge.code,
                pressed: edge.pressed,
                device: DRIVER.into(),
            })
            .map_err(|_| "capture consumer closed".to_string())?;
    }
}

fn read_line(reader: &mut impl BufRead, line: &mut String) -> Result<(), String> {
    use std::io::Read;
    let size = reader
        .take(1025)
        .read_line(line)
        .map_err(|e| e.to_string())?;
    if size == 0 || size > 1024 || !line.ends_with('\n') {
        return Err("closed or oversized compositor record".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn counts_all_buttons_and_rejects_gaps_keys_and_duplicates() {
        for (sequence, code) in (0x110..=0x117).enumerate() {
            for pressed in [true, false] {
                let line =
                    format!(r#"{{"sequence":{sequence},"code":{code},"pressed":{pressed}}}"#);
                assert!(parse_edge(&line, sequence as u64).is_ok());
                assert!(parse_edge(&line, sequence as u64 + 1).is_err());
            }
        }
        assert!(parse_edge(r#"{"sequence":0,"code":30,"pressed":true}"#, 0).is_err());
    }
    #[test]
    fn stream_preserves_order_and_stops_at_a_missing_edge() {
        let input = concat!(
            "{\"sequence\":0,\"code\":272,\"pressed\":true}\n",
            "{\"sequence\":1,\"code\":272,\"pressed\":false}\n",
            "{\"sequence\":3,\"code\":273,\"pressed\":true}\n"
        );
        let (sender, receiver) = std::sync::mpsc::channel();
        let error =
            forward_edges(&mut BufReader::with_capacity(3, input.as_bytes()), &sender).unwrap_err();
        assert!(error.contains("sequence"));
        let edges: Vec<_> = receiver.try_iter().collect();
        assert_eq!(edges.len(), 2);
        assert!(matches!(
            edges[0],
            Message::PointerButton {
                code: 272,
                pressed: true,
                ..
            }
        ));
        assert!(matches!(
            edges[1],
            Message::PointerButton {
                code: 272,
                pressed: false,
                ..
            }
        ));
    }
    #[test]
    fn rejects_unterminated_oversized_and_closed_streams() {
        for line in [
            "".to_string(),
            "{}".into(),
            format!("{}\n", "x".repeat(1024)),
        ] {
            assert!(read_line(&mut line.as_bytes(), &mut String::new()).is_err());
        }
    }
}
