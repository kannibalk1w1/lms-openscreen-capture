//! Physical mouse button edges from evdev. Never forwards keyboard keys.
//! Only readable devices advertising BTN_LEFT are opened. Trackpad taps synthesized
//! by libinput are not visible here; this is explicitly a partial input driver.
//! OPENSCREEN_DISABLE_CLICK_CAPTURE disables all device readers.

use std::collections::HashSet;
use std::io::ErrorKind;
use std::path::PathBuf;
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use evdev::{raw_stream::RawDevice, EventType, KeyCode, SynchronizationCode};

use crate::events::timestamp_ms;
use crate::Message;

/// Startup opt-in plus one-way per-take suppression. The stdin thread closes
/// forwarding immediately; queued messages are checked again on the main loop.
#[derive(Default)]
pub struct InputGate(std::sync::atomic::AtomicBool);
impl InputGate {
    pub fn new(enabled: bool) -> Self {
        Self(std::sync::atomic::AtomicBool::new(enabled))
    }
    pub fn allows(&self) -> bool {
        self.0.load(std::sync::atomic::Ordering::Acquire)
    }
    pub fn suppress(&self) {
        self.0.store(false, std::sync::atomic::Ordering::Release);
    }
}

const DISABLE_ENV: &str = "OPENSCREEN_DISABLE_CLICK_CAPTURE";

/// How often the hotplug watcher re-scans `/dev/input` for pointer devices that
/// appeared after startup. A few seconds is imperceptible for a device the user
/// just plugged in and costs a cheap directory walk.
const RESCAN_INTERVAL: Duration = Duration::from_secs(3);

/// Linux mouse button range: left, right, middle, side, extra, forward,
/// back and task. Keyboard keys, touch contact and repeat events are excluded.
pub fn is_pointer_edge(event_type: EventType, code: u16, value: i32) -> bool {
    event_type == EventType::KEY && (0x110..=0x117).contains(&code) && (value == 0 || value == 1)
}

/// What [`spawn_readers`] settled on — the caller uses it to tell the log why
/// Linux clicks are or are not being captured.
///
/// The two ways of ending up without clicks are NOT the same event: no readable
/// node is a permission the operator may still want to grant, while `DISABLE_ENV`
/// is one they explicitly declined — recommending the `input` group there answers
/// a question nobody asked.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClickCapture {
    /// Turned off by `OPENSCREEN_DISABLE_CLICK_CAPTURE`; nothing was opened.
    Disabled,
    /// No readable `/dev/input` node reports `BTN_LEFT` — the common case, when
    /// the user is not in the `input` group.
    NoDevice,
    /// At least one device is open, with a reader thread running on it.
    Active,
}

/// Opens every readable pointer device that reports `BTN_LEFT`, spawns a reader
/// thread per device, and leaves a daemon thread re-scanning for devices plugged
/// in later.
///
/// Never fails: an unreadable node (the common case, when the user is not in the
/// `input` group) is skipped by `evdev::enumerate`, and no readable node at all
/// simply means every sample stays `"move"`, exactly as before this existed. The
/// returned value reflects the INITIAL scan only — a device attached afterwards
/// is adopted by the watcher without changing it.
pub fn spawn_readers(sender: &Sender<Message>, gate: &Arc<InputGate>) -> ClickCapture {
    if !gate.allows() || std::env::var_os(DISABLE_ENV).is_some() {
        return ClickCapture::Disabled;
    }
    // Paths with a LIVE reader. Shared with the reader threads: each removes its
    // own path when it exits, so a device that unplugs and reconnects on the SAME
    // node path is adopted again by the next scan. A set that only grew skipped
    // such a replug for the rest of the recording.
    let opened: Arc<Mutex<HashSet<PathBuf>>> = Arc::new(Mutex::new(HashSet::new()));
    scan_once(sender, &opened, gate);
    let result = if opened.lock().unwrap().is_empty() {
        ClickCapture::NoDevice
    } else {
        ClickCapture::Active
    };
    // Hotplug: the one-shot scan above cannot see a mouse attached mid-recording,
    // so a daemon thread re-scans and starts readers for nodes it has not seen.
    // Detached, like the reader threads — it ends when the process does.
    let watch_sender = sender.clone();
    let watch_opened = Arc::clone(&opened);
    let watch_gate = Arc::clone(gate);
    thread::spawn(move || loop {
        thread::sleep(RESCAN_INTERVAL);
        if !watch_gate.allows() {
            break;
        }
        scan_once(&watch_sender, &watch_opened, &watch_gate);
    });
    result
}

