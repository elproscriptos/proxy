import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());

const PORT = 3000;

// === CONFIGURABLE ===
const MAX_RETRIES = 5;
const RETRY_DELAY = 0.5; // segundos
const TIMEOUT_MS = 10000; // 10 segundos de timeout

// Pega tu cookie aquí (¡NO la compartas públicamente!)
const ROBLOSECURITY_COOKIE = '_|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this-will-allow-someone-to-log-in-as-you-and-to-steal-your-ROBUX-and-items.|_CAEaAhAB.2AAAD0A9F2B9511E683CA612D06DC01B297FEF60C499FE2A03AD5BEB2420FE177DBC9A24D4542C7D2443A37E02E51FFC719E93F36EED24B82846ABBE3CF4C746B47EA2CBABE20221D3ED6DCF10C1FABFCC5FC6F5CD18F05977A4E658D6FF1DB73B3ACE11E41CECD8DD8DD8D54C55317854A69A2E11F4617A93BCBD7E0F2C3839F7E73C77AA78AED8CDFC823E000D0054B809664636B1A26E13590D0FD6140C2605E4D147B1C3188E6D9CB897A43E571467F2463B69A13D1F5596FB88DDA9F6C420894B71C46D183BF9BC3AEDA4F293C150B6CC686DC8D8769A58E9208D8DD3E40A382EEEA44A91B1B202FB23BCEFD1049E3FA820DDA22E60EC1D2623A706E542079E0F0237BF66BB6676200AB3AA061B41B6DB4AE4A24E9FD644BF278A362EEDCBE4369C7413F752769380B7ED0DC168B4B8BC518CB04DB91C3DE609F748176352A8B25337BE23C4A425C1959D1410A83355C21240AADD7E98893371C4C05EA2DC9670E88A6625E9823B40AF850C0097012A9116D5494C05DFBF07948C309BFCDC9DB3A9B092CA04F324CE3D056FDF8B6DBD7EE6061AAC33094EB59C2461265B56CA7105545CCBD4B1E273AC46FCBDD9F0E3F68C1CB2B00013DC09706E0AD73FB2959FEA6AEBFC9C4F8FFC0E0B853FA860CBF5D030FC30DC783E92FF7BA16B05298D688DFD00DDE0506B059376E84A2EF9C18B32199F6F689257158B7366D2DD8494DD968941FA04E2C562B7F1CFCD337FC4A979C6E53FC88998C0CCBF754DC6BCB44F9460A440F9C31FEB97FBB4EB375FC3A5341986E3A9122166467AC7C494305A39E6126CCE4B9DDA3B0B2FA4822D46E5488ED32EA3A1F254CBA69851B645DE610F83F99E1E625FB02290855DD956793E6970D28ABEFC1F3C0CBD353DB9F5E5C174CA847D2F3D9FEC71E7AA628A26B5AE72E31199A5CF32FE3C1BCF88F46DECE4C60B46B985857C2E86CFD9CA0F0FD47329B16932A697574EA76677C3CE53112D10322C91483C73F29D41423143F04CD3548CF8E23E59B6D159411A0A1DEE4228831979F43DE89769F4EECF75857EEBF7FBB61F96266CF29D96130CC96D8C91481210288D697E613C16C03D7203E2F1A3109A2BC03EF728355ABAAB710A50A52D0ABEE5DED57F76208D8478EA8CADC56B5B38D6E15E5D964FF481F7C8D30817F9D7579AD3FB26EC6E58605C12276B7243BC84070338230F51AD40805D6076EFD6851C8F5F69F206174C17F1895C8D8339B282A1E9A61781F8DFD15F704C5467445F8F';

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

// Filtrar headers para evitar problemas
const filterHeaders = (headers: any) => {
    const forbiddenHeaders = [
        'host',
        'connection',
        'content-length',
        'accept-encoding',
        'cookie', // vamos a controlar cookie manualmente
        'roblox-id',
    ];
    const result: Record<string, string> = {};
    Object.entries(headers).forEach(([key, value]) => {
        if (!forbiddenHeaders.includes(key.toLowerCase()) && value !== undefined) {
            if (typeof value === 'string') {
                result[key] = value;
            } else if (Array.isArray(value)) {
                result[key] = value.join(',');
            }
        }
    });
    return result;
};

// Proxy endpoint
app.use('/:service/*', async (req: Request, res: Response) => {
    const { service } = req.params;
    const proxyPath = req.params[0];
    const query = new URLSearchParams(req.query as any).toString();
    const targetUrl = `https://${service}.roblox.com/${proxyPath}${query ? `?${query}` : ''}`;

    try {
        const filteredHeaders = filterHeaders(req.headers);

        const fetchOptions: RequestInit = {
            method: req.method,
            headers: {
                ...filteredHeaders,
                'user-agent': filteredHeaders['user-agent'] || 'Mozilla/5.0 RoProxy',
                'origin': 'https://www.roblox.com',
                'referer': 'https://www.roblox.com',
                cookie: `.ROBLOSECURITY=${ROBLOSECURITY_COOKIE}`,
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
