"use client";

import { useEffect, useRef } from "react";

type Message = { type: "hello"; source: string } | { type: "state" | "goto"; index: number; source: string };

/** Keep every window of the same deck (audience, presenter) on the same slide through a BroadcastChannel. */
export function useDeckChannel(deckId: string, index: number, goTo: (index: number) => void) {
  const source = useRef("");
  const channel = useRef<BroadcastChannel | null>(null);
  const goToRef = useRef(goTo);
  const indexRef = useRef(index);
  useEffect(() => {
    goToRef.current = goTo;
    indexRef.current = index;
  });

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    if (!source.current) source.current = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now() + Math.random());
    const ch = new BroadcastChannel(`sol-deck:${deckId}`);
    channel.current = ch;
    ch.onmessage = (e: MessageEvent<Message>) => {
      const msg = e.data;
      if (!msg || msg.source === source.current) return;
      if (msg.type === "hello") ch.postMessage({ type: "state", index: indexRef.current, source: source.current });
      else if (msg.index !== indexRef.current) goToRef.current(msg.index);
    };
    ch.postMessage({ type: "hello", source: source.current });
    return () => {
      ch.close();
      channel.current = null;
    };
  }, [deckId]);

  useEffect(() => {
    channel.current?.postMessage({ type: "goto", index, source: source.current });
  }, [index]);
}
