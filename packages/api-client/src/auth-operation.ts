/** Runtime seam for generated bindings: validate using the original shared Zod schemas. */
export interface AuthRuntimeSchema {
  readonly _zod: { readonly input: unknown; readonly output: unknown };
  parse(value: unknown): unknown;
}
export interface AuthRuntimeOperation {
  spec: {
    method: string;
    pathShape: string;
    request: { body: AuthRuntimeSchema; params: AuthRuntimeSchema; query: AuthRuntimeSchema };
  };
  success: AuthRuntimeSchema;
  successStatus: number;
}
type Input<S extends AuthRuntimeSchema> = S['_zod']['input'];
type Field<K extends string, S extends AuthRuntimeSchema> =
  undefined extends Input<S>
    ? { [P in K]?: Input<S> }
    : Record<string, never> extends Input<S>
      ? { [P in K]?: Input<S> }
      : { [P in K]: Input<S> };
export type AuthOperationInput<C extends AuthRuntimeOperation> = Field<'body', C['spec']['request']['body']> &
  Field<'params', C['spec']['request']['params']> &
  Field<'query', C['spec']['request']['query']> & {
    token?: string;
    csrf?: string;
    challenge?: string | undefined;
  };
export interface AuthTransportOptions {
  method: string;
  successStatus: number;
  body?: unknown;
  token?: string;
  csrf?: string;
  challenge?: string | undefined;
}
export interface AuthTransport {
  <T>(path: string, schema: { parse(value: unknown): T }, options: AuthTransportOptions): Promise<T>;
}

export async function executeAuthOperation<C extends AuthRuntimeOperation>(
  transport: AuthTransport,
  contract: C,
  input: AuthOperationInput<C>,
): Promise<C['success']['_zod']['output']> {
  // Parsing precedes transport: transforms/refinements never disappear in generated bindings.
  const body = contract.spec.request.body.parse(input.body);
  const params = contract.spec.request.params.parse(input.params ?? {});
  const query = contract.spec.request.query.parse(input.query ?? {});
  if (params === null || typeof params !== 'object' || query === null || typeof query !== 'object')
    throw new Error('invalid operation parameters');
  const path = contract.spec.pathShape.replace(/\{([^}]+)\}/g, (_match: string, key: string) => {
    const value: unknown = Object.getOwnPropertyDescriptor(params, key)?.value;
    if (typeof value !== 'string') throw new Error('invalid path parameter');
    return encodeURIComponent(value);
  });
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (typeof value !== 'string') throw new Error('invalid query parameter');
    search.set(key, value);
  }
  if (input.token !== undefined && input.challenge !== undefined) throw new Error('ambiguous authorization');
  const suffix = search.size === 0 ? '' : `?${search.toString()}`;
  // The return schema is deliberately the original schema, not reconstructed from OpenAPI.
  return transport<C['success']['_zod']['output']>(
    path + suffix,
    {
      parse: (value) => contract.success.parse(value),
    },
    {
      method: contract.spec.method,
      successStatus: contract.successStatus,
      ...(body === undefined ? {} : { body }),
      ...(input.token === undefined ? {} : { token: input.token }),
      ...(input.csrf === undefined ? {} : { csrf: input.csrf }),
      ...(input.challenge === undefined ? {} : { challenge: input.challenge }),
    },
  );
}
