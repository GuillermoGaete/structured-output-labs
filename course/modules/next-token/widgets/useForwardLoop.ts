"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FixtureMissError } from "@/data/client";
import { useDataSource } from "@/data/DataSourceProvider";
import { uFor } from "@/lib/prng";
import type { ForwardRequest, ForwardResponse } from "@/lib/types";

export interface LoopStep {
  request: ForwardRequest;
  response: ForwardResponse;
  u: number | null;
}

export interface LoopParams {
  prompt: string;
  useChatTemplate: boolean;
  temperature: number;
  topK: number;
  topP: number;
  seed: number;
  maxSteps: number;
  topKReport: number;
}

export type LoopPhase = "idle" | "travel" | "forward" | "error" | "done";
export type LoopSpeed = "slow" | "real" | "fast";

const TRAVEL_MS: Record<LoopSpeed, number> = { slow: 900, real: 300, fast: 0 };
const DWELL_MS: Record<LoopSpeed, number> = { slow: 3000, real: 1200, fast: 200 };

/**
 * The autoregressive loop, driven from the browser: one /forward per token. The
 * history keeps every step so the presenter can scrub back; Step from the end
 * re-posts the running token list with the sampler settings and a per-step `u`.
 */
export function useForwardLoop(params: LoopParams, speed: LoopSpeed) {
  const { client } = useDataSource();
  const [history, setHistory] = useState<LoopStep[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<LoopPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [lastMs, setLastMs] = useState<number | null>(null);
  const [expectedMs, setExpectedMs] = useState(900);
  const ema = useRef(900);
  const generation = useRef(0);
  const paramsRef = useRef(params);
  const clientRef = useRef(client);
  useEffect(() => {
    paramsRef.current = params;
    clientRef.current = client;
  });

  const stepRequest = useCallback((tokenIds: number[] | null, stepIndex: number): ForwardRequest => {
    const p = paramsRef.current;
    const sample = { temperature: p.temperature, top_k: p.topK, top_p: p.topP, u: p.temperature > 0 ? uFor(p.seed, stepIndex) : null };
    const base: ForwardRequest = { top_k: p.topKReport, attention: "last", logit_lens: true, lens_top_k: 5, tail_bins: 64, decimals: 3, sample };
    return tokenIds ? { ...base, token_ids: tokenIds } : { ...base, prompt: p.prompt, use_chat_template: p.useChatTemplate };
  }, []);

  const runForward = useCallback(
    async (tokenIds: number[] | null, stepIndex: number, truncateTo: number | null) => {
      const gen = ++generation.current;
      setPhase("forward");
      setError(null);
      setMissing(false);
      const started = performance.now();
      try {
        const request = stepRequest(tokenIds, stepIndex);
        const response = await clientRef.current.forward(request);
        if (gen !== generation.current) return null;
        const ms = performance.now() - started;
        ema.current = ema.current * 0.6 + ms * 0.4;
        setExpectedMs(ema.current);
        setLastMs(ms);
        const step: LoopStep = { request, response, u: request.sample?.u ?? null };
        setHistory((h) => [...(truncateTo === null ? h : h.slice(0, truncateTo)), step]);
        setIndex(truncateTo === null ? 0 : truncateTo);
        if (response.sampled?.is_eos) {
          setPhase("done");
          setPlaying(false);
        } else {
          setPhase("idle");
        }
        return step;
      } catch (e) {
        if (gen !== generation.current) return null;
        setPhase("error");
        setPlaying(false);
        if (e instanceof FixtureMissError) setMissing(true);
        else setError(e instanceof Error ? e.message : String(e));
        return null;
      }
    },
    [stepRequest],
  );

  /** Step 0: the prompt goes through the network once. */
  const start = useCallback(async () => {
    setPlaying(false);
    setHistory([]);
    setIndex(0);
    await runForward(null, 0, null);
  }, [runForward]);

  const step = useCallback(async () => {
    const current = history[index];
    if (!current || phase === "forward") return null;
    if (!current.response.next_token_ids || current.response.sampled?.is_eos) return null;
    if (history.length - 1 >= paramsRef.current.maxSteps) return null;
    setPhase("travel");
    const travel = TRAVEL_MS[speed];
    if (travel) await new Promise((r) => setTimeout(r, travel));
    return runForward(current.response.next_token_ids, index + 1, index + 1);
  }, [history, index, phase, speed, runForward]);

  const reset = useCallback(() => {
    setPlaying(false);
    generation.current++;
    setHistory((h) => h.slice(0, 1));
    setIndex(0);
    setPhase(history[0]?.response.sampled?.is_eos ? "done" : "idle");
  }, [history]);

  // Autoplay: after each step settles, dwell, then step again until EOS or the cap.
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  });
  useEffect(() => {
    if (!playing || phase !== "idle") return;
    const timer = setTimeout(async () => {
      const result = await stepRef.current();
      if (result === null) setPlaying(false);
    }, DWELL_MS[speed]);
    return () => clearTimeout(timer);
  }, [playing, phase, speed, index]);

  const canStep = phase === "idle" && index === history.length - 1 && !!history[index]?.response.next_token_ids && !history[index]?.response.sampled?.is_eos && history.length - 1 < params.maxSteps;

  return {
    history,
    index,
    current: history[index] ?? null,
    setIndex,
    phase,
    error,
    missing,
    playing,
    setPlaying,
    lastMs,
    expectedMs,
    start,
    step,
    reset,
    canStep,
  };
}

export function headMean(weights: number[][] | undefined): number[] {
  if (!weights || weights.length === 0) return [];
  const n = weights[0].length;
  const out = new Array<number>(n).fill(0);
  for (const row of weights) for (let i = 0; i < n; i++) out[i] += row[i];
  return out.map((v) => v / weights.length);
}
