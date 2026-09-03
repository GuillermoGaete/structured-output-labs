"use client";

import * as d3 from "d3";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Automaton } from "@/lib/types";

interface Props {
  automaton: Automaton;
  /** Node id (in the automaton's own numbering) to highlight as the current state. */
  currentState?: number | null;
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
export function FsmGraph({ automaton, currentState = null, height = 520 }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const fitRef = useRef<(() => void) | null>(null);
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
    const width = svgEl.clientWidth || 800;
    const svg = d3.select(svgEl);
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
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(many ? 14 : 24))
      .force("x", d3.forceX(width / 2).strength(0.03))
      .force("y", d3.forceY(height / 2).strength(0.03));

    const link = root
      .append("g")
      .attr("stroke", "var(--line-2)")
      .attr("fill", "none")
      .selectAll("path")
      .data(links)
      .join("path")
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
            if (!event.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
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
    sim.on("tick", () => {
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
    });

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

    return () => {
      sim.stop();
      fitRef.current = null;
    };
  }, [data, automaton.initial, height]);

  // Current-state highlight is cheap, so it lives in its own effect and does
  // not restart the simulation when the Time Machine slider moves.
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    d3.select(svgEl)
      .selectAll<SVGCircleElement, SimNode>("circle.state")
      .attr("fill", (d) => (currentState !== null && d.id === currentState ? "var(--series-forced)" : "var(--surface)"))
      .attr("stroke", (d) =>
        currentState !== null && d.id === currentState ? "var(--series-forced)" : d.id === automaton.initial ? "var(--accent)" : "var(--line-2)",
      );
  }, [currentState, automaton.initial, data]);

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
          <span className="inline-block w-3 h-3 rounded-full bg-forced" /> current
        </span>
        <span className="text-muted">
          {automaton.nodes.length.toLocaleString("en-US")} of {automaton.total_states.toLocaleString("en-US")} states shown · drag nodes, scroll to zoom
        </span>
        <button type="button" className="btn ml-auto py-0.5 px-2 text-xs" onClick={() => fitRef.current?.()}>
          Fit to view
        </button>
      </div>
    </div>
  );
}
