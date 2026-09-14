import { MEMBER_COOKIE } from '../../shared/schema'
import { read, write } from './storage'

/**
 * This device's member id. The socket upgrade carries it as a cookie, so the
 * session can tell who is here. Identity is per device until Cloudflare Access
 * arrives (tree/architecture.md, "Identity").
 */
export function memberId(): string {
	let id = read<string>('member', '')
	if (!id) {
		id = crypto.randomUUID()
		write('member', id)
	}
	document.cookie = `${MEMBER_COOKIE}=${id}; path=/; SameSite=Lax; max-age=31536000`
	return id
}
