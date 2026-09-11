"use client";

import * as d3 from "d3";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Automaton } from "@/lib/types";

interface Props {
  automaton: Automaton;
  /** Node id (in the automaton's own numbering) to highlight as the current state. */
  currentState?: number | null;
  /** Node ids visited so far, in order; consecutive pairs are drawn as the path taken. */
  visited?: number[];
  height?: number;
}

interface SimNode extends d3.SimulationNodeDatum {
  id: number;
  final: boolean;
  raw?: number;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  label: string;
  count: number;
  self: boolean;
}

/** How many hops around the current state the "near" scope shows. */
const RADIUS = 2;

/** States within `radius` hops of `from` in either direction, plus the ones on the path so far. */
function neighbourhood(adjacency: Map<number, Set<number>>, from: number, radius: number, visited: number[]): Set<number> {
  const near = new Set<number>([from, ...visited]);
  let frontier = [from];
  for (let hop = 0; hop < radius; hop++) {
    const next: number[] = [];
    for (const id of frontier) {
      for (const other of adjacency.get(id) ?? []) {
        if (!near.has(other)) {
          near.add(other);
          next.push(other);
        }
      }
    }
    frontier = next;
  }
  return near;
}

/**
 * Force-directed drawing of an automaton. Nodes are states; edges are the
 * characters (char level) or vocabulary tokens (token level) that move
 * between them. Initial state: teal ring. Final states: double ring. Current
 * state: orange fill. The layout is computed once for the whole automaton;
 * the "near" scope only hides what is far from the current state and fits
 * the view to the rest, so scrubbing never re-runs the simulation.
 */
