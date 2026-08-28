import type { ModelDefinition } from "@compute-experience/core";
import { customModel } from "./custom-model";
import { lorenz } from "./lorenz";
import { pendulum } from "./pendulum";
import { rossler } from "./rossler";
import { semanticDemo } from "./semantic-demo";
import { sir } from "./sir";

export const models: Record<string, ModelDefinition> = {
  [lorenz.manifest.id]: lorenz,
  [rossler.manifest.id]: rossler,
  [pendulum.manifest.id]: pendulum,
  [sir.manifest.id]: sir,
  [customModel.manifest.id]: customModel,
  [semanticDemo.manifest.id]: semanticDemo,
};

export const modelList: ModelDefinition[] = Object.values(models);
