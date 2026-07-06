/**
 * Which side of a session this machine is on.
 * - `host`: shares its screen/audio and executes incoming input. Its identity
 *   is a perch code others dial.
 * - `controller`: dials a host's code, views its stream and sends input.
 */
export type SessionRole = 'host' | 'controller'