/// Spawns a reader for every `BTN_LEFT` device not already being read, recording
/// each newly opened node's path. Shared by the initial scan and the watcher; the
/// check-and-insert is one locked step so two scans cannot both adopt one path.
fn scan_once(
    sender: &Sender<Message>,
    opened: &Arc<Mutex<HashSet<PathBuf>>>,
    gate: &Arc<InputGate>,
) {
    let before = opened.lock().unwrap().len();
    for (path, device) in evdev::raw_stream::enumerate() {
        if !gate.allows() {
            break;
        }
        if !device_reports_left_button(&device) {
            continue;
        }
        if !opened.lock().unwrap().insert(path.clone()) {
            continue; // already has a live reader
        }
        let forward = sender.clone();
        let owned = Arc::clone(opened);
        let reader_gate = Arc::clone(gate);
        thread::spawn(move || read_device(device, path, forward, owned, reader_gate));
    }
    if before != opened.lock().unwrap().len() {
        report_status(sender, opened);
    }
}

fn report_status(sender: &Sender<Message>, opened: &Arc<Mutex<HashSet<PathBuf>>>) {
    let _ = sender.send(Message::InputStatus {
        state: if opened.lock().unwrap().is_empty() {
            "unavailable"
        } else {
            "partial"
        },
        driver: "linux-evdev",
        scope: "global-physical-buttons-no-taps",
    });
}

/// A touchpad advertises `BTN_LEFT` for a physical clickpad press, so it passes
/// this check and its node is opened — but tap-to-click never arrives here.
/// libinput consumes the raw `BTN_TOUCH`/`ABS_MT_*` stream and synthesises the
/// button for its own clients without writing `BTN_LEFT` back to the kernel
/// device, so a tap is invisible at the evdev layer we read. The consequence is
/// documented for users under "Mouse clicks on Wayland" in the installation docs:
/// on a touchpad only hard presses are captured, taps are not.
fn device_reports_left_button(device: &RawDevice) -> bool {
    device
        .supported_keys()
        .is_some_and(|keys| keys.contains(KeyCode::BTN_LEFT))
}

/// Blocks reading `device`, forwarding one `PointerButton` message per physical mouse-button
/// edge, each stamped with the press time so a click is not backdated to the
/// next cursor sample. Returns when the device fails terminally (e.g. unplugged)
/// or the loop's channel has closed, so the thread cannot outlive the recording
/// it serves. A transient `EINTR` is retried, not mistaken for an unplug.
///
/// On EVERY exit it drops `path` from `opened`, so a device reconnecting on the
/// same node path is re-adopted by the next scan.
fn read_device(
    mut device: RawDevice,
    path: PathBuf,
    sender: Sender<Message>,
    opened: Arc<Mutex<HashSet<PathBuf>>>,
    gate: Arc<InputGate>,
) {
    let release = || {
        opened.lock().unwrap().remove(&path);
        report_status(&sender, &opened);
    };
    let mut recovery = RecoveryFilter::default();
    loop {
        if !gate.allows() {
            release();
            return;
        }
        let events = match device.fetch_events() {
            Ok(events) => events,
            // A signal interrupted the blocking read — not a device failure.
            Err(err) if err.kind() == ErrorKind::Interrupted => continue,
            // A real error, typically the device unplugging. Report it rather
            // than ending silently, so click capture going quiet mid-recording
            // is answerable from the log; the watcher re-adopts it on a replug.
            Err(err) => {
                // Enqueue discontinuity before making this path available for a
                // replacement reader; recovered edges must follow the reset.
                let _ = sender.send(Message::PointerDiscontinuity {
                    device: path.display().to_string(), observed_at: std::time::Instant::now(),
                    reason: "device-lost", detail: format!("{err}; remaining devices continue; reconnect a device to restore lost coverage"),
                });
                release();
                return;
            }
        };
        for event in events {
            if !gate.allows() {
                release();
                return;
            }
            if event.event_type() == EventType::SYNCHRONIZATION
                && event.code() == SynchronizationCode::SYN_DROPPED.0
            {
                let _ = sender.send(Message::PointerDiscontinuity {
                    device: path.display().to_string(), observed_at: std::time::Instant::now(),
                    reason: "kernel-overflow", detail: "evdev SYN_DROPPED: incomplete packet ignored through next SYN_REPORT; physical edges cannot be reconstructed".into(),
                });
            }
            if recovery.accept(event.event_type(), event.code())
                && is_pointer_edge(event.event_type(), event.code(), event.value())
            {
                let observed_at = std::time::Instant::now();
                let message = Message::PointerButton {
                    timestamp_ms: timestamp_ms(),
                    monotonic_ms: crate::events::monotonic_ms_at(observed_at),
                    observed_at,
                    code: event.code(),
                    pressed: event.value() == 1,
                    device: path.display().to_string(),
                };
                if sender.send(message).is_err() {
                    release();
                    return;
                }
            }
        }
    }
}

