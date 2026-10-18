import { z } from 'zod';
import { utcInstantSchema } from './time.js';

/** Required semantic profile: these annotations are executable contract data, not prose.
 * Plain JSON Schema validators cannot implement normalization or compare sibling strings.
 * Consumers must compile this profile; unknown versions/instructions fail closed.
 */
export const CONTRACT_RULES = 'x-boro-rules';
const step = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('trim') }),
  z.strictObject({ op: z.literal('nfkc') }),
  z.strictObject({ op: z.literal('lowercase') }),
  z.strictObject({ op: z.literal('min'), value: z.number().int().min(0).max(4096) }),
  z.strictObject({ op: z.literal('max'), value: z.number().int().min(0).max(4096) }),
  z.strictObject({ op: z.literal('pattern'), value: z.string().max(1024) }),
  z.strictObject({ op: z.literal('no-control-format') }),
]);
const descriptorSchema = z.discriminatedUnion('kind', [
  z.strictObject({ version: z.literal(1), kind: z.literal('strip-unknown') }),
  z.strictObject({ version: z.literal(1), kind: z.literal('text'), steps: z.array(step).min(1).max(16) }),
  z.strictObject({
    version: z.literal(1),
    kind: z.literal('utc-before'),
    from: z.literal('from'),
    to: z.literal('to'),
  }),
]);
export type ContractRules = z.infer<typeof descriptorSchema>;
type TextRules = Extract<ContractRules, { kind: 'text' }>;
const registrations = new WeakMap<z.ZodType, { base: z.ZodType; rules: ContractRules }>();
function rules(value: unknown): ContractRules {
  const parsed = descriptorSchema.parse(value);
  if (parsed.kind === 'text') {
    for (const entry of parsed.steps) Object.freeze(entry);
    Object.freeze(parsed.steps);
  }
  return Object.freeze(parsed);
}
export function contractRuleRegistration(schema: z.ZodType) {
  return registrations.get(schema);
}

export function contractText(value: TextRules): z.ZodType<string, string> {
  const parsed = rules(value);
  if (parsed.kind !== 'text') throw new Error('Expected text rules');
  let schema: z.ZodType<string, string> = z.string();
  for (const entry of parsed.steps) {
    switch (entry.op) {
      case 'trim':
        schema = schema.transform((text) => text.trim());
        break;
      case 'nfkc':
        schema = schema.transform((text) => text.normalize('NFKC'));
        break;
      case 'lowercase':
        schema = schema.transform((text) => text.toLowerCase());
        break;
      case 'min':
        schema = schema.pipe(z.string().min(entry.value));
        break;
      case 'max':
        schema = schema.pipe(z.string().max(entry.value));
        break;
      case 'pattern':
        schema = schema.pipe(z.string().regex(new RegExp(entry.value)));
        break;
      case 'no-control-format':
        schema = schema.refine((text) => !/[\p{Cc}\p{Cf}]/u.test(text));
        break;
    }
  }
  const implementation = schema;
  schema = z
    .string()
    .refine((text) => implementation.safeParse(text).success, { abort: true })
    .overwrite((text) => implementation.parse(text))
    .meta({ [CONTRACT_RULES]: parsed });
  registrations.set(schema, Object.freeze({ base: z.string(), rules: parsed }));
  return schema;
}
const instantKey = (value: string) => value.slice(0, 19) + '.' + value.slice(19, -1).replace('.', '').padEnd(9, '0');
function ordered(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const from: unknown = Object.getOwnPropertyDescriptor(value, 'from')?.value;
  const to: unknown = Object.getOwnPropertyDescriptor(value, 'to')?.value;
  if (from !== undefined && !utcInstantSchema.safeParse(from).success) return false;
  if (to !== undefined && !utcInstantSchema.safeParse(to).success) return false;
  return (
    from === undefined ||
    to === undefined ||
    (typeof from === 'string' && typeof to === 'string' && instantKey(from) < instantKey(to))
  );
}
export function contractUtcBefore<T extends z.ZodObject>(base: T): T {
  const parsed = rules({ version: 1, kind: 'utc-before', from: 'from', to: 'to' });
  const schema = base
    .refine(ordered, { message: 'from must precede to' })
    .meta({ ...base.meta(), [CONTRACT_RULES]: parsed });
  registrations.set(schema, Object.freeze({ base, rules: parsed }));
  return schema;
}

/** Compile a profile annotation from a generated tree. No source functions/eval/imports
 * are accepted in metadata. Rebuild the exact finite instruction set instead.
 */
export function restoreContractRules<T extends z.ZodType>(schema: T): T;
export function restoreContractRules(schema: z.ZodType): z.ZodType {
  if (registrations.has(schema)) return schema;
  const metadata = schema.meta();
  const descriptor: unknown = metadata?.[CONTRACT_RULES];
  if (descriptor !== undefined) {
    const parsed = rules(descriptor);
    if (parsed.kind === 'text') {
      if (schema._zod.def.type !== 'string' || (schema._zod.def.checks?.length ?? 0) !== 0)
        throw new Error('Text profile requires an unconstrained structural string');
      return contractText(parsed);
    }
    if (!(schema instanceof z.ZodObject)) throw new Error('Object profile requires an object');
    if ((schema._zod.def.checks?.length ?? 0) !== 0) throw new Error('UTC profile forbids unregistered checks');
    // Remove only this annotation before applying it once to the rebuilt base.
    const { [CONTRACT_RULES]: _removed, ...rest } = metadata ?? {};
    const base = restoreChildren(schema).meta(rest) as z.ZodObject;
    if (parsed.kind === 'strip-unknown') {
      const structural = base.strip().meta({ ...rest, additionalProperties: true });
      const restored = structural.meta({ ...rest, additionalProperties: true, [CONTRACT_RULES]: parsed });
      registrations.set(restored, Object.freeze({ base: structural, rules: parsed }));
      return restored;
    }
    return contractUtcBefore(base);
  }
  return restoreChildren(schema);
}
function restoreChildren(schema: z.ZodType): z.ZodType {
  // The traversal copies definitions, never mutating cached/shared generated schemas.
  const copy = (value: unknown): unknown => {
    if (value instanceof z.ZodType) return restoreContractRules(value);
    if (Array.isArray(value)) return value.map(copy);
    if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copy(child)]));
    return value;
  };
  return schema.clone(copy(schema._zod.def) as typeof schema._zod.def).meta(schema.meta() ?? {});
}

/** Profile-aware JSON Schema validators register this assertion keyword. Strict generic
 * validators reject the unknown keyword rather than silently treating it as validated.
 */
export function compileContractAssertion(value: unknown): (data: unknown) => boolean {
  const parsed = rules(value);
  if (parsed.kind === 'text') {
    const schema = contractText(parsed);
    return (data) => schema.safeParse(data).success;
  }
  if (parsed.kind === 'strip-unknown')
    return (data) => data !== null && typeof data === 'object' && !Array.isArray(data);
  return ordered;
}
