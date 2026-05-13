import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { apiKey, system, messages } = await request.json();

	if (!apiKey) {
		throw error(400, 'APIキーが必要です');
	}

	const res = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-api-key': apiKey,
			'anthropic-version': '2023-06-01',
		},
		body: JSON.stringify({
			model: 'claude-haiku-4-5-20251001',
			max_tokens: 400,
			system,
			messages,
		}),
	});

	if (!res.ok) {
		const body = await res.text();
		throw error(res.status, body);
	}

	const data = await res.json();
	return json({ text: data?.content?.[0]?.text ?? '返答できませんでした。' });
};
