/*
 * HostingView — shown while this machine is sharing. It presents the published
 * perch code to read aloud or copy, and narrates the connection in plain terms:
 * waiting, then connected. The copy shifts with status so the host always knows
 * whether anyone is actually driving, and can stop at any moment.
 */
import { useEffect, useState } from 'react'
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
  // This machine's LAN address, so the controller knows where to dial. null
  // until resolved, or when no network address is available.
  const [lanAddress, setLanAddress] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void window.perch?.getLanAddress().then((addr) => {
      if (alive) setLanAddress(addr)
    })
    return () => {
      alive = false
    }
  }, [])

  return (
    <main className={styles.root}>
      <p className={styles.instruction}>
        On the other machine, enter this address and the perch code below.
      </p>

      {lanAddress !== null && (
        <p className={styles.address}>
          Address <strong>{lanAddress}</strong>
        </p>
      )}

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
