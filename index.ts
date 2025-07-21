import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());

// === CONFIGURABLE ===
const MAX_RETRIES = 5;
const RETRY_DELAY = 0.5; // segundos

// Sleep
const sleep = (time: number) => new Promise((res) => setTimeout(res, time * 1000));

// Retry helper
const fetchWithRetry = async (url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> => {
    try {
        const res = await fetch(url, options);

        if (res.status === 429) {
            const retryAfter = res.headers.get('Retry-After');
            const waitTime = retryAfter ? parseFloat(retryAfter) : RETRY_DELAY;
            await sleep(waitTime);
            if (retries > 0) return fetchWithRetry(url, options, retries - 1);
        }

        if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
        return res;

    } catch (error) {
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
                'host': `${service}.roblox.com`,
                'roblox-id': '', // strip it
                'origin': 'https://www.roblox.com',
                'referer': 'https://www.roblox.com',
            },
            body: ['GET', 'HEAD'].includes(req.method ?? '') ? undefined : JSON.stringify(req.body),
        };

        const response = await fetchWithRetry(targetUrl, fetchOptions);

        const contentType = response.headers.get('content-type') || '';
        const responseData = contentType.includes('application/json')
            ? await response.json()
            : await response.text();

        // Copiar los headers útiles
        res.setHeader('content-type', contentType);
        res.status(response.status).send(responseData);

    } catch (error: any) {
        console.error('[Proxy Error]', error);
        res.status(500).send('Proxy failed. Try again later.');
    }
});

// Start server
app.listen(3000, () => {
    console.log('Proxy server running on port 3000');
});

export default app;
