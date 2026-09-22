/**
 * امضا در برابر نمونه‌های مرجع AWS.
 *
 * همهٔ اعداد زیر از صفحهٔ «Signature Calculations for the Authorization Header»
 * و «Authenticating Requests: Using Query Parameters» مستندات S3 آمده‌اند —
 * همان کلید، همان تاریخ، همان امضا. اینها را ما نساخته‌ایم؛ اگر کد ما با
 * آنها بخواند، کانونی‌سازی درست است.
 */

import { describe, expect, it } from 'vitest';

import {
  canonicalQuery,
  EMPTY_SHA256,
  presignUrl,
  sha256Hex,
  signRequest,
  uriEncode,
  type SigningCredentials,
} from './sigv4.js';

const CREDS: SigningCredentials = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
};
const DATE = new Date('2013-05-24T00:00:00Z');
const HOST = 'https://examplebucket.s3.amazonaws.com';

const signatureOf = (headers: Record<string, string>) =>
  /Signature=([0-9a-f]{64})$/.exec(headers.authorization ?? '')?.[1];

describe('امضای هدر — نمونه‌های مرجع AWS', () => {
  it('GET با Range', () => {
    const headers = signRequest({
      method: 'GET',
      url: new URL(`${HOST}/test.txt`),
      headers: { range: 'bytes=0-9' },
      payloadHash: EMPTY_SHA256,
      credentials: CREDS,
      date: DATE,
    });
    expect(signatureOf(headers)).toBe(
      'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
    expect(headers.authorization).toContain(
      'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date',
    );
  });

  it('PUT با نویسهٔ خاص در کلید ($)', () => {
    const body = 'Welcome to Amazon S3.';
    const headers = signRequest({
      method: 'PUT',
      url: new URL(`${HOST}/test$file.text`),
      headers: {
        date: 'Fri, 24 May 2013 00:00:00 GMT',
        'x-amz-storage-class': 'REDUCED_REDUNDANCY',
      },
      payloadHash: sha256Hex(body),
      credentials: CREDS,
      date: DATE,
    });
    expect(signatureOf(headers)).toBe(
      '98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd',
    );
  });

  it('GET زیرمنبع بدون مقدار (?lifecycle)', () => {
    const headers = signRequest({
      method: 'GET',
      url: new URL(`${HOST}/?lifecycle`),
      payloadHash: EMPTY_SHA256,
      credentials: CREDS,
      date: DATE,
    });
    expect(signatureOf(headers)).toBe(
      'fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543',
    );
  });

  it('GET با پرس‌وجوی نامرتب (مرتب‌سازی کانونی)', () => {
    const headers = signRequest({
      method: 'GET',
      url: new URL(`${HOST}/?max-keys=2&prefix=J`),
      payloadHash: EMPTY_SHA256,
      credentials: CREDS,
      date: DATE,
    });
    expect(signatureOf(headers)).toBe(
      '34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7',
    );
  });
});

describe('URL امضاشده — نمونهٔ مرجع AWS', () => {
  it('GET یک‌روزه', () => {
    const url = presignUrl({
      method: 'GET',
      url: new URL(`${HOST}/test.txt`),
      expiresInSeconds: 86_400,
      credentials: CREDS,
      date: DATE,
    });
    expect(new URL(url).searchParams.get('X-Amz-Signature')).toBe(
      'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    );
    // اعتبار باید `/` کدشده داشته باشد، همان شکلی که امضا شد.
    expect(url).toContain('X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request');
  });

  it('امضای content-length در هدرهای امضاشده می‌آید', () => {
    const url = new URL(
      presignUrl({
        method: 'PUT',
        url: new URL(`${HOST}/k?partNumber=1&uploadId=abc`),
        expiresInSeconds: 60,
        credentials: CREDS,
        signedHeaders: { 'content-length': '8388608' },
        date: DATE,
      }),
    );
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;host');
    expect(url.searchParams.get('partNumber')).toBe('1');
    expect(url.searchParams.get('uploadId')).toBe('abc');
  });
});

describe('کدگذاری', () => {
  it('نویسه‌هایی که encodeURIComponent جا می‌اندازد', () => {
    expect(uriEncode("a!b'c(d)e*f")).toBe('a%21b%27c%28d%29e%2Af');
    expect(uriEncode('a b~c')).toBe('a%20b~c');
  });

  it('پرس‌وجو بر اساس کلید مرتب و مقدار خالی نگه داشته می‌شود', () => {
    expect(canonicalQuery([['uploads', ''], ['a', 'x y']])).toBe('a=x%20y&uploads=');
  });
});
