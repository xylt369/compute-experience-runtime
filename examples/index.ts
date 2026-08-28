import type { ModelDefinition } from "@compute-experience/core";
import { customModel } from "./custom-model";
import { lorenz } from "./lorenz";
import { lotkaVolterra } from "./lotka-volterra";
import { pendulum } from "./pendulum";
import { rossler } from "./rossler";
import { semanticDemo } from "./semantic-demo";
import { sir } from "./sir";
import { vanDerPol } from "./van-der-pol";

export { lorenz } from "./lorenz";
export { sir } from "./sir";
export { pendulum } from "./pendulum";
export { rossler } from "./rossler";
export { lotkaVolterra } from "./lotka-volterra";
export { vanDerPol } from "./van-der-pol";
export { customModel } from "./custom-model";

export const models: Record<string, ModelDefinition> = {
  [lorenz.manifest.id]: lorenz,
  [sir.manifest.id]: sir,
  [pendulum.manifest.id]: pendulum,
  [rossler.manifest.id]: rossler,
  [lotkaVolterra.manifest.id]: lotkaVolterra,
  [vanDerPol.manifest.id]: vanDerPol,
  [customModel.manifest.id]: customModel,
  [semanticDemo.manifest.id]: semanticDemo,
};

export const modelList: ModelDefinition[] = Object.values(models);
