import { M0ExperienceSession } from './session.js'

/** Constructs a fresh, in-memory session; it must never restore prior state. */
export function createM0ExperienceSession(): M0ExperienceSession {
  return new M0ExperienceSession()
}
