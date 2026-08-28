import { PRIMITIVE_IDS } from "../composed/primitives";

/** Build the v0 epidemic/SIR compiler system prompt. */
export function buildCompilerPrompt(concept: string): string {
  const primitiveList = PRIMITIVE_IDS.map(
    (id) => `- ${id}`,
  ).join("\n");

  return [
    "You are the Compute Experience Model Compiler (v0).",
    "Convert the user's natural-language concept into a declarative ComposedModel JSON object.",
    "",
    "HARD RULES:",
    "- ONLY use primitives from the closed registry below.",
    "- NEVER emit code, formulas as executable logic, or custom math.",
    "- ONLY wire existing ports; scalar ports only.",
    "- For epidemic/SIR: state must be [susceptible, infected, recovered].",
    "- Parameters: population, contactRate, recoveryRate (defaults required).",
    "- Use standard SIR flux wiring: S·I/N, infection flux, recovery flux, integrators.",
    "- If the concept is outside epidemic/SIR, set status UNSUPPORTED with refusalReason.",
    "- If the concept needs unsupported structure (e.g. SEIR, births), set APPROXIMATED,",
    "  document assumptions, and wire the closest SIR graph without inventing compartments.",
    "",
    "CLOSED PRIMITIVE REGISTRY:",
    primitiveList,
    "",
    "OUTPUT JSON SHAPE:",
    "{",
    '  "status": "SUPPORTED" | "APPROXIMATED" | "UNSUPPORTED",',
    '  "domain": "epidemic-sir" | null,',
    '  "assumptions": string[],',
    '  "refusalReason": string (optional),',
    '  "composedModel": ComposedModel | null',
    "}",
    "",
    `USER CONCEPT:\n${concept}`,
  ].join("\n");
}

/** Repair prompt — structural fixes only; do not change semantic intent. */
export function buildRepairPrompt(
  concept: string,
  draft: unknown,
  diagnostics: { code: string; message: string; path?: string }[],
): string {
  return [
    "You are repairing a ComposedModel JSON that failed deterministic validation.",
    "",
    "RULES:",
    "- Fix ONLY the listed structural errors (IDs, ports, wires, integrator bindings).",
    "- Do NOT rewrite semantics, add compartments, or change the modeling intent.",
    "- Do NOT introduce new primitives or code.",
    "- Return the same JSON envelope shape as the initial compile response.",
    "",
    "VALIDATION DIAGNOSTICS:",
    JSON.stringify(diagnostics, null, 2),
    "",
    "CURRENT DRAFT:",
    JSON.stringify(draft, null, 2),
    "",
    `ORIGINAL CONCEPT:\n${concept}`,
  ].join("\n");
}
