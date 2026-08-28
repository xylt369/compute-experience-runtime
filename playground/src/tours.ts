import type { ComputeRuntime } from "@compute-experience/core";

export interface MuseumTour {
  id: string;
  title: string;
  subtitle: string;
  modelId: string;
  steps: {
    title: string;
    narrative: string;
    action: (runtime: ComputeRuntime) => void;
  }[];
}

export const MUSEUM_TOURS: Record<string, MuseumTour> = {
  butterfly: {
    id: "butterfly",
    title: "Touch the Butterfly",
    subtitle: "How a 10⁻⁸ flap of a wing rewrites the future in Lorenz space",
    modelId: "lorenz-attractor",
    steps: [
      {
        title: "1. The Deterministic Orbit",
        narrative: "Lorenz system trajectories wind around two strange attractor lobes in deterministic phase space.",
        action: (runtime) => {
          runtime.clearBranches();
          runtime.seek(0);
          runtime.play();
        },
      },
      {
        title: "2. The Fork & Micro-Perturbation",
        narrative: "At t = 5.0, we branch an alternative history with Δx = +10⁻⁸ — one hundred-millionth of a unit.",
        action: (runtime) => {
          runtime.pause();
          runtime.seek(5.0);
          runtime.forkAtTime(5.0);
          const branch = runtime.comparisonRuns[0];
          if (branch && branch.forkPoint) {
            const f = branch.timeline.frames[branch.forkPoint.index];
            if (f) branch.setForkState({ ...f.state, x: f.state.x + 1e-8 });
          }
          runtime.setSyncPlayback(true);
          runtime.play();
        },
      },
    ],
  },

  flattenCurve: {
    id: "flattenCurve",
    title: "Flatten the Curve",
    subtitle: "Public health policy intervention on epidemic spread",
    modelId: "sir-epidemic",
    steps: [
      {
        title: "1. Unmitigated Outbreak",
        narrative: "Infection grows exponentially towards a high peak that threatens healthcare capacity.",
        action: (runtime) => {
          runtime.clearBranches();
          runtime.seek(0);
          runtime.play();
        },
      },
      {
        title: "2. Policy Lockdown on Day 22",
        narrative: "We introduce an emergency quarantine policy on Day 22, isolating infected carriers.",
        action: (runtime) => {
          runtime.pause();
          runtime.seek(22.0);
          runtime.forkAtTime(22.0);
          const branch = runtime.comparisonRuns[0];
          if (branch && branch.forkPoint) {
            const f = branch.timeline.frames[branch.forkPoint.index];
            if (f) branch.setForkState({ ...f.state, infected: Math.max(1, f.state.infected - 50) });
          }
          runtime.setSyncPlayback(true);
          runtime.play();
        },
      },
    ],
  },

  predatorPrey: {
    id: "predatorPrey",
    title: "Ecological Conservation Orbit",
    subtitle: "Lotka-Volterra predator-prey invariant contours",
    modelId: "lotka-volterra",
    steps: [
      {
        title: "1. The Natural Cycle",
        narrative: "Hares flourish, fueling lynx growth, which depletes hares, creating a perpetual phase cycle.",
        action: (runtime) => {
          runtime.clearBranches();
          runtime.seek(0);
          runtime.play();
        },
      },
      {
        title: "2. Ecological Perturbation",
        narrative: "At Month 6, we introduce 10 additional prey into the ecosystem and observe the shifted orbit.",
        action: (runtime) => {
          runtime.pause();
          runtime.seek(6.0);
          runtime.forkAtTime(6.0);
          const branch = runtime.comparisonRuns[0];
          if (branch && branch.forkPoint) {
            const f = branch.timeline.frames[branch.forkPoint.index];
            if (f) branch.setForkState({ ...f.state, prey: f.state.prey + 10 });
          }
          runtime.setSyncPlayback(true);
          runtime.play();
        },
      },
    ],
  },
};
