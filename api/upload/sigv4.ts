async function hmacSha256(key, message) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? new TextEncoder().encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

async function sha256Hex(message) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(key, message) {
  const sigBuffer = await hmacSha256(key, message);
  return Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function generateR2PresignedUrl({
  accountId,
  accessKeyId,
  secretAccessKey,
  bucketName,
  objectKey,
  method = 'PUT',
  expiresIn = 1800,
}) {
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const datestamp = amzDate.substring(0, 8);
  const region = 'auto';
  const service = 's3';
  const credentialScope = `${datestamp}/${region}/${service}/aws4_request`;

  // Encode URI path
  const canonicalUri = `/${bucketName}/${encodeURIComponent(objectKey).replace(/%2F/g, '/')}`;

  // Query parameters must be sorted alphabetically
  const queryParams = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': expiresIn.toString(),
    'X-Amz-SignedHeaders': 'host',
  };

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&');

  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const canonicalRequestHash = await sha256Hex(canonicalRequest);

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    canonicalRequestHash,
  ].join('\n');

  // Derive signing key
  const kDate = await hmacSha256('AWS4' + secretAccessKey, datestamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, 'aws4_request');

  // Calculate signature
  const signature = await hmacSha256Hex(kSigning, stringToSign);

  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}
