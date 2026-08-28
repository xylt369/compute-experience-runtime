#!/usr/bin/env node
/**
 * cx: The POSIX-grade Command-Line Interface for Compute Experience Runtime.
 *
 * Usage:
 *   cx run <model> [--steps N] [--params json] [--format text|json|ndjson]
 *   cx fork <model> --at <time> [--intervene field=delta]
 *   cx diff <model> [--intervene field=delta] [--threshold eps]
 *   cx trace <model> [--step N] [--node id]
 *   cx inspect <model>
 *   cx models
 */

import { models } from "../examples/index.js";
import {
  createRuntime,
  defaultParameters,
  compareRuns,
  validateComposedModel,
  sirComposedModel,
  lorenzComposedModel,
} from "../packages/core/src/index.js";
import { createRendererRegistry } from "../packages/renderers/src/index.js";

const registry = createRendererRegistry();

function printHelp() {
  console.log(`
\x1b[1mCompute Experience Runtime CLI (cx)\x1b[0m

\x1b[36mCommands:\x1b[0m
  cx models                                List all registered catalog models
  cx run <model> [options]                 Execute headless simulation run
  cx fork <model> --at <time> [options]    Branch and intervene on a run
  cx diff <model> [options]                Compute exact numerical divergence
  cx trace <model> [options]               Emit structured causal flux traces
  cx inspect <model>                       Validate model against causal primitive rules

\x1b[36mOptions:\x1b[0m
  --steps <n>              Number of integration steps to simulate
  --at <time>              Fork timestamp (float)
  --intervene <k=v>        Perturbation (e.g. --intervene x=+1e-8)
  --params <json>          Model parameter overrides in JSON format
  --format <type>          Output format: text | json | ndjson | csv (default: text)
  --help, -h               Show this help message
`);
}

function parseArgs(args: string[]) {
  const parsed: { command?: string; target?: string; flags: Record<string, string> } = {
    flags: {},
  };
  let positionalCount = 0;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        parsed.flags[key] = next;
        i++;
      } else {
        parsed.flags[key] = "true";
      }
    } else if (arg === "-h") {
      parsed.flags["help"] = "true";
    } else {
      if (positionalCount === 0) parsed.command = arg;
      else if (positionalCount === 1) parsed.target = arg;
      positionalCount++;
    }
  }
  return parsed;
}

