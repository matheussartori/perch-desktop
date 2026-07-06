/*
 * HostingView — shown while this machine is sharing. It presents the published
 * perch code to read aloud or copy, and narrates the connection in plain terms:
 * waiting, then connected. The copy shifts with status so the host always knows
 * whether anyone is actually driving, and can stop at any moment.
 */
import type { SessionStatus } from '@domain/session/SessionStatus'
import { PerchCode } from './PerchCode'
import { StatusDot } from './StatusDot'
import styles from './HostingView.module.css'

interface HostingViewProps {
  myCode: string
  status: SessionStatus
  disconnect: () => void
}

function headlineFor(status: SessionStatus): string {
  switch (status) {
    case 'live':
      return 'Connected — your screen is being controlled'
    case 'failed':
      return 'The connection dropped'
    case 'ended':
      return 'Sharing has stopped'
    default:
      return 'Waiting for someone to connect…'
  }
}

export function HostingView({ myCode, status, disconnect }: HostingViewProps): React.JSX.Element {
  return (
    <main className={styles.root}>
      <p className={styles.instruction}>Share this perch code with the person connecting.</p>

      <PerchCode code={myCode} />

      <div className={styles.status}>
        <p className={styles.headline}>{headlineFor(status)}</p>
        <StatusDot status={status} />
        <p className={styles.reassurance}>You can stop sharing at any time.</p>
      </div>

      <button type="button" className={styles.stop} onClick={disconnect}>
        Stop sharing
      </button>
    </main>
  )
}
