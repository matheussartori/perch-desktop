/**
 * Marker for facts that have happened in the domain. Aggregates record them
 * so the application layer can react (notify UI, log, relay) without the
 * domain reaching outward.
 */
export interface DomainEvent {
  readonly kind: string
}
