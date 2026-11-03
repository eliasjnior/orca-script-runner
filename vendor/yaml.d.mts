// The part of the vendored `yaml` package (vendor/yaml.mjs) the worker uses.
export type ParseOptions = {
  /** Refuse duplicate mapping keys, as Orca does. Default true. */
  uniqueKeys?: boolean
  /** Alias expansion budget; Orca uses 100. */
  maxAliasCount?: number
}
export function parse(source: string, options?: ParseOptions): unknown
