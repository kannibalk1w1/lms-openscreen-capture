//! Drain only the finite FIFO prefix before a fence, with explicit resource bounds.
//! Reader observations not yet enqueued when the fence is sent are not guaranteed.
use crate::Message;
use std::sync::mpsc::{Receiver, Sender};
use std::time::{Duration, Instant};

#[derive(Default, Debug, PartialEq, Eq)]
pub struct DrainSummary {
    pub completed: bool,
    pub processed_messages: usize,
    pub accepted_edges: usize,
    pub excluded_edges: usize,
}

pub fn drain_queued(
    receiver: &Receiver<Message>,
    sender: &Sender<Message>,
    max_messages: usize,
    budget: Duration,
    mut handle: impl FnMut(Message) -> Option<bool>,
) -> DrainSummary {
    let mut summary = DrainSummary::default();
    if sender.send(Message::InputDrainComplete).is_err() {
        return summary;
    }
    let began = Instant::now();
    while summary.processed_messages < max_messages && began.elapsed() < budget {
        let Ok(message) = receiver.try_recv() else {
            break;
        };
        if matches!(message, Message::InputDrainComplete) {
            summary.completed = true;
            break;
        }
        summary.processed_messages += 1;
        match handle(message) {
            Some(true) => summary.accepted_edges += 1,
            Some(false) => summary.excluded_edges += 1,
            None => {}
        }
    }
    summary
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fifo_fence_drains_queued_messages_but_not_new_production() {
        let (sender, receiver) = std::sync::mpsc::channel();
        sender.send(Message::Pause).unwrap();
        sender.send(Message::Resume).unwrap();
        let mut handled = 0;
        let summary = drain_queued(&receiver, &sender, 10, Duration::from_secs(1), |_| {
            handled += 1;
            sender.send(Message::Stop).unwrap();
            Some(handled == 1)
        });
        assert_eq!(
            summary,
            DrainSummary {
                completed: true,
                processed_messages: 2,
                accepted_edges: 1,
                excluded_edges: 1
            }
        );
        assert_eq!(
            receiver.try_iter().count(),
            2,
            "new messages follow the fence"
        );
    }

    #[test]
    fn message_and_time_limits_report_incomplete_drain() {
        for (limit, budget) in [(1, Duration::from_secs(1)), (10, Duration::ZERO)] {
            let (sender, receiver) = std::sync::mpsc::channel();
            sender.send(Message::Pause).unwrap();
            sender.send(Message::Resume).unwrap();
            let summary = drain_queued(&receiver, &sender, limit, budget, |_| None);
            assert!(!summary.completed);
            assert!(summary.processed_messages <= 1);
            assert!(receiver.try_iter().count() >= 2);
        }
    }
}
