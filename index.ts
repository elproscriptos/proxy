import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());

const sleep = (time: number) => new Promise((res) => setTimeout(res, time * 1000));

const fetchWithRetry = async (url: string, options: RequestInit, retries = 3): Promise<Response> => {
    try {
        const res = await fetch(url, options);
        if (!res.ok) throw new Error('Request failed');
        return res;
    } catch (error) {
        if (retries > 0) {
            await sleep(0.2);
            return fetchWithRetry(url, options, retries - 1);
        }
        throw error;
    }
};

// Proxy request to Roblox with dynamic URL and parameters
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
                'User-Agent': 'RoProxy',
                'Roblox-Id': '', // remove or blank out if needed
                host: `${service}.roblox.com`,
            },
            body: ['GET', 'HEAD'].includes(req.method ?? '') ? undefined : JSON.stringify(req.body),
        };

        const response = await fetchWithRetry(targetUrl, fetchOptions);

        const contentType = response.headers.get('content-type') || '';
        const responseData = contentType.includes('application/json')
            ? await response.json()
            : await response.text();

        res.status(response.status).send(responseData);
    } catch (error: any) {
        res.status(500).send('Proxy failed to connect. Please try again.');
    }
});

app.listen(3000, () => {
    console.log('Proxy server is running on port 3000');
});

export default app;
