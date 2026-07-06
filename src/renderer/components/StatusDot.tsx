/*
 * StatusDot — a one-glance read of where the session is. It translates the
 * domain SessionStatus into a colored, sometimes-pulsing light plus plain,
 * end-user wording. Purely presentational: it derives everything from the
 * status prop and holds no state.
 */
import type { SessionStatus } from '@domain/session/SessionStatus'
import styles from './StatusDot.module.css'

interface StatusDotProps {
  status: SessionStatus
}

interface Look {
  color: string
  pulse: string
  label: string
}

const LOOK: Record<SessionStatus, Look> = {
  idle: { color: styles.muted ?? '', pulse: '', label: 'Idle' },
  awaiting: { color: styles.amber ?? '', pulse: '', label: 'Waiting to connect' },
  connecting: { color: styles.amber ?? '', pulse: styles.pulseAmber ?? '', label: 'Connecting' },
  live: { color: styles.live ?? '', pulse: styles.pulseLive ?? '', label: 'Live' },
  ended: { color: styles.muted ?? '', pulse: '', label: 'Session ended' },
  failed: { color: styles.danger ?? '', pulse: '', label: 'Connection lost' }
}

export function StatusDot({ status }: StatusDotProps): React.JSX.Element {
  const look = LOOK[status]
  return (
    <span className={styles.root}>
      <span className={[styles.dot, look.color, look.pulse].filter(Boolean).join(' ')} />
      {look.label}
    </span>
  )
}
