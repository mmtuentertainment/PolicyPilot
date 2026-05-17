// Validates .coderabbit.yaml against the official CodeRabbit JSON Schema
// (https://coderabbit.ai/integrations/schema.v2.json). Invoked by
// `pnpm check:coderabbit-config`. Exits 0 on valid, 1 on schema violation
// or network failure. Schema is fetched live (lightweight, ~73 KB) so the
// check always sees the current contract — no committed snapshot to rot.
import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import Ajv, { type ErrorObject } from "ajv";

const SCHEMA_URL = "https://coderabbit.ai/integrations/schema.v2.json";
const CONFIG_PATH = path.resolve(process.cwd(), ".coderabbit.yaml");
const FETCH_TIMEOUT_MS = 10_000;

async function fetchSchema(): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(SCHEMA_URL, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

async function main(): Promise<void> {
  let schema: unknown;
  try {
    schema = await fetchSchema();
  } catch (err) {
    console.error(`Could not fetch ${SCHEMA_URL}`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  if (!isObject(schema)) {
    console.error("Schema endpoint returned a non-object payload");
    process.exit(1);
  }

  let configText: string;
  try {
    configText = await fs.readFile(CONFIG_PATH, "utf8");
  } catch (err) {
    console.error(`Could not read ${CONFIG_PATH}`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  let config: unknown;
  try {
    config = yaml.load(configText);
  } catch (err) {
    console.error(".coderabbit.yaml is not valid YAML");
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
    validateFormats: false,
  });

  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (err) {
    console.error("Schema failed to compile in Ajv");
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  if (validate(config)) {
    console.log("OK — .coderabbit.yaml passes schema.v2.json validation");
    process.exit(0);
  }

  const errors = (validate.errors ?? []) as ErrorObject[];
  console.error(`FAIL — ${errors.length} schema violation(s):`);
  for (const e of errors) {
    const where = e.instancePath !== "" ? e.instancePath : "(root)";
    const params = JSON.stringify(e.params);
    console.error(`  ${where} :: ${e.message ?? "?"} :: ${params}`);
  }
  process.exit(1);
}

void main();