export async function main(argv = process.argv.slice(2)) {
  const { command, target, flags } = parseArgs(argv);

  if (!command || flags["help"] || command === "help") {
    printHelp();
    return 0;
  }

  if (command === "models") {
    const list = Object.values(models);
    console.log(`\x1b[1mAvailable Models (${list.length}):\x1b[0m`);
    for (const m of list) {
      console.log(`  - \x1b[32m${m.manifest.id.padEnd(26)}\x1b[0m ${m.manifest.name} (${m.manifest.state.join(", ")})`);
    }
    return 0;
  }

  if (command === "inspect") {
    const modelId = target ?? "sir-epidemic";
    if (modelId === "sir-epidemic" || modelId === "sir") {
      const val = validateComposedModel(sirComposedModel);
      console.log(`\x1b[1mModel Inspection: sir-epidemic (Composed)\x1b[0m`);
      console.log(`Valid: ${val.ok ? "\x1b[32mYES\x1b[0m" : "\x1b[31mNO\x1b[0m"}`);
      console.log(`Topological Order: ${val.order?.join(" -> ")}`);
      return val.ok ? 0 : 1;
    } else if (modelId === "lorenz-attractor" || modelId === "lorenz") {
      const val = validateComposedModel(lorenzComposedModel);
      console.log(`\x1b[1mModel Inspection: lorenz-attractor (Composed)\x1b[0m`);
      console.log(`Valid: ${val.ok ? "\x1b[32mYES\x1b[0m" : "\x1b[31mNO\x1b[0m"}`);
      console.log(`Topological Order: ${val.order?.join(" -> ")}`);
      return val.ok ? 0 : 1;
    } else {
      const m = models[modelId];
      if (!m) {
        console.error(`\x1b[31mError:\x1b[0m Unknown model "${modelId}". Run 'cx models' to view catalog.`);
        return 1;
      }
      console.log(`\x1b[1mModel Inspection: ${m.manifest.id}\x1b[0m`);
      console.log(`States: ${m.manifest.state.join(", ")}`);
      console.log(`Parameters: ${m.manifest.parameters.map((p) => p.id).join(", ")}`);
      console.log(`Renderer: ${m.manifest.renderer}`);
      return 0;
    }
  }

  if (command === "run") {
    const modelId = target ?? "lorenz-attractor";
    const model = models[modelId];
    if (!model) {
      console.error(`\x1b[31mError:\x1b[0m Unknown model "${modelId}".`);
      return 1;
    }

    let params = defaultParameters(model);
    if (flags["params"]) {
      try {
        params = { ...params, ...JSON.parse(flags["params"]) };
      } catch {
        console.error(`\x1b[31mError:\x1b[0m Invalid JSON in --params.`);
        return 1;
      }
    }

    const runtime = createRuntime({
      model,
      rendererRegistry: registry,
      parameters: params,
    });
    runtime.rebuild();

    const format = flags["format"] ?? "text";
    const frames = runtime.timeline.frames;

    if (format === "json") {
      console.log(JSON.stringify(frames, null, 2));
    } else if (format === "ndjson") {
      for (const f of frames) console.log(JSON.stringify(f));
    } else if (format === "csv") {
      const keys = model.manifest.state;
      console.log(`t,${keys.join(",")}`);
      for (const f of frames) {
        console.log(`${f.t},${keys.map((k) => f.state[k]).join(",")}`);
      }
    } else {
      console.log(`\x1b[1mExecuted Run: ${model.manifest.name}\x1b[0m (${frames.length} frames)`);
      const head = frames[0]!;
      const tail = frames[frames.length - 1]!;
      console.log(`  Initial (t=${head.t}):`, head.state);
      console.log(`  Final   (t=${tail.t.toFixed(2)}):`, tail.state);
    }
    return 0;
  }

  if (command === "diff" || command === "fork") {
    const modelId = target ?? "lorenz-attractor";
    const model = models[modelId];
    if (!model) {
      console.error(`\x1b[31mError:\x1b[0m Unknown model "${modelId}".`);
      return 1;
    }

    const runtime = createRuntime({
      model,
      rendererRegistry: registry,
      parameters: defaultParameters(model),
    });
    runtime.rebuild();

    const forkTime = parseFloat(flags["at"] ?? "5.0");
    runtime.forkAtTime(forkTime);
    const branch = runtime.comparisonRuns[0]!;

    const intervene = flags["intervene"] ?? "x=1e-8";
    const [field, valStr] = intervene.split("=");
    if (field && valStr) {
      const delta = parseFloat(valStr);
      const forkFrame = branch.timeline.frames[branch.forkPoint!.index]!;
      branch.setForkState({ ...forkFrame.state, [field]: (forkFrame.state[field] ?? 0) + delta });
    }

    const comp = compareRuns(runtime.primaryRun, branch);

    console.log(`\x1b[1mCounterfactual Run Divergence Report\x1b[0m`);
    console.log(`  Model:           ${model.manifest.name}`);
    console.log(`  Fork Timestamp:  t = ${forkTime.toFixed(2)}s`);
    console.log(`  Intervention:    ${intervene}`);
    console.log(`  Divergence Time: ${comp.divergenceTime != null ? `\x1b[33mt = ${comp.divergenceTime.toFixed(2)}s\x1b[0m` : "None detected"}`);
    console.log(`  Max Magnitude:   ${comp.divergenceMagnitude != null ? comp.divergenceMagnitude.toExponential(4) : "0"}`);
    return 0;
  }

  console.error(`\x1b[31mUnknown command:\x1b[0m ${command}. Run 'cx --help'.`);
  return 1;
}

if (process.argv[1]?.endsWith("cx.ts") || process.argv[1]?.endsWith("cx.js") || process.argv[1]?.endsWith("cx")) {
  main().then((code) => {
    if (code !== 0) process.exit(code);
  });
}
