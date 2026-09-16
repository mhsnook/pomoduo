'use strict'

// Assembles one PR comment from the markdown fragments each check job wrote,
// then upserts it.

const path = require('path')
const { readText, fragmentFiles } = require('./delta.cjs')

// GitHub rejects an issue comment body over 65536 characters.
const MAX_BODY = 65000

/**
 * The hidden line that identifies this workflow's comment.
 *
 * Hidden rather than the visible heading: matching on displayed text means
 * rewording the heading orphans every comment already on an open PR, and the
 * next run posts a second one beside it.
 */
const marker = (id) => `<!-- ci-delta:${id} -->`

/**
 * Read every `<order>-<name>.md` fragment in a directory and join them. The
 * numeric filename prefix fixes the section order, so jobs finishing out of
 * order still render consistently.
 */
function assemble(dir, { id, title, header }) {
	const fragments = fragmentFiles(dir, '.md')
		.map((f) => readText(path.join(dir, f)).trim())
		.filter(Boolean)

	if (!fragments.length) {
		return [
			marker(id),
			title,
			'',
			'_No check produced a report. Check the job logs._',
		].join('\n')
	}

	const body = [marker(id), title, '', header, '', fragments.join('\n\n---\n\n')].join(
		'\n',
	)
	return body.length > MAX_BODY
		? body.slice(0, MAX_BODY) + '\n\n_… report truncated._'
		: body
}

async function upsertComment(github, context, id, body) {
	const issue_number = context.issue.number
	if (!issue_number) return { skipped: 'not a pull request' }

	const { owner, repo } = context.repo
	const comments = await github.paginate(github.rest.issues.listComments, {
		owner,
		repo,
		issue_number,
		per_page: 100,
	})

	const existing = comments.find(
		(c) => c.body.includes(marker(id)) && c.user?.type === 'Bot',
	)

	if (existing) {
		await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body })
		return { updated: existing.id }
	}
	const { data } = await github.rest.issues.createComment({
		owner,
		repo,
		issue_number,
		body,
	})
	return { created: data.id }
}

module.exports = { assemble, upsertComment }
