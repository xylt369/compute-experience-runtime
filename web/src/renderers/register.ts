import { RendererRegistry } from "../../../runtime/renderer.registry";
import type { ModelFrame, ModelManifest } from "../../../runtime/model.schema";
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
