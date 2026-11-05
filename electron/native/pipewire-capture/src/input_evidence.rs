//! Per-active-interval continuity evidence. These are observations, never synthetic releases.
use std::collections::{BTreeMap, BTreeSet};
use std::time::Instant;

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct ButtonIdentity {
    pub device: String,
    pub code: u16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterruptedButton {
    pub interval_id: u64,
    pub code: u16,
}

#[derive(Default)]
pub struct InputEvidence {
    pub started: bool,
    pub interval_id: u64,
    down: BTreeMap<u64, BTreeSet<ButtonIdentity>>,
    last_observed: BTreeMap<(u64, String), Instant>,
}

impl InputEvidence {
    pub fn begin(&mut self) {
        self.started = true;
        self.interval_id = 0;
        self.down.clear();
        self.last_observed.clear();
    }

    pub fn resume(&mut self) {
        self.interval_id += 1;
    }

    #[cfg(test)]
    pub fn edge(&mut self, device: &str, code: u16, pressed: bool) -> Option<&'static str> {
        self.edge_in_interval(self.interval_id, device, code, pressed)
    }

    pub fn observed_edge(
        &mut self,
        interval: u64,
        at: Instant,
        device: &str,
        code: u16,
        pressed: bool,
    ) -> Option<&'static str> {
        let key = (interval, device.to_owned());
        if self.last_observed.get(&key).is_some_and(|last| at < *last) {
            return Some("out-of-order");
        }
        self.last_observed.insert(key, at);
        self.edge_in_interval(interval, device, code, pressed)
    }

    fn edge_in_interval(
        &mut self,
        interval: u64,
        device: &str,
        code: u16,
        pressed: bool,
    ) -> Option<&'static str> {
        let down = self.down.entry(interval).or_default();
        let button = ButtonIdentity {
            device: device.to_owned(),
            code,
        };
        if pressed {
            if !down.insert(button) {
                return Some("repeated-press");
            }
        } else if !down.remove(&button) {
            return Some("unmatched-release");
        }
        None
    }

    /// Forget this source's continuity only. This records uncertainty, never releases.
    pub fn interrupt_device(&mut self, device: &str) -> Vec<InterruptedButton> {
        let mut cleared = Vec::new();
        for (interval_id, down) in &mut self.down {
            down.retain(|button| {
                if button.device != device {
                    return true;
                }
                cleared.push(InterruptedButton {
                    interval_id: *interval_id,
                    code: button.code,
                });
                false
            });
        }
        self.last_observed.retain(|(_, source), _| source != device);
        cleared
    }

    /// Snapshot at boundary dispatch. Retain historical state so a later delivery
    /// from this interval can be reconciled without touching the resumed interval.
    pub fn close_interval(&mut self) -> Vec<ButtonIdentity> {
        self.down
            .get(&self.interval_id)
            .map(|down| down.iter().cloned().collect())
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn late_edges_keep_their_historical_interval_and_do_not_join_a_resumed_drag() {
        let mut state = InputEvidence::default();
        let at = Instant::now();
        state.begin();
        assert_eq!(state.observed_edge(0, at, "mouse", 0x110, true), None);
        assert_eq!(state.close_interval().len(), 1);
        state.resume();
        assert_eq!(state.observed_edge(0, at, "mouse", 0x110, false), None);
        assert!(state.close_interval().is_empty());
        assert_eq!(
            state.observed_edge(1, at, "mouse", 0x110, false),
            Some("unmatched-release")
        );
    }

    #[test]
    fn reordered_delivery_is_explicit_and_does_not_corrupt_observed_state() {
        let mut state = InputEvidence::default();
        let at = Instant::now();
        state.begin();
        state.observed_edge(
            0,
            at + std::time::Duration::from_millis(10),
            "mouse",
            0x110,
            false,
        );
        assert_eq!(
            state.observed_edge(0, at, "mouse", 0x110, true),
            Some("out-of-order")
        );
        assert!(state.close_interval().is_empty());
        assert_eq!(state.observed_edge(0, at, "other", 0x110, true), None);
        assert_eq!(state.close_interval().len(), 1);
    }

    #[test]
    fn device_loss_clears_only_that_sources_historical_and_current_continuity() {
        let mut state = InputEvidence::default();
        state.begin();
        state.edge("lost", 0x110, true);
        state.resume();
        state.edge("lost", 0x111, true);
        state.edge("other", 0x110, true);
        assert_eq!(
            state.interrupt_device("lost"),
            vec![
                InterruptedButton {
                    interval_id: 0,
                    code: 0x110
                },
                InterruptedButton {
                    interval_id: 1,
                    code: 0x111
                }
            ]
        );
        assert_eq!(state.edge("lost", 0x111, false), Some("unmatched-release"));
        assert_eq!(state.edge("other", 0x110, false), None);
        assert!(state.close_interval().is_empty());
        assert!(state.interrupt_device("lost").is_empty());
    }

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
