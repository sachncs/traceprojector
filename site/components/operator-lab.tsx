"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Copy,
  FileUp,
  Gauge,
  Play,
  RefreshCw,
  Scissors,
  Square,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { generateUnitCubeMesh } from "traceprojector/generator";
import {
  LAB_FIELDS,
  OPERATORS,
  findLabField,
  findOperator,
  type OperatorId,
  type Vec3,
} from "@/lib/lab-fields";
import { labCode } from "@/lib/lab-code";
import type {
  MeshData,
  PointResult,
  Request,
  Response,
} from "@/lib/operator-worker";

type Distribute<T> = T extends unknown ? Omit<T, "id"> : never;

const POINTS = 11;

function nearestVertex(vertices: number[][], target: Vec3): Vec3 {
  let best = vertices[0]!;
  let distance = Infinity;
  for (const v of vertices) {
    const d = Math.hypot(
      v[0]! - target[0],
      v[1]! - target[1],
      v[2]! - target[2],
    );
    if (d < distance) {
      distance = d;
      best = v;
    }
  }
  return [best[0]!, best[1]!, best[2]!];
}

function boundingBox(vertices: number[][]) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const v of vertices) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k]!, v[k]!);
      hi[k] = Math.max(hi[k]!, v[k]!);
    }
  }
  return { lo, hi };
}

const format = (x: number) =>
  !Number.isFinite(x)
    ? String(x)
    : x === 0 || (Math.abs(x) >= 1e-3 && Math.abs(x) < 1e4)
      ? x.toFixed(4)
      : x.toExponential(2);

function cubeMesh(n: number): MeshData {
  const mesh = generateUnitCubeMesh(n);
  return { vertices: mesh.getVertices(), tetrahedra: mesh.getTetrahedra() };
}

