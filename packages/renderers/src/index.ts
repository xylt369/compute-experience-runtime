import type { ModelFrame, ModelManifest } from "@compute-experience/core";
import { RendererRegistry } from "./registry";
import { Pendulum2DRenderer } from "./pendulum-2d";
import { Timeseries2DRenderer } from "./timeseries-2d";
import { Trajectory3DRenderer } from "./trajectory-3d";

export function createRendererRegistry() {
  const registry = new RendererRegistry<ModelFrame, ModelManifest>();
  registry.register(new Trajectory3DRenderer());
  registry.register(new Pendulum2DRenderer());
  registry.register(new Timeseries2DRenderer());
  return registry;
}

export { RendererRegistry } from "./registry";
export { Pendulum2DRenderer } from "./pendulum-2d";
export { Timeseries2DRenderer } from "./timeseries-2d";
export { Trajectory3DRenderer } from "./trajectory-3d";
