/**
 * Embedded signaling rendezvous. On the host machine Perch runs its own WebRTC
 * rendezvous in-process, so pairing two machines on a LAN needs no external
 * server — "just the executable." The host renderer dials ws://127.0.0.1:PORT;
 * a controller on the same network dials ws://<this-machine-ip>:PORT. Only the
 * WebRTC handshake flows through it — never audio, video, or input.
 *
 * The SignalingServer it runs is the same implementation deployed to the cloud
 * (see the ../perch-signaling-server repo, Docker-deployed), so hosted and
 * embedded signaling behave identically. That server code lives here too because
 * the packaged app embeds it for LAN pairing — kept byte-for-byte in sync by
 * hand with the standalone repo.
 *
 * A bind failure (e.g. the port is already taken because another Perch is
 * hosting here) is logged and swallowed: a controller-only session dials a
 * remote rendezvous and never needs the local one.
 */
import { RENDEZVOUS_PORT } from '@shared/bridge'
import { SignalingServer } from './SignalingServer'

export async function startRendezvous(): Promise<void> {
  try {
    await new SignalingServer(RENDEZVOUS_PORT).start()
    console.log(`[perch] embedded rendezvous listening on :${RENDEZVOUS_PORT}`)
  } catch (err) {
    console.warn('[perch] embedded rendezvous did not start (fine if controlling):', err)
  }
}