export function OperatorLab() {
  const [n, setN] = useState(4);
  const [source, setSource] = useState<"cube" | "custom">("cube");
  const [mesh, setMesh] = useState<MeshData>(() => cubeMesh(4));
  const [meshKey, setMeshKey] = useState(1);
  const [meshNote, setMeshNote] = useState("");
  const [operator, setOperator] = useState<OperatorId>("bounded-commuting");
  const [fieldId, setFieldId] = useState("singular");
  const [pasted, setPasted] = useState("");

  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<PointResult[] | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [residual, setResidual] = useState<Extract<
    Response,
    { type: "residuals" }
  > | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const worker = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, (r: Response) => void>());
  const counter = useRef(0);

  const start = useCallback(() => {
    worker.current?.terminate();
    const w = new Worker(new URL("../lib/operator-worker.ts", import.meta.url), {
      type: "module",
    });
    w.onmessage = (event: MessageEvent<Response>) => {
      const resolve = pending.current.get(event.data.id);
      pending.current.delete(event.data.id);
      resolve?.(event.data);
    };
    w.onerror = (event) => {
      setFailure(`The worker stopped: ${event.message}`);
      pending.current.forEach((resolve, id) =>
        resolve({ id, ok: false, error: "the worker stopped" }),
      );
      pending.current.clear();
      setBusy(null);
    };
    worker.current = w;
  }, []);

  useEffect(() => {
    start();
    const current = pending.current;
    return () => {
      worker.current?.terminate();
      current.clear();
    };
  }, [start]);

  const call = useCallback(
    (request: Distribute<Request>) =>
      new Promise<Response>((resolve) => {
        const id = ++counter.current;
        pending.current.set(id, resolve);
        worker.current?.postMessage({ ...request, id });
      }),
    [],
  );

  const cancel = () => {
    pending.current.forEach((resolve, id) =>
      resolve({ id, ok: false, error: "cancelled" }),
    );
    pending.current.clear();
    start();
    setBusy(null);
  };

  const centre = useMemo<Vec3>(() => {
    const { lo, hi } = boundingBox(mesh.vertices);
    return nearestVertex(mesh.vertices, [
      (lo[0]! + hi[0]!) / 2,
      (lo[1]! + hi[1]!) / 2,
      (lo[2]! + hi[2]!) / 2,
    ]);
  }, [mesh]);

  const points = useMemo<Vec3[]>(() => {
    const { lo, hi } = boundingBox(mesh.vertices);
    return Array.from({ length: POINTS }, (_, i) => {
      const t = 0.06 + (0.88 * i) / (POINTS - 1);
      return [
        lo[0]! + t * (hi[0]! - lo[0]!),
        centre[1] + 0.013,
        centre[2] + 0.007,
      ];
    });
  }, [mesh, centre]);

  const clear = () => {
    setResults(null);
    setResidual(null);
    setElapsed(null);
    setFailure(null);
  };

  const replaceMesh = (
    next: MeshData,
    note: string,
    kind: "cube" | "custom",
  ) => {
    setMesh(next);
    setMeshKey((k) => k + 1);
    setMeshNote(note);
    setSource(kind);
    clear();
  };

  const chooseCube = (size: number) => {
    setN(size);
    replaceMesh(cubeMesh(size), "", "cube");
  };

  const loadText = async (text: string, type: "parse-json" | "parse-msh") => {
    setBusy("reading the mesh");
    const response = await call({ type, text });
    setBusy(null);
    if (!response.ok) {
      setFailure(response.error);
      return;
    }
    if (response.type === "mesh") {
      replaceMesh(response.mesh, response.note, "custom");
      toast.success("Mesh loaded", {
        description: `${response.mesh.tetrahedra.length} tetrahedra, ${response.mesh.vertices.length} vertices`,
      });
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    await loadText(
      text,
      file.name.toLowerCase().endsWith(".json") ? "parse-json" : "parse-msh",
    );
  };

  const run = async () => {
    clear();
    setBusy(`evaluating at ${POINTS} points`);
    const response = await call({
      type: "evaluate",
      meshKey,
      mesh,
      operator,
      fieldId,
      centre,
      points,
    });
    setBusy(null);
    if (!response.ok) {
      if (response.error !== "cancelled") setFailure(response.error);
      return;
    }
    if (response.type === "evaluate") {
      setResults(response.results);
      setElapsed(response.milliseconds);
    }
  };

  const measure = async () => {
    setResidual(null);
    setFailure(null);
    setBusy("measuring the residuals");
    const response = await call({
      type: "residuals",
      meshKey,
      mesh,
      operator,
      fieldId,
      centre,
    });
    setBusy(null);
    if (!response.ok) {
      if (response.error !== "cancelled") setFailure(response.error);
      return;
    }
    if (response.type === "residuals") setResidual(response);
  };

  const refine = async () => {
    setBusy("refining");
    const response = await call({ type: "refine", mesh, centre, radius: 0.3 });
    setBusy(null);
    if (!response.ok) {
      setFailure(response.error);
      return;
    }
    if (response.type === "mesh") {
      replaceMesh(response.mesh, response.note, "custom");
    }
  };

  const field = findLabField(fieldId);
  const info = findOperator(operator);
  const code = useMemo(
    () =>
      labCode({
        operator,
        fieldId,
        centre,
        points,
        mesh: source === "cube" ? { kind: "cube", n } : { kind: "custom" },
      }),
    [operator, fieldId, centre, points, source, n],
  );
  const failed = results ? results.filter((r) => r.error) : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Mesh</CardTitle>
            <CardDescription>
              A unit cube, or your own: paste JSON or load a Gmsh .msh file.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Cube, cells per side</Label>
              <Select
                value={source === "cube" ? String(n) : "custom"}
                onValueChange={(v) => v !== "custom" && chooseCube(parseInt(v))}
              >
                <SelectTrigger aria-label="Cells per side">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 4, 5, 6].map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size} ({6 * size ** 3} tetrahedra)
                    </SelectItem>
                  ))}
                  {source === "custom" && (
                    <SelectItem value="custom">your mesh</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted focus-within:ring-2 focus-within:ring-primary">
                <FileUp className="h-3.5 w-3.5" /> Load .msh or .json
                <input
                  type="file"
                  accept=".msh,.json,.txt"
                  className="sr-only"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
              </label>
              <Button
                size="sm"
                variant="outline"
                onClick={refine}
                disabled={!!busy}
              >
                <Scissors className="mr-2 h-3.5 w-3.5" /> Refine near the centre
              </Button>
            </div>
            <div className="space-y-1">
              <Label htmlFor="paste">Or paste JSON</Label>
              <textarea
                id="paste"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder='{"vertices": [[0,0,0],[1,0,0],[0,1,0],[0,0,1]], "tetrahedra": [[0,1,2,3]]}'
                className="h-20 w-full rounded-md border border-border bg-background p-2 font-mono text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => loadText(pasted, "parse-json")}
                disabled={!pasted.trim() || !!busy}
              >
                Use this mesh
              </Button>
            </div>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {mesh.tetrahedra.length.toLocaleString()} tetrahedra,{" "}
              {mesh.vertices.length.toLocaleString()} vertices
              {meshNote ? ` · ${meshNote}` : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operator and field</CardTitle>
            <CardDescription>{info.summary}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Operator</Label>
              <Select
                value={operator}
                onValueChange={(v) => {
                  setOperator(v as OperatorId);
                  clear();
                }}
              >
                <SelectTrigger aria-label="Operator">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                <Gauge className="mr-1 inline h-3 w-3" />
                Cost: {info.cost}.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Field</Label>
              <Select
                value={fieldId}
                onValueChange={(v) => {
                  setFieldId(v);
                  clear();
                }}
              >
                <SelectTrigger aria-label="Field">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LAB_FIELDS.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{field.note}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={run} disabled={!!busy}>
                <Play className="mr-2 h-3.5 w-3.5" /> Run
              </Button>
              <Button variant="outline" onClick={measure} disabled={!!busy}>
                Measure residuals
              </Button>
              {busy && (
                <Button variant="destructive" onClick={cancel}>
                  <Square className="mr-2 h-3.5 w-3.5" /> Cancel
                </Button>
              )}
            </div>
            {busy && (
              <p className="text-xs text-muted-foreground" role="status">
                <RefreshCw className="mr-1 inline h-3 w-3 animate-spin" />
                {busy}… bounded operators solve a local problem for every
                entity near each point.
              </p>
            )}
          </CardContent>
        </Card>
      </aside>

      <section className="space-y-4">
        {failure && (
          <div
            role="alert"
            className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{failure}</span>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>The projection along a line through the centre</CardTitle>
            <CardDescription>
              {POINTS} points on a segment through the vertex the field is
              centred on. The curve is the field; the dots are the operator; a
              red cross is a point the operator could not answer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LineChart
              points={points}
              u={field.make({ centre }).u}
              results={results}
            />
            {results && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary" className="font-mono">
                  {elapsed !== null ? `${(elapsed / 1000).toFixed(2)} s` : ""}
                </Badge>
                <span className="text-muted-foreground" role="status">
                  {failed.length === 0
                    ? "every point answered"
                    : `${failed.length} of ${results.length} points could not be answered`}
                </span>
              </div>
            )}
            {failed.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {[...new Set(failed.map((r) => r.error!))]
                  .slice(0, 3)
                  .map((message) => (
                    <li key={message} className="font-mono">
                      {message}
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Residuals</CardTitle>
            <CardDescription>
              Two of the properties the papers claim, measured for the chosen
              operator on this mesh and field.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {residual ? (
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-muted-foreground">
                    Commuting residual
                  </dt>
                  <dd className="font-mono text-lg">
                    {residual.commuting.value === null
                      ? "–"
                      : format(residual.commuting.value)}
                  </dd>
                  <p className="text-xs text-muted-foreground">
                    {residual.commuting.note}
                  </p>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">
                    Boundary value error
                  </dt>
                  <dd className="font-mono text-lg">
                    {residual.trace.value === null
                      ? "–"
                      : format(residual.trace.value)}
                  </dd>
                  <p className="text-xs text-muted-foreground">
                    {residual.trace.note}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Measured in {(residual.milliseconds / 1000).toFixed(2)} s.
                  The stable and canonical operators keep the point values on
                  the boundary exactly; the trace-preserving operator keeps a
                  weighted average near the boundary, so its error is small
                  but not zero; the bounded commuting one keeps neither, by
                  design.
                </p>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                Press “Measure residuals”. It computes the coefficients on the
                boundary and on a sample of edges, which for the bounded
                operators takes seconds.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>The same thing as a program</CardTitle>
            <CardDescription>
              Runs on Node.js 24 or newer with traceprojector installed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre
              className="max-h-80 overflow-auto rounded-md border bg-zinc-950 p-4 text-xs leading-relaxed text-zinc-100"
              tabIndex={0}
              aria-label="Program"
            >
              <code>{code}</code>
            </pre>
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(code);
                  toast.success("Copied the program");
                }}
              >
                <Copy className="mr-2 h-3.5 w-3.5" /> Copy
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/** The field and the operator's values along the segment, as an SVG. */
function LineChart({
  points,
  u,
  results,
}: {
  points: Vec3[];
  u: (p: number[]) => number;
  results: PointResult[] | null;
}) {
  const width = 640;
  const height = 240;
  const pad = { l: 48, r: 12, t: 12, b: 28 };
  const xs = points.map((p) => p[0]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const dense = Array.from({ length: 120 }, (_, i) => {
    const x = x0 + ((x1 - x0) * i) / 119;
    return { x, y: u([x, points[0]![1], points[0]![2]]) };
  }).filter((d) => Number.isFinite(d.y));
  const answered = (results ?? []).filter((r) => r.value !== null);
  const values = [...dense.map((d) => d.y), ...answered.map((r) => r.value!)];
  // The singular field is unbounded: clip the axis a little below its peak.
  const sorted = [...values].sort((a, b) => a - b);
  const top = sorted[Math.floor(sorted.length * 0.95)] ?? 1;
  const bottom = Math.min(0, sorted[0] ?? 0);
  const y1 = top === bottom ? top + 1 : top;
  const sx = (x: number) =>
    pad.l + ((x - x0) / (x1 - x0)) * (width - pad.l - pad.r);
  const sy = (y: number) =>
    pad.t +
    (1 - (Math.min(y, y1) - bottom) / (y1 - bottom)) * (height - pad.t - pad.b);
  const line = dense
    .map(
      (d, i) =>
        `${i === 0 ? "M" : "L"}${sx(d.x).toFixed(1)},${sy(d.y).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full text-foreground"
      role="img"
      aria-label="The field along the segment, and the values of the operator at the sample points"
    >
      <line
        x1={pad.l}
        x2={width - pad.r}
        y1={sy(bottom)}
        y2={sy(bottom)}
        stroke="currentColor"
        opacity={0.25}
      />
      <line
        x1={pad.l}
        x2={pad.l}
        y1={pad.t}
        y2={height - pad.b}
        stroke="currentColor"
        opacity={0.25}
      />
      <text
        x={pad.l - 6}
        y={pad.t + 8}
        textAnchor="end"
        fontSize={10}
        fill="currentColor"
        opacity={0.7}
      >
        {format(y1)}
      </text>
      <text
        x={pad.l - 6}
        y={height - pad.b}
        textAnchor="end"
        fontSize={10}
        fill="currentColor"
        opacity={0.7}
      >
        {format(bottom)}
      </text>
      <text
        x={width / 2}
        y={height - 6}
        textAnchor="middle"
        fontSize={10}
        fill="currentColor"
        opacity={0.7}
      >
        x
      </text>
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        opacity={0.55}
      />
      {(results ?? []).map((r, i) => {
        const x = sx(points[i]![0]);
        return r.value === null ? (
          <g key={i} stroke="#ef4444" strokeWidth={2}>
            <line x1={x - 4} x2={x + 4} y1={sy(bottom) - 8} y2={sy(bottom)} />
            <line x1={x - 4} x2={x + 4} y1={sy(bottom)} y2={sy(bottom) - 8} />
          </g>
        ) : (
          <circle key={i} cx={x} cy={sy(r.value)} r={4} fill="#3b82f6" />
        );
      })}
    </svg>
  );
}
