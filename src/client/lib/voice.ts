/**
 * Whether this device has ever picked the call up. Once it has, a yap break
 * opens its mic without asking again, which is what the rules mean by every
 * present member being on the call. Before that the browser would only refuse,
 * because the first mic prompt needs a click.
 */
import { read, write } from './storage'

const PICKED_UP_KEY = 'pickedUp'

export const hasPickedUp = () => read(PICKED_UP_KEY, false)

export const rememberPickedUp = () => write(PICKED_UP_KEY, true)
