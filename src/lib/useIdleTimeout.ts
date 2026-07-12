import { useCallback, useEffect, useRef, useState } from 'react';

const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'wheel', 'scroll'];

// Avoids rearming the idle timer on every single mousemove/scroll event
// (which can fire dozens of times a second) - only matters in the steady
// "active" phase; the very first activity event after a warning/pause is
// never throttled, so resuming always feels instant.
const ACTIVITY_THROTTLE_MS = 1000;

type IdlePhase = 'active' | 'warning' | 'paused';

interface UseIdleTimeoutOptions {
  /** How long with zero interaction before the "are you still there?" warning appears. */
  idleTimeoutMs: number;
  /** How long the warning counts down before onPause fires. */
  warningDurationMs: number;
  /** Fires once, when the countdown reaches zero with no interaction - pause background activity here. Never fires more than once per idle period. */
  onPause: () => void;
  /** Fires once, the moment the reader interacts again after onPause fired - resume background activity here. */
  onResume: () => void;
}

interface UseIdleTimeoutResult {
  isWarning: boolean;
  isPaused: boolean;
  secondsRemaining: number;
  /** Explicit "yes, I'm still here" action for a modal button - equivalent to any other interaction, just named for clarity at the call site. */
  stayActive: () => void;
}

/**
 * Generic activity-based idle detector - not tied to any specific request or
 * page. A caller wires onPause/onResume to whatever background activity it
 * wants paused (e.g. PdfViewer's proactive signed-URL refresh); this hook
 * only tracks "is the reader still there," it never touches app state or
 * data itself.
 */
export function useIdleTimeout({
  idleTimeoutMs,
  warningDurationMs,
  onPause,
  onResume
}: UseIdleTimeoutOptions): UseIdleTimeoutResult {
  const [phase, setPhase] = useState<IdlePhase>('active');
  const [secondsRemaining, setSecondsRemaining] = useState(Math.ceil(warningDurationMs / 1000));

  const phaseRef = useRef<IdlePhase>('active');
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityAtRef = useRef(Date.now());
  const onPauseRef = useRef(onPause);
  const onResumeRef = useRef(onResume);
  onPauseRef.current = onPause;
  onResumeRef.current = onResume;

  const setPhaseBoth = useCallback((next: IdlePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearAllTimers = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    idleTimerRef.current = null;
    countdownIntervalRef.current = null;
  }, []);

  const armIdleTimer = useCallback(() => {
    clearAllTimers();
    idleTimerRef.current = setTimeout(() => {
      setPhaseBoth('warning');
      const countdownStartedAt = Date.now();
      setSecondsRemaining(Math.ceil(warningDurationMs / 1000));

      countdownIntervalRef.current = setInterval(() => {
        const remainingMs = warningDurationMs - (Date.now() - countdownStartedAt);
        if (remainingMs <= 0) {
          clearAllTimers();
          setSecondsRemaining(0);
          setPhaseBoth('paused');
          onPauseRef.current();
          return;
        }
        setSecondsRemaining(Math.ceil(remainingMs / 1000));
      }, 200);
    }, idleTimeoutMs);
  }, [idleTimeoutMs, warningDurationMs, clearAllTimers, setPhaseBoth]);

  const handleActivity = useCallback(() => {
    const now = Date.now();
    const wasIdle = phaseRef.current !== 'active';

    if (!wasIdle && now - lastActivityAtRef.current < ACTIVITY_THROTTLE_MS) {
      return;
    }
    lastActivityAtRef.current = now;

    if (phaseRef.current === 'paused') {
      onResumeRef.current();
    }
    if (wasIdle) {
      setPhaseBoth('active');
    }
    armIdleTimer();
  }, [armIdleTimer, setPhaseBoth]);

  useEffect(() => {
    ACTIVITY_EVENTS.forEach((eventName) => document.addEventListener(eventName, handleActivity, { passive: true }));
    armIdleTimer();

    return () => {
      ACTIVITY_EVENTS.forEach((eventName) => document.removeEventListener(eventName, handleActivity));
      clearAllTimers();
    };
  }, [handleActivity, armIdleTimer, clearAllTimers]);

  return {
    isWarning: phase === 'warning',
    isPaused: phase === 'paused',
    secondsRemaining,
    stayActive: handleActivity
  };
}
