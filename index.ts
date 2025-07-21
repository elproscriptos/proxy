import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());

const PORT = 3000;

// === CONFIGURABLE ===
const MAX_RETRIES = 5;
const RETRY_DELAY = 0.5; // segundos
const TIMEOUT_MS = 10000; // 10 segundos de timeout

// Pega tu cookie aquí (¡NO la compartas públicamente!)
const ROBLOSECURITY_COOKIE = '_|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this-will-allow-someone-to-log-in-as-you-and-to-steal-your-ROBUX-and-items.|_CAEaAhAB.83477AC3C6245C45FA0812C9272AD59D5626BB9BB9B7B51BE6572A36C3551D07DD90D2A032C6F4A314A3A844950C1F4F26723FDAB620A3DC29D300C49556F5C2063554FDF7D3F7E32FE8F818EE11B19563972A2428223471E800810AEDB577513E94FAC4EF587BAA855C00B70B03CE73D489AC80DEBD201752CF28D2DD9E7B7A74D77C732EC7F47BA3F92FEF20E7CACC9CC59AAA5313F038AA3DD0DAE855D00DF84E95A469F6E30ADAB6A81B9B4E7E32695175BE8B4CF4166A891BD24F99FB0B9E020653AA822DD20075756C441689E45A5F06DCF7D32BF4954410CA5BBEEB1EA2BE43D537BC882B08CA9CCE3FA50D7762B694F190C7BADF23D9BAA424CA695285ABDF3EB0D23B9649635C0C498CF72AA317F1C3E4A5204831AC11B81BE1A0CD8BDB554C82CC3C693F87168F9DD626D082A126FF2435CB42FCD9EA4AFA8B551F013235902A29F61AAEC665D96FED0127CBA0B4F52C06376B8CBE6EFCF28141C7E11D585466BC4827F474CF0D6E4EE6111418DB2D8D4EAC7ADC71957F2862ACE29BB6F6ECABE2F243CEDD65F030668784E07CB570576680A3C3A54A08F4C1EDF4FA5CBFAEE11262022F1FFE2C7ED0AF25C3D2DF06B78B015E145E3F530C9FB29835EF702FC957358B51DFD0212B5B402525A2E5CC05A197F14F4B0168A044F6529ACBE9AE46163DC6EFDA2D0298689722E984935D92D51CCB500030D7419997FD45938E1017766FAE85BDCF9FC5043E16C739B551A970F2792DB086C1B579B916DDA98AFAD981CDB66C23024DB51E609CF78D62E485D225F497DC356E8365068EAF8C900215A82415EE5800EE3CEF0D88AC59B5C62C211D6329B979E249B6BD9B3CB1E942FE7FF06085DD4712A62D0851ED8062207CB611C141224F963579952DA42B052AA1028CE2B016BAF6EDE6F52359A44E5B211912562FAF383590B3822F48290BFAD7F9B3C56BF9FBF88038BF709043A42D7889A48B82AA38FA354CCF20F6B54C61E43D12E94DA716FA5F4B098279B6680E6388B62B41A18A7191ECC869F2EFC1EC0C3EB79AB0E5F33CF75BF654057E2A4A4D50C2C5275575AE5330D1781D3281B1D79D970983AA573592A480D1640F99BDAEC6FD6F67E3E2516BE4C375D7C13A992B29F14AE889B997AFA13DBEE3C1682744C0F79C165AA9C9A55D08499DD5C4148A93C5B5969F05AABF36A099CB2574BA';

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
