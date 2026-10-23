import { HEALTH_LABELS, type Health } from '../format'

export function StatusDot({ health }: { health: Health }) {
  return <span className={`dot dot-${health}`} title={HEALTH_LABELS[health]} />
}
