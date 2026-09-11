"use client";

import { useEffect, useState, type ReactNode } from "react";

interface Props {
  label: string;
  runningLabel: string;
  running: boolean;
  disabled: boolean;
  onRun: () => void;
  onStop: () => void;
  /** The primary's other choices, rendered as the split half of the button. */
  menu?: ReactNode;
  /** Status chips and errors, under the buttons. */
  children?: ReactNode;
}

/** The page's one primary action, at the foot of the setup column. ⌘/Ctrl+Enter presses it from anywhere. */
export function RunActions({ label, runningLabel, running, disabled, onRun, onStop, menu, children }: Props) {
  const [mac, setMac] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      if (!disabled && !running) onRun();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled, running, onRun]);

  return (
    <div className="run-actions">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex">
          <button className={`btn btn-primary ${menu ? "rounded-r-none" : ""}`} type="button" onClick={onRun} disabled={disabled || running} title={`${mac ? "⌘" : "Ctrl"} + Enter`}>
            {running ? runningLabel : label}
          </button>
          {menu}
        </span>
        {running ? (
          <button className="btn" type="button" onClick={onStop}>
            Stop
          </button>
        ) : (
          <span className="kbd talk-hide" aria-hidden="true">
            {mac ? "⌘⏎" : "Ctrl⏎"}
          </span>
        )}
      </div>
      {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
    </div>
  );
}
