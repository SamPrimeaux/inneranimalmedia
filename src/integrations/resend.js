import { jsonResponse } from '../core/responses.js';

/**
 * Resend Email Integration.
 * Handles transactional emails and notifications.
 */
export async function sendEmail(env, { to, subject, html, text }) {
    const apiKey = (env.RESEND_API_KEY || '').trim();
    if (!apiKey) {
        console.error('[Resend] API key not configured');
        return { success: false, error: 'Resend API key missing' };
    }

    try {
        const from = env.EMAIL_FROM || 'Inner Animal Media <support@inneranimalmedia.com>';
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ from, to, subject, html, text })
        });

        const data = await response.json();
        return { success: response.ok, data };
    } catch (e) {
        console.error('[Resend] Failed to send email:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * API Handler for Resend actions.
 */
export async function handleResendApi(request, env) {
    const body = await request.json();
    const result = await sendEmail(env, body);
    return jsonResponse(result, result.success ? 200 : 500);
}
