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
  /** Keep the current state centred in the viewport as it changes. */
  followCurrent?: boolean;
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

/**
 * Force-directed drawing of an automaton. Nodes are states; edges are the
 * characters (char level) or vocabulary tokens (token level) that move
 * between them. Initial state: teal ring. Final states: double ring. Current
 * state: orange fill.
 */
export function FsmGraph({ automaton, currentState = null, visited = [], followCurrent = false, height = 520 }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const fitRef = useRef<(() => void) | null>(null);
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
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);

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
          text: `state ${d.id}${d.raw !== undefined ? ` (outlines id ${d.raw})` : ""}${d.final ? " · final" : ""}\n${summary}${outgoing.length > 6 ? `\n… ${outgoing.length - 6} more` : ""}`,
        });
      })
      .on("mouseleave", () => setHover(null));

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
    ticked = () => {
      // Fit once early so the first frame is readable, then again when the layout settles.
      if (++ticks === 90) fit();
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

    // Scale the layout to fit the viewport (a force layout of a few hundred
    // states easily spreads past the box otherwise).
    const fit = () => {
      const xs = nodes.map((n) => n.x ?? 0);
      const ys = nodes.map((n) => n.y ?? 0);
      const minX = Math.min(...xs) - 40;
      const maxX = Math.max(...xs) + 40;
      const minY = Math.min(...ys) - 40;
      const maxY = Math.max(...ys) + 40;
      const scale = Math.min(width / (maxX - minX), height / (maxY - minY), 1.5);
      const tx = (width - scale * (minX + maxX)) / 2;
      const ty = (height - scale * (minY + maxY)) / 2;
      svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    };
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => root.attr("transform", event.transform));
    svg.call(zoom);

    sim.on("end", fit);
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
      fit();
    }

    let frame = 0;
    const observer = new ResizeObserver(() => {
      const next = svgEl.clientWidth;
      if (!next || Math.abs(next - width) < 8) return;
      width = next;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        centerForce.x(width / 2);
        xForce.x(width / 2);
        if (!frozenRef.current) sim.alpha(0.3).restart();
        fit();
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
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const svg = d3.select(svgEl);
    const visitedSet = new Set(visited);
    const pathEdges = new Set<string>();
    for (let i = 1; i < visited.length; i++) pathEdges.add(`${visited[i - 1]}->${visited[i]}`);
    const isCurrent = (id: number) => currentState !== null && id === currentState;

    svg
      .selectAll<SVGCircleElement, SimNode>("circle.state")
      .attr("fill", (d) => (isCurrent(d.id) ? "var(--series-forced)" : visitedSet.has(d.id) ? "var(--accent-soft)" : "var(--surface)"))
      .attr("stroke", (d) =>
        isCurrent(d.id) ? "var(--series-forced)" : visitedSet.has(d.id) || d.id === automaton.initial ? "var(--accent)" : "var(--line-2)",
      )
      .attr("stroke-width", (d) => (isCurrent(d.id) || visitedSet.has(d.id) || d.id === automaton.initial ? 2.5 : 1.5));

    const onPath = (l: SimLink) => pathEdges.has(`${(l.source as SimNode).id}->${(l.target as SimNode).id}`);
    svg
      .selectAll<SVGPathElement, SimLink>("path.link")
      .attr("stroke", (l) => (onPath(l) ? "var(--series-forced)" : "var(--line-2)"))
      .attr("stroke-width", (l) => (onPath(l) ? 3.5 : Math.min(1 + Math.log2(l.count), 4)))
      .attr("stroke-opacity", (l) => (pathEdges.size && !onPath(l) ? 0.45 : 1))
      .filter(onPath)
      .raise();

    if (followCurrent && currentState !== null && zoomRef.current) {
      const node = nodesRef.current.find((n) => n.id === currentState);
      if (node && node.x !== undefined && node.y !== undefined) {
        svg.transition().duration(250).call(zoomRef.current.translateTo, node.x, node.y);
      }
    }
  }, [currentState, visited, followCurrent, automaton.initial, data]);

  return (
    <div className="relative">
      <svg ref={svgRef} className="w-full panel" style={{ height }} role="img" aria-label="Automaton graph: states and labelled transitions" />
      {hover && (
        <pre
          className="absolute pointer-events-none text-[11px] leading-snug panel px-2 py-1.5 whitespace-pre max-w-xs"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          {hover.text}
        </pre>
      )}
      <div className="flex gap-4 flex-wrap text-xs text-ink-2 mt-2">
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
          {automaton.nodes.length.toLocaleString("en-US")} / {automaton.total_states.toLocaleString("en-US")} states
        </span>
        <button
          type="button"
          className={`btn ml-auto py-0.5 px-2 text-xs ${frozen ? "border-accent" : ""}`}
          onClick={toggleFrozen}
          title={frozen ? "Forces are off: nodes stay where you drop them" : "Forces are on: nodes spring back into the layout"}
        >
          {frozen ? "Layout frozen" : "Freeze layout"}
        </button>
        <button type="button" className="btn py-0.5 px-2 text-xs" onClick={() => fitRef.current?.()}>
          Fit to view
        </button>
      </div>
    </div>
  );
}