export function FsmGraph({ automaton, currentState = null, visited = [], height = 520 }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const fitRef = useRef<((only?: Set<number> | null) => void) | null>(null);
  const nearRef = useRef<Set<number> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const simRef = useRef<d3.Simulation<SimNode, undefined> | null>(null);
  // "Frozen" = no forces: nodes stay exactly where you drop them.
  const [frozen, setFrozen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem("sol.graphFrozen") === "1";
    } catch {
      return false;
    }
  });
  const frozenRef = useRef(frozen);
  useEffect(() => {
    frozenRef.current = frozen;
  }, [frozen]);
  // "Follow" keeps the current state centred as the Time Machine scrubs.
  const [follow, setFollow] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem("sol.graphFollow") !== "0";
    } catch {
      return true;
    }
  });
  const toggleFollow = () => {
    const next = !follow;
    setFollow(next);
    try {
      window.localStorage.setItem("sol.graphFollow", next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  // A state pressed in the graph: only it and its destinations stay visible, and a table lists the transitions.
  const [focus, setFocus] = useState<number | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const lastFitRef = useRef<string>("");
  const tickRef = useRef<() => void>(() => undefined);
  const widthRef = useRef<number>(800);
  // While a state is focused, it and its destinations are moved into a star; this remembers where they were.
  const focusLayoutRef = useRef<{ id: number; saved: { node: SimNode; x: number; y: number; fx: number | null | undefined; fy: number | null | undefined }[] } | null>(null);
  // "near": the current state and its surroundings; "whole": every drawn state.
  const [scope, setScope] = useState<"near" | "whole">(() => {
    try {
      return window.localStorage.getItem("sol.graphScope") === "whole" ? "whole" : "near";
    } catch {
      return "near";
    }
  });
  const toggleScope = () => {
    const next = scope === "near" ? "whole" : "near";
    setScope(next);
    try {
      window.localStorage.setItem("sol.graphScope", next);
    } catch {
      /* ignore */
    }
  };

  const data = useMemo(() => {
    const nodes: SimNode[] = automaton.nodes.map((n) => ({ id: n.id, final: n.final, raw: n.raw }));
    const links: SimLink[] = automaton.edges.map((e) => ({
      source: e.source,
      target: e.target,
      label: e.label,
      count: e.count,
      self: e.source === e.target,
    }));
    return { nodes, links };
  }, [automaton]);
  const adjacency = useMemo(() => {
    const m = new Map<number, Set<number>>();
    for (const l of data.links) {
      const s = l.source as number;
      const t = l.target as number;
      if (!m.has(s)) m.set(s, new Set());
      if (!m.has(t)) m.set(t, new Set());
      m.get(s)!.add(t);
      m.get(t)!.add(s);
    }
    return m;
  }, [data]);
  const near = useMemo(
    () => (scope === "near" && currentState !== null && adjacency.has(currentState) ? neighbourhood(adjacency, currentState, RADIUS, visited) : null),
    [scope, currentState, adjacency, visited],
  );
  // Derived, so a stale id (another automaton) silently means "no focus".
  const focused = focus !== null && adjacency.has(focus) ? focus : null;
  const outEdges = useMemo(() => (focused === null ? [] : data.links.filter((l) => (l.source as number) === focused)), [data, focused]);
  const focusSet = useMemo(() => (focused === null ? null : new Set<number>([focused, ...outEdges.map((l) => l.target as number)])), [focused, outEdges]);
  // What the graph shows: the focus wins over the near scope.
  const visible = focusSet ?? near;

  useEffect(() => {
    if (focused === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocus(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    let width = svgEl.clientWidth || 800;
    const svg = d3.select(svgEl);
    // Kept in locals so the ResizeObserver below can retarget them.
    const centerForce = d3.forceCenter(width / 2, height / 2);
    const xForce = d3.forceX(width / 2).strength(0.03);
    const yForce = d3.forceY(height / 2).strength(0.03);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const defs = svg.append("defs");
    defs
      .append("marker")
      .attr("id", "fsm-arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 22)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-4L10,0L0,4")
      .attr("fill", "var(--line-2)");

    const root = svg.append("g");
    const nodes = data.nodes.map((n) => ({ ...n }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links = data.links
      .filter((l) => byId.has(l.source as number) && byId.has(l.target as number))
      .map((l) => ({ ...l, source: byId.get(l.source as number)!, target: byId.get(l.target as number)! }));

    const many = nodes.length > 120;
    const sim = d3
      .forceSimulation<SimNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(links.filter((l) => !l.self))
          .id((d) => d.id)
          .distance(many ? 38 : 70)
          .strength(0.6),
      )
      .force("charge", d3.forceManyBody().strength(many ? -80 : -260))
      .force("center", centerForce)
      .force("collide", d3.forceCollide(many ? 14 : 24))
      .force("x", xForce)
      .force("y", yForce);

    const link = root
      .append("g")
      .attr("stroke", "var(--line-2)")
      .attr("fill", "none")
      .selectAll("path")
      .data(links)
      .join("path")
      .attr("class", "link")
      .attr("stroke-width", (d) => Math.min(1 + Math.log2(d.count), 4))
      .attr("marker-end", "url(#fsm-arrow)");

    const labelGroup = root.append("g").attr("font-family", "var(--font-mono)").attr("font-size", many ? 8 : 10).attr("fill", "var(--ink-2)");
    const labels = labelGroup
      .selectAll("text")
      .data(links)
      .join("text")
      .attr("class", "edge-label")
      .attr("text-anchor", "middle")
      .attr("paint-order", "stroke")
      .attr("stroke", "var(--surface)")
      .attr("stroke-width", 3)
      .text((d) => (d.label.length > 14 ? d.label.slice(0, 13) + "…" : d.label));

    let ticked: () => void = () => undefined; // assigned below, after the selections exist

    const node = root
      .append("g")
      .selectAll<SVGGElement, SimNode>("g")
      .data(nodes)
      .join("g")
      .attr("class", "node")
      .style("cursor", "grab")
      .call(
        d3
          .drag<SVGGElement, SimNode>()
          .on("start", (event, d) => {
            if (!frozenRef.current && !event.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
            if (frozenRef.current) {
              d.x = event.x;
              d.y = event.y;
              ticked();
            }
          })
          .on("end", (event, d) => {
            if (frozenRef.current) return; // stay pinned where it was dropped
            if (!event.active) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      );

    const r = many ? 8 : 14;
    node
      .filter((d) => d.final)
      .append("circle")
      .attr("r", r + 4)
      .attr("fill", "none")
      .attr("stroke", "var(--good)")
      .attr("stroke-width", 1.5);
    node
      .append("circle")
      .attr("class", "state")
      .attr("r", r)
      .attr("fill", "var(--surface)")
      .attr("stroke", (d) => (d.id === automaton.initial ? "var(--accent)" : "var(--line-2)"))
      .attr("stroke-width", (d) => (d.id === automaton.initial ? 2.5 : 1.5));
    node
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("font-size", many ? 7 : 10)
      .attr("font-family", "var(--font-mono)")
      .attr("fill", "var(--ink)")
      .text((d) => d.id);

    node
      .on("mousemove", (event, d) => {
        const outgoing = links.filter((l) => (l.source as SimNode).id === d.id);
        const summary = outgoing
          .slice(0, 6)
          .map((l) => `${l.label} → ${(l.target as SimNode).id}`)
          .join("\n");
        setHover({
          x: event.offsetX,
          y: event.offsetY,
          text: `state ${d.id}${d.raw !== undefined ? ` (outlines id ${d.raw})` : ""}${d.final ? " · final" : ""}\n${summary}${outgoing.length > 6 ? `\n… ${outgoing.length - 6} more` : ""}\nclick: only its destinations`,
        });
      })
      .on("mouseleave", () => setHover(null))
      .on("click", (event, d) => {
        if (event.defaultPrevented) return; // a drag, not a press
        event.stopPropagation();
        setHover(null);
        setFocus((f) => (f === d.id ? null : d.id));
      });
    // Pressing the background lets go of the focus.
    svg.on("click", (event) => {
      if (event.defaultPrevented) return;
      setFocus(null);
    });

    const linkPath = (d: SimLink) => {
      const s = d.source as SimNode;
      const t = d.target as SimNode;
      if (d.self) {
        const x = s.x ?? 0;
        const y = s.y ?? 0;
        return `M${x - 6},${y - r} C${x - 30},${y - r - 34} ${x + 30},${y - r - 34} ${x + 6},${y - r}`;
      }
      const dx = (t.x ?? 0) - (s.x ?? 0);
      const dy = (t.y ?? 0) - (s.y ?? 0);
      const dr = Math.sqrt(dx * dx + dy * dy) * 1.6;
      return `M${s.x},${s.y} A${dr},${dr} 0 0,1 ${t.x},${t.y}`;
    };

    let ticks = 0;
    widthRef.current = width;
    ticked = () => {
      // Fit once early so the first frame is readable, then again when the layout settles.
      if (++ticks === 90) fit(nearRef.current);
      link.attr("d", linkPath);
      labels.attr("x", (d) => {
        const s = d.source as SimNode;
        const t = d.target as SimNode;
        if (d.self) return s.x ?? 0;
        const mx = ((s.x ?? 0) + (t.x ?? 0)) / 2;
        const dy = (t.y ?? 0) - (s.y ?? 0);
        return mx - dy * 0.12;
      });
      labels.attr("y", (d) => {
        const s = d.source as SimNode;
        const t = d.target as SimNode;
        if (d.self) return (s.y ?? 0) - r - 28;
        const my = ((s.y ?? 0) + (t.y ?? 0)) / 2;
        const dx = (t.x ?? 0) - (s.x ?? 0);
        return my + dx * 0.12;
      });
      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    };
    sim.on("tick", ticked);
    tickRef.current = ticked;

    // Scale the layout to fit the viewport (a force layout of a few hundred
    // states easily spreads past the box otherwise).
    const fit = (only?: Set<number> | null) => {
      const shown = only ? nodes.filter((n) => only.has(n.id)) : nodes;
      if (!shown.length) return;
      const xs = shown.map((n) => n.x ?? 0);
      const ys = shown.map((n) => n.y ?? 0);
      const minX = Math.min(...xs) - 40;
      const maxX = Math.max(...xs) + 40;
      const minY = Math.min(...ys) - 40;
      const maxY = Math.max(...ys) + 40;
      const scale = Math.min(width / (maxX - minX), height / (maxY - minY), only ? (only.size <= 12 ? 4 : 2.5) : 1.5);
      const tx = (width - scale * (minX + maxX)) / 2;
      const ty = (height - scale * (minY + maxY)) / 2;
      svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    };
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => root.attr("transform", event.transform));
    svg.call(zoom);

    sim.on("end", () => fit(nearRef.current));
    fitRef.current = fit;
    zoomRef.current = zoom;
    nodesRef.current = nodes;
    simRef.current = sim;
    if (frozenRef.current) {
      // Let the layout settle without animating, then pin everything.
      sim.stop();
      for (let i = 0; i < 300; i++) sim.tick();
      nodes.forEach((n) => {
        n.fx = n.x;
        n.fy = n.y;
      });
      ticked();
      fit(nearRef.current);
    }

    let frame = 0;
    const observer = new ResizeObserver(() => {
      const next = svgEl.clientWidth;
      if (!next || Math.abs(next - width) < 8) return;
      width = next;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // The viewBox must follow the element, or the browser letterboxes the old box and every fit lands off-centre.
        svg.attr("viewBox", `0 0 ${width} ${height}`);
        widthRef.current = width;
        centerForce.x(width / 2);
        xForce.x(width / 2);
        if (!frozenRef.current) sim.alpha(0.3).restart();
        fit(nearRef.current);
      });
    });
    observer.observe(svgEl);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      sim.stop();
      fitRef.current = null;
    };
  }, [data, automaton.initial, height]);

  const toggleFrozen = () => {
    const next = !frozen;
    setFrozen(next);
    try {
      window.localStorage.setItem("sol.graphFrozen", next ? "1" : "0");
    } catch {
      /* ignore */
    }
    const sim = simRef.current;
    if (!sim) return;
    if (next) {
      sim.stop();
      nodesRef.current.forEach((n) => {
        n.fx = n.x;
        n.fy = n.y;
      });
    } else {
      nodesRef.current.forEach((n) => {
        n.fx = null;
        n.fy = null;
      });
      sim.alpha(0.5).restart();
    }
  };

  // Highlights are cheap, so they live in their own effect and do not restart
  // the simulation when the Time Machine slider moves.
  useEffect(() => {
    nearRef.current = visible;
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const svg = d3.select(svgEl);
    const visitedSet = new Set(visited);
    const pathEdges = new Set<string>();
    for (let i = 1; i < visited.length; i++) pathEdges.add(`${visited[i - 1]}->${visited[i]}`);
    const isCurrent = (id: number) => currentState !== null && id === currentState;
    const isFocus = (id: number) => focused !== null && id === focused;
    const edgeKey = (l: SimLink) => `${(l.source as SimNode).id}->${(l.target as SimNode).id}`;
    const hovered = (l: SimLink) => hoverEdge !== null && edgeKey(l) === hoverEdge;
    const hoveredTarget = hoverEdge !== null ? Number(hoverEdge.split("->")[1]) : null;

    svg
      .selectAll<SVGCircleElement, SimNode>("circle.state")
      .attr("fill", (d) => (isCurrent(d.id) ? "var(--series-forced)" : visitedSet.has(d.id) ? "var(--accent-soft)" : "var(--surface)"))
      .attr("stroke", (d) =>
        isCurrent(d.id)
          ? "var(--series-forced)"
          : isFocus(d.id) || d.id === hoveredTarget || visitedSet.has(d.id) || d.id === automaton.initial
            ? "var(--accent)"
            : "var(--line-2)",
      )
      .attr("stroke-width", (d) => (isCurrent(d.id) || isFocus(d.id) || d.id === hoveredTarget ? 3.5 : visitedSet.has(d.id) || d.id === automaton.initial ? 2.5 : 1.5));

    const onPath = (l: SimLink) => pathEdges.has(edgeKey(l));
    svg
      .selectAll<SVGPathElement, SimLink>("path.link")
      .attr("stroke", (l) => (hovered(l) ? "var(--accent)" : onPath(l) ? "var(--series-forced)" : "var(--line-2)"))
      .attr("stroke-width", (l) => (hovered(l) ? 4 : onPath(l) ? 3.5 : Math.min(1 + Math.log2(l.count), 4)))
      .attr("stroke-opacity", (l) => (pathEdges.size && !onPath(l) && !hovered(l) && focused === null ? 0.45 : 1))
      .filter((l) => onPath(l) || hovered(l))
      .raise();

    // The near scope hides, never re-lays out. Focus is the exception: the pressed state goes to the centre and
    // its destinations spread on a circle around it, so the star of transitions is readable; the other states are
    // hidden meanwhile, and everything goes back where it was when the focus is let go.
    const layout = focusLayoutRef.current;
    if (focused === null ? layout !== null : layout?.id !== focused) {
      const sim = simRef.current;
      if (layout) {
        for (const s of layout.saved) {
          s.node.x = s.x;
          s.node.y = s.y;
          s.node.fx = frozenRef.current ? s.x : s.fx;
          s.node.fy = frozenRef.current ? s.y : s.fy;
        }
        focusLayoutRef.current = null;
        if (sim && !frozenRef.current) sim.alpha(0.2).restart();
        else tickRef.current();
      }
      if (focused !== null) {
        const byId = new Map(nodesRef.current.map((n) => [n.id, n]));
        const centre = byId.get(focused);
        const targets = [...new Set(data.links.filter((l) => (l.source as number) === focused).map((l) => l.target as number))]
          .filter((id) => id !== focused)
          .map((id) => byId.get(id))
          .filter((n): n is SimNode => !!n);
        if (centre) {
          const W = widthRef.current;
          const cx = W / 2;
          const cy = height / 2;
          const R = Math.min(W, height) * (targets.length > 8 ? 0.22 : 0.16);
          const saved = [centre, ...targets].map((n) => ({ node: n, x: n.x ?? cx, y: n.y ?? cy, fx: n.fx, fy: n.fy }));
          const place = (n: SimNode, x: number, y: number) => {
            n.x = x;
            n.y = y;
            n.fx = x;
            n.fy = y;
          };
          sim?.stop();
          place(centre, cx, cy);
          targets.forEach((n, i) => {
            const a = -Math.PI / 2 + (i / targets.length) * 2 * Math.PI;
            place(n, cx + R * Math.cos(a), cy + R * Math.sin(a));
          });
          focusLayoutRef.current = { id: focused, saved };
          tickRef.current();
        }
      }
    }

    // Focus shows the pressed state, its destinations, and only the edges that leave it.
    const shown = (id: number) => !visible || visible.has(id);
    const linkShown = (l: SimLink) =>
      focused !== null ? (l.source as SimNode).id === focused && shown((l.target as SimNode).id) : shown((l.source as SimNode).id) && shown((l.target as SimNode).id);
    svg.selectAll<SVGGElement, SimNode>("g.node").style("display", (d) => (shown(d.id) ? null : "none"));
    svg.selectAll<SVGPathElement, SimLink>("path.link").style("display", (l) => (linkShown(l) ? null : "none"));
    svg.selectAll<SVGTextElement, SimLink>("text.edge-label").style("display", (l) => (linkShown(l) ? null : "none"));

    // Fit only when what is shown changed; a hover over the table must not move the view.
    const fitKey = visible ? `${[...visible].sort((a, b) => a - b).join(",")}|${currentState}` : `whole|${currentState}`;
    const changed = fitKey !== lastFitRef.current;
    lastFitRef.current = fitKey;
    if (visible) {
      if (changed) fitRef.current?.(visible);
    } else if (changed && follow && currentState !== null && zoomRef.current) {
      const node = nodesRef.current.find((n) => n.id === currentState);
      if (node && node.x !== undefined && node.y !== undefined) {
        svg.transition().duration(250).call(zoomRef.current.translateTo, node.x, node.y);
      }
    }
  }, [currentState, visited, follow, visible, focused, hoverEdge, automaton.initial, data]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-4 flex-wrap items-center text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-accent" /> initial
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full border border-good ring-1 ring-good ring-offset-1 ring-offset-surface" /> final
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-accent-soft border-2 border-accent" /> visited
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-forced" /> current
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5 bg-forced" /> path taken
        </span>
        <span
          className={automaton.truncated ? "text-warning" : "text-muted"}
          title={
            automaton.truncated
              ? "Breadth-first from the initial state; tighten the schema (maxLength) to see all of it. Drag nodes, scroll to zoom."
              : "Drag nodes, scroll to zoom"
          }
        >
          {focused !== null ? "" : near ? `${near.size.toLocaleString("en-US")} near state ${currentState} · ` : ""}
          {automaton.nodes.length.toLocaleString("en-US")} / {automaton.total_states.toLocaleString("en-US")} states
          {focused === null ? " · click a state for its destinations" : ""}
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          {focused !== null && (
            <button type="button" className="chip chip-warning" onClick={() => setFocus(null)} title="Back to the near or whole view (Esc)">
              focus · state {focused} · ✕
            </button>
          )}
          <button
            type="button"
            className={`btn py-0.5 px-2 text-xs ${scope === "near" && focused === null ? "border-accent" : ""}`}
            onClick={() => {
              setFocus(null);
              if (focused === null) toggleScope();
            }}
            aria-pressed={scope === "near"}
            title={
              focused !== null
                ? "Let go of the focused state"
                : scope === "near"
                  ? `Showing the states within ${RADIUS} hops of the current one and the path so far; press for the whole automaton`
                  : "Showing every drawn state; press to keep only the surroundings of the current one"
            }
          >
            {scope === "near" ? "Near" : "Whole"}
          </button>
          <button
            type="button"
            className={`btn py-0.5 px-2 text-xs ${follow ? "border-accent" : ""}`}
            onClick={toggleFollow}
            aria-pressed={follow}
            title="Keep the current state centred as you scrub"
          >
            Follow
          </button>
          <button
            type="button"
            className={`btn py-0.5 px-2 text-xs ${frozen ? "border-accent" : ""}`}
            onClick={toggleFrozen}
            aria-pressed={frozen}
            title={frozen ? "Forces are off: nodes stay where you drop them" : "Forces are on: nodes spring back into the layout"}
          >
            {frozen ? "Frozen" : "Freeze"}
          </button>
          <button type="button" className="btn py-0.5 px-2 text-xs" onClick={() => fitRef.current?.(nearRef.current)}>
            Fit
          </button>
        </span>
      </div>
      <div className={`grid gap-3 items-start ${focused !== null ? "lg:grid-cols-[minmax(0,1fr)_minmax(300px,400px)]" : ""}`}>
        <div className="relative min-w-0">
          <svg ref={svgRef} className="w-full panel" style={{ height }} role="img" aria-label="Automaton graph: states and labelled transitions" />
          {hover && (
            <pre
              className="absolute pointer-events-none text-[11px] leading-snug panel px-2 py-1.5 whitespace-pre max-w-xs"
              style={{ left: hover.x + 12, top: hover.y + 12 }}
            >
              {hover.text}
            </pre>
          )}
        </div>
        {focused !== null && (
          <TransitionTable
            automaton={automaton}
            focus={focused}
            edges={outEdges}
            visited={visited}
            currentState={currentState}
            height={height}
            onFocus={(id) => setFocus(id)}
            onHoverEdge={setHoverEdge}
            onClose={() => setFocus(null)}
          />
        )}
      </div>
    </div>
  );
}

/** The transitions that leave the focused state: which tokens, to which state, and whether the run took them. */
function TransitionTable({
  automaton,
  focus,
  edges,
  visited,
  currentState,
  height,
  onFocus,
  onHoverEdge,
  onClose,
}: {
  automaton: Automaton;
  focus: number;
  edges: SimLink[];
  visited: number[];
  currentState: number | null;
  height: number;
  onFocus: (id: number) => void;
  onHoverEdge: (key: string | null) => void;
  onClose: () => void;
}) {
  const node = automaton.nodes.find((n) => n.id === focus);
  const finals = new Set(automaton.finals);
  const visitedSet = new Set(visited);
  const taken = new Set<number>();
  for (let i = 1; i < visited.length; i++) if (visited[i - 1] === focus) taken.add(visited[i]);
  const rows = [...edges].sort((a, b) => Number(taken.has(b.target as number)) - Number(taken.has(a.target as number)) || b.count - a.count);
  const tokens = edges.reduce((a, l) => a + l.count, 0);
  const targets = new Set(edges.map((l) => l.target as number)).size;
  return (
    <div className="panel flex flex-col gap-2 p-3 overflow-hidden" style={{ maxHeight: height }} onMouseLeave={() => onHoverEdge(null)}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="flex items-baseline gap-2 flex-wrap">
          <span className="eyebrow">State {focus}</span>
          <span className="text-xs text-muted">
            {node?.raw !== undefined ? `outlines id ${node.raw} · ` : ""}
            {node?.final ? "final · " : ""}
            {focus === automaton.initial ? "initial · " : ""}
            {focus === currentState ? "current · " : visitedSet.has(focus) ? "visited · " : ""}
            {edges.length} transition{edges.length === 1 ? "" : "s"} → {targets} state{targets === 1 ? "" : "s"} · {tokens.toLocaleString("en-US")} token{tokens === 1 ? "" : "s"}
          </span>
        </span>
        <button type="button" className="text-xs text-accent" onClick={onClose} title="Back to the graph view (Esc)">
          Close
        </button>
      </div>
      {edges.length === 0 ? (
        <p className="text-xs text-muted">{node?.final ? "A final state with no way out: only EOS is accepted here." : "No transitions were drawn from this state."}</p>
      ) : (
        <div className="overflow-auto min-h-0">
          <table className="w-full text-[12px] font-mono border-collapse">
            <thead>
              <tr className="text-left text-muted">
                <th className="font-normal eyebrow pb-1 pr-2">tokens</th>
                <th className="font-normal eyebrow pb-1 pr-2 text-right">count</th>
                <th className="font-normal eyebrow pb-1 pr-2">→ state</th>
                <th className="font-normal eyebrow pb-1" />
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const target = l.target as number;
                const key = `${focus}->${target}`;
                const took = taken.has(target);
                return (
                  <tr
                    key={key}
                    className={`align-top border-t border-line hover:bg-surface-2 ${took ? "text-ink" : "text-ink-2"}`}
                    onMouseEnter={() => onHoverEdge(key)}
                    title={`${l.count} token${l.count === 1 ? "" : "s"} move state ${focus} to state ${target}${took ? "; the run took this transition" : ""}`}
                  >
                    <td className="py-1 pr-2 break-all">
                      {l.self ? <span className="text-muted" title="A self-loop: the state does not change">↺ </span> : null}
                      {l.label}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums text-muted">×{l.count.toLocaleString("en-US")}</td>
                    <td className="py-1 pr-2 whitespace-nowrap">
                      <button type="button" className="text-accent hover:underline" onClick={() => onFocus(target)} title={`Focus state ${target}: its own destinations`}>
                        → {target}
                      </button>
                      {finals.has(target) ? <span className="text-good" title="A final state: EOS is accepted there"> ◎</span> : null}
                    </td>
                    <td className="py-1 whitespace-nowrap text-right">
                      {took ? (
                        <span className="chip chip-warning" title="The run moved along this transition">
                          taken
                        </span>
                      ) : target === currentState ? (
                        <span className="chip">current</span>
                      ) : visitedSet.has(target) ? (
                        <span className="chip">visited</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <span className="text-xs text-muted">Labels show the first tokens of each transition; the count is the whole set. Press a state to walk the automaton.</span>
    </div>
  );
}