/// RawDevice never fabricates resynchronization edges. After kernel overflow,
/// ignore the incomplete packet through SYN_REPORT, then resume raw observation.
#[derive(Default)]
struct RecoveryFilter {
    dropping: bool,
}
impl RecoveryFilter {
    fn accept(&mut self, kind: EventType, code: u16) -> bool {
        if kind == EventType::SYNCHRONIZATION && code == SynchronizationCode::SYN_DROPPED.0 {
            self.dropping = true;
            return false;
        }
        if self.dropping {
            if kind == EventType::SYNCHRONIZATION && code == SynchronizationCode::SYN_REPORT.0 {
                self.dropping = false;
            }
            return false;
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_consent_never_opens_readers_and_suppression_is_one_way() {
        let (sender, receiver) = std::sync::mpsc::channel();
        let gate = Arc::new(InputGate::default());
        assert!(!gate.allows());
        assert_eq!(spawn_readers(&sender, &gate), ClickCapture::Disabled);
        assert!(receiver.try_recv().is_err());
        let enabled = InputGate::new(true);
        assert!(enabled.allows());
        enabled.suppress();
        enabled.suppress();
        assert!(!enabled.allows());
    }

    #[test]
    fn kernel_overflow_excludes_the_incomplete_packet_without_reconstructing_edges() {
        let mut recovery = RecoveryFilter::default();
        let records = [
            (EventType::KEY, 0x110, 1),
            (
                EventType::SYNCHRONIZATION,
                SynchronizationCode::SYN_DROPPED.0,
                0,
            ),
            (EventType::KEY, 0x110, 0),
            (EventType::KEY, 0x111, 1),
            (
                EventType::SYNCHRONIZATION,
                SynchronizationCode::SYN_REPORT.0,
                0,
            ),
            (EventType::KEY, 0x111, 0),
        ];
        let edges: Vec<_> = records
            .into_iter()
            .filter(|(kind, code, value)| {
                recovery.accept(*kind, *code) && is_pointer_edge(*kind, *code, *value)
            })
            .collect();
        assert_eq!(
            edges,
            vec![(EventType::KEY, 0x110, 1), (EventType::KEY, 0x111, 0)]
        );
    }

    #[test]
    fn counted_buttons_have_exactly_one_down_and_one_up() {
        let mut count = 0;
        for code in 0x110..=0x117 {
            for value in [1, 2, 0] {
                count += usize::from(is_pointer_edge(EventType::KEY, code, value));
            }
        }
        assert_eq!(count, 16);
    }

    #[test]
    fn rejects_keyboard_touch_motion_and_invalid_values() {
        for code in [KeyCode::KEY_A.0, KeyCode::BTN_TOUCH.0, 0x118] {
            assert!(!is_pointer_edge(EventType::KEY, code, 1));
        }
        assert!(!is_pointer_edge(EventType::RELATIVE, 0x110, 1));
        assert!(!is_pointer_edge(EventType::KEY, 0x110, -1));
    }
}
