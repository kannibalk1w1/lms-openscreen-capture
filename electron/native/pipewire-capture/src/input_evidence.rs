//! Per-active-interval continuity evidence. These are observations, never synthetic releases.
use std::collections::BTreeSet;

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct ButtonIdentity {
    pub device: String,
    pub code: u16,
}

#[derive(Default)]
pub struct InputEvidence {
    pub started: bool,
    pub interval_id: u64,
    down: BTreeSet<ButtonIdentity>,
}

impl InputEvidence {
    pub fn begin(&mut self) {
        self.started = true;
        self.interval_id = 0;
        self.down.clear();
    }

    pub fn resume(&mut self) {
        self.interval_id += 1;
    }

    pub fn edge(&mut self, device: &str, code: u16, pressed: bool) -> Option<&'static str> {
        let button = ButtonIdentity {
            device: device.to_owned(),
            code,
        };
        if pressed {
            if !self.down.insert(button) {
                return Some("repeated-press");
            }
        } else if !self.down.remove(&button) {
            return Some("unmatched-release");
        }
        None
    }

    /// State observed when the control boundary was dispatched. Late queued input may
    /// still exist; this is not a claim about the simultaneous physical button state.
    pub fn close_interval(&mut self) -> Vec<ButtonIdentity> {
        std::mem::take(&mut self.down).into_iter().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ordinary_pairs_leave_no_open_buttons() {
        let mut state = InputEvidence::default();
        state.begin();
        assert_eq!(state.edge("mouse", 0x110, true), None);
        assert_eq!(state.edge("mouse", 0x110, false), None);
        assert!(state.close_interval().is_empty());
    }

    #[test]
    fn pause_closes_observed_downs_and_resume_release_is_explicitly_unmatched() {
        let mut state = InputEvidence::default();
        state.begin();
        state.edge("mouse", 0x111, true);
        assert_eq!(
            state.close_interval(),
            vec![ButtonIdentity {
                device: "mouse".into(),
                code: 0x111
            }]
        );
        state.resume();
        assert_eq!(state.interval_id, 1);
        assert_eq!(state.edge("mouse", 0x111, false), Some("unmatched-release"));
        assert!(state.close_interval().is_empty());
    }

    #[test]
    fn a_release_after_capture_start_is_not_falsely_paired() {
        let mut state = InputEvidence::default();
        state.begin();
        assert_eq!(state.edge("mouse", 0x110, false), Some("unmatched-release"));
    }

    #[test]
    fn repeated_presses_are_marked_without_inventing_a_release() {
        let mut state = InputEvidence::default();
        state.begin();
        state.edge("mouse", 0x110, true);
        assert_eq!(state.edge("mouse", 0x110, true), Some("repeated-press"));
        assert_eq!(state.close_interval().len(), 1);
    }

    #[test]
    fn devices_and_button_codes_have_independent_state() {
        let mut state = InputEvidence::default();
        state.begin();
        state.edge("one", 0x110, true);
        state.edge("two", 0x110, true);
        state.edge("one", 0x111, true);
        state.edge("one", 0x110, false);
        assert_eq!(
            state.close_interval(),
            vec![
                ButtonIdentity {
                    device: "one".into(),
                    code: 0x111
                },
                ButtonIdentity {
                    device: "two".into(),
                    code: 0x110
                },
            ]
        );
    }
}
