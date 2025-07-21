import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());

const PORT = 3000;

// === CONFIGURABLE ===
const MAX_RETRIES = 5;
const RETRY_DELAY = 0.5; // segundos
const TIMEOUT_MS = 10000; // 10 segundos de timeout

// Sleep helper
const sleep = (time: number) => new Promise((res) => setTimeout(res, time * 1000));

// Timeout helper usando AbortController
const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs = TIMEOUT_MS): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        return response;
    } catch (err: any) {
        if (err.name === 'AbortError') {
            throw new Error('Request timed out');
        }
        throw err;
    } finally {
        clearTimeout(timeout);
    }
};

// Retry wrapper
const fetchWithRetry = async (url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> => {
    try {
        const res = await fetchWithTimeout(url, options);

        // Si Roblox responde con 429 (Too Many Requests)
        if (res.status === 429) {
            const retryAfter = res.headers.get('Retry-After');
            const waitTime = retryAfter ? parseFloat(retryAfter) : RETRY_DELAY;
            await sleep(waitTime);
            if (retries > 0) return fetchWithRetry(url, options, retries - 1);
        }

        if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
        return res;
    } catch (error: any) {
        if (retries > 0) {
            await sleep(RETRY_DELAY);
            return fetchWithRetry(url, options, retries - 1);
        }
        throw error;
    }
};

// Proxy endpoint
app.use('/:service/*', async (req: Request, res: Response) => {
    const { service } = req.params;
    const proxyPath = req.params[0];
    const query = new URLSearchParams(req.query as any).toString();
    const targetUrl = `https://${service}.roblox.com/${proxyPath}${query ? `?${query}` : ''}`;

    try {
        const fetchOptions: RequestInit = {
            method: req.method,
            headers: {
                ...req.headers,
                'user-agent': req.headers['user-agent'] || 'Mozilla/5.0 RoProxy',
                'origin': 'https://www.roblox.com',
                'referer': 'https://www.roblox.com',
                'roblox-id': '', // strip headers innecesarios
                'host': `${service}.roblox.com`,
            },
            body: ['GET', 'HEAD'].includes(req.method ?? '') ? undefined : JSON.stringify(req.body),
        };

        const response = await fetchWithRetry(targetUrl, fetchOptions);

        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
            ? await response.json()
            : await response.text();

        res.setHeader('content-type', contentType);
        res.status(response.status).send(data);
    } catch (error: any) {
        console.error('[Proxy Error]', error.message);
        res.status(500).send('Proxy failed. Try again later.');
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ Proxy server running on port ${PORT}`);
});

export default app;
