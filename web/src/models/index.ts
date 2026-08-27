import type { ModelDefinition } from "../../../runtime/model.schema";
import { lorenz } from "./lorenz";
import { pendulum } from "./pendulum";
import { rossler } from "./rossler";
import { sir } from "./sir";

export const models: Record<string, ModelDefinition> = {
  [lorenz.manifest.id]: lorenz,
  [rossler.manifest.id]: rossler,
  [pendulum.manifest.id]: pendulum,
  [sir.manifest.id]: sir,
};

export const modelList: ModelDefinition[] = Object.values(models);
