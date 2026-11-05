//! The encoder clock and input projection share these exact monotonic instants.
//! Reader observation is not kernel/compositor event time or frame-accurate input time.
use std::time::{Duration, Instant};

#[derive(Debug)]
struct Interval {
    start: Instant,
    end: Option<Instant>,
    media_start: Duration,
}

#[derive(Default)]
pub struct CaptureClock {
    intervals: Vec<Interval>,
    paused: bool,
    stopped: Option<Instant>,
    transition: Option<Instant>,
}

#[derive(Debug, PartialEq, Eq)]
pub struct Projection {
    pub media_time: Duration,
    pub interval_id: u64,
}

impl CaptureClock {
    pub fn started(&self) -> bool {
        !self.intervals.is_empty()
    }
    pub fn is_paused(&self) -> bool {
        self.paused
    }
    pub fn transition(&self) -> Option<Instant> {
        self.transition
    }

    pub fn start(&mut self, at: Instant) {
        if self.started() {
            return;
        }
        self.intervals.push(Interval {
            start: at,
            end: None,
            media_start: Duration::ZERO,
        });
        self.transition = Some(at);
    }

    pub fn pause(&mut self, at: Instant) {
        if self.paused {
            return;
        }
        self.paused = true;
        if let Some(interval) = self.intervals.last_mut() {
            interval.end = Some(at);
        }
        self.transition = Some(at);
    }

    pub fn resume(&mut self, at: Instant) {
        if !self.paused {
            return;
        }
        self.paused = false;
        if let Some(last) = self.intervals.last() {
            let media_start = last.media_start + last.end.unwrap().duration_since(last.start);
            self.intervals.push(Interval {
                start: at,
                end: None,
                media_start,
            });
        }
        self.transition = Some(at);
    }

    pub fn stop(&mut self, at: Instant) {
        if self.stopped.is_some() {
            return;
        }
        if let Some(interval) = self.intervals.last_mut() {
            if interval.end.is_none() {
                interval.end = Some(at);
            }
        }
        self.stopped = Some(at);
        self.transition = Some(at);
    }

    pub fn elapsed_at(&self, at: Instant) -> Option<Duration> {
        let last = self.intervals.last()?;
        Some(last.media_start + last.end.unwrap_or(at).saturating_duration_since(last.start))
    }

    /// Active intervals are half-open: a reader observation at Pause or Stop is
    /// excluded, while one at Resume belongs to the new interval. No UTC mapping.
    pub fn project(&self, at: Instant) -> Option<Projection> {
        if self.stopped.is_some_and(|stop| at >= stop) {
            return None;
        }
        self.intervals
            .iter()
            .enumerate()
            .rev()
            .find_map(|(id, interval)| {
                if at < interval.start || interval.end.is_some_and(|end| at >= end) {
                    return None;
                }
                Some(Projection {
                    media_time: interval.media_start + at.duration_since(interval.start),
                    interval_id: id as u64,
                })
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn ms(base: Instant, value: u64) -> Instant {
        base + Duration::from_millis(value)
    }

    #[test]
    fn historical_input_projects_across_multiple_pauses_without_dispatch_time() {
        let base = Instant::now();
        let mut clock = CaptureClock::default();
        clock.start(ms(base, 100));
        clock.pause(ms(base, 200));
        clock.resume(ms(base, 400));
        clock.pause(ms(base, 500));
        clock.resume(ms(base, 800));
        clock.stop(ms(base, 1000));
        for (at, media, interval) in [
            (100, 0, 0),
            (199, 99, 0),
            (400, 100, 1),
            (450, 150, 1),
            (800, 200, 2),
            (999, 399, 2),
        ] {
            assert_eq!(
                clock.project(ms(base, at)),
                Some(Projection {
                    media_time: Duration::from_millis(media),
                    interval_id: interval
                })
            );
        }
        for at in [0, 99, 200, 399, 500, 799, 1000, 1100] {
            assert_eq!(clock.project(ms(base, at)), None);
        }
        assert_eq!(
            clock.elapsed_at(ms(base, 2000)),
            Some(Duration::from_millis(400))
        );
    }

    #[test]
    fn idempotent_controls_and_stop_while_paused_keep_the_encoder_clock_frozen() {
        let base = Instant::now();
        let mut clock = CaptureClock::default();
        assert_eq!(clock.elapsed_at(base), None);
        clock.pause(base);
        clock.resume(ms(base, 10));
        clock.start(ms(base, 20));
        clock.start(ms(base, 30));
        clock.resume(ms(base, 40));
        clock.pause(ms(base, 50));
        clock.pause(ms(base, 60));
        clock.stop(ms(base, 100));
        assert_eq!(
            clock.elapsed_at(ms(base, 200)),
            Some(Duration::from_millis(30))
        );
        assert_eq!(clock.project(ms(base, 49)).unwrap().interval_id, 0);
        assert_eq!(clock.project(ms(base, 50)), None);
    }

    #[test]
    fn projection_retains_submillisecond_boundary_precision() {
        let base = Instant::now();
        let mut clock = CaptureClock::default();
        clock.start(base);
        clock.pause(base + Duration::from_micros(500));
        assert!(clock.project(base + Duration::from_micros(499)).is_some());
        assert!(clock.project(base + Duration::from_micros(500)).is_none());
    }
}
