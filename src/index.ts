import {debug, getInput, info, setFailed} from '@actions/core';
import archiver from 'archiver';
import {createHash, createHmac} from 'crypto';
import {fetch} from 'undici';

const zipDirectory = async (path : string) : Promise<Buffer> => {
    const buffers : Buffer[] = [];

    const archive = archiver('zip', {zlib: {level: 9}});
    archive.directory(path, false);

    archive.on('data', data => {
        buffers.push(data);
    });

    await archive.finalize();

    return Buffer.concat(buffers);
};

if (!process.env.GITHUB_REPOSITORY) {
    throw new Error('GITHUB_REPOSITORY env variable missing');
}

if (!process.env.GITHUB_RUN_ID) {
    throw new Error('GITHUB_RUN_ID env variable missing');
}

type WebhookResult = {
    message ?: string;
    out ?: string;
};

try {
    const url = new URL(getInput('url', {required: true}));
    const secret = getInput('secret', {required: true});

    debug('Creating ZIP of current directory…');
    const zipBuffer = await zipDirectory('.');

    debug('Calculating signature…');
    const zipHash = createHash('sha256').update(zipBuffer).digest('hex');

    url.searchParams.sort();

    const canonicalRequest = [
        url.pathname,
        url.searchParams.toString(),
    ].join('\n');
    const timestamp = new Date().toISOString();
    const stringToSign = [
        'Deploy-HMAC-SHA256',
        timestamp,
        process.env.GITHUB_REPOSITORY,
        process.env.GITHUB_RUN_ID,
        createHash('sha256').update(canonicalRequest).digest('hex'),
        zipHash,
    ].join('\n');
    const signature = createHmac('sha256', secret).update(stringToSign).digest('hex');

    debug('Uploading artifact to webhook…');
    const response = await fetch(url.toString(), {
        body: zipBuffer,
        method: 'POST',
        headers: {
            'X-Webhook-Timestamp': timestamp,
            'X-Webhook-Signature': signature,
            'X-Webhook-Repository': process.env.GITHUB_REPOSITORY,
            'X-Webhook-Run-Id': process.env.GITHUB_RUN_ID,
            'Content-Type': 'application/zip',
        },
    });

    const result = await response.json() as WebhookResult;

    if (result.out) {
        info(result.out);
    }

    if (!response.ok) {
        setFailed(`Webhook returned response code ${response.status}`);

        if (result.message) {
            info(result.message);
        }
    }
} catch (error) {
    setFailed(`Action failed with error ${error instanceof Error ? error.message : 'unknown'}`);
}
