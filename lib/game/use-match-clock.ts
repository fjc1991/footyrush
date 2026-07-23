"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  advanceMatchProgress,
  matchMinuteFromProgress,
  type MatchSpeed
} from "./match-clock";

/**
 * One drift-resistant match clock shared by every animated match surface.
 * Progress is accumulated from real elapsed time, so changing speed never
 * resets or jumps the match and completion can only fire once.
 */
export function useMatchClock(speed: MatchSpeed, onComplete?: () => void) {
  const [minute, setMinute] = useState(0);
  const [running, setRunning] = useState(false);
  const progressRef = useRef(0);
  const lastTickRef = useRef(0);
  const speedRef = useRef(speed);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const complete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    progressRef.current = 1;
    setMinute(90);
    setRunning(false);
    onCompleteRef.current?.();
  }, []);

  const reset = useCallback(() => {
    completedRef.current = false;
    progressRef.current = 0;
    lastTickRef.current = 0;
    setMinute(0);
    setRunning(false);
  }, []);

  const start = useCallback(() => {
    completedRef.current = false;
    progressRef.current = 0;
    lastTickRef.current = performance.now();
    setMinute(0);
    setRunning(true);
  }, []);

  useEffect(() => {
    if (!running) return;
    let frame = 0;

    const tick = (now: number) => {
      const previous = lastTickRef.current || now;
      lastTickRef.current = now;
      progressRef.current = advanceMatchProgress(
        progressRef.current,
        now - previous,
        speedRef.current
      );
      setMinute(matchMinuteFromProgress(progressRef.current));
      if (progressRef.current >= 1) {
        complete();
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [complete, running]);

  return { minute, running, start, reset, finish: complete };
}
