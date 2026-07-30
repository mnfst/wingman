import { describe, expect, it } from 'vitest';
import { PROVIDERS, PROVIDER_BY_ID, DEFAULT_PROVIDER_ID } from './providers';
import { FORMAT_BY_ID } from './formats';
import { normalizeBaseUrl } from './services/baseUrl';

describe('the provider catalog', () => {
  it('has no duplicate ids', () => {
    expect(new Set(PROVIDERS.map((p) => p.id)).size).toBe(PROVIDERS.length);
  });

  it('names a wire format that exists', () => {
    for (const p of PROVIDERS) {
      expect(FORMAT_BY_ID[p.formatId]).toBeDefined();
    }
  });

  // A preset that carries an endpoint path would double up on the format's own
  // suffix, which is the single most common way to turn a healthy host into a
  // 404. normalizeBaseUrl strips those, so a clean preset survives untouched.
  it('carries a base URL with no endpoint path to strip', () => {
    for (const p of PROVIDERS) {
      if (p.id === DEFAULT_PROVIDER_ID) continue;
      const format = FORMAT_BY_ID[p.formatId]!;
      const normalized = normalizeBaseUrl(p.baseUrl, format.path);
      expect(normalized.valid).toBe(true);
      expect(normalized.base).toBe(p.baseUrl);
      expect(normalized.note).toBeUndefined();
    }
  });

  it('ships a concrete default model for every named provider', () => {
    for (const p of PROVIDERS) {
      expect(p.defaultModel.length).toBeGreaterThan(0);
    }
  });

  it('points every preset at its own logo', () => {
    for (const p of PROVIDERS) {
      expect(p.icon).toMatch(/^\/icons\/providers\/[a-z-]+\.svg$/);
    }
  });
});

describe('Cohere', () => {
  const cohere = PROVIDER_BY_ID['cohere']!;

  // Cohere's OpenAI-compatible surface lives under /compatibility, and the
  // format appends /v1/chat/completions to whatever the preset carries.
  it('resolves to the documented compatibility endpoint', () => {
    const format = FORMAT_BY_ID[cohere.formatId]!;
    expect(normalizeBaseUrl(cohere.baseUrl, format.path).requestUrl).toBe(
      'https://api.cohere.ai/compatibility/v1/chat/completions',
    );
  });
});

describe('Hugging Face', () => {
  const hf = PROVIDER_BY_ID['huggingface']!;

  it('resolves to the Inference Providers router endpoint', () => {
    const format = FORMAT_BY_ID[hf.formatId]!;
    expect(normalizeBaseUrl(hf.baseUrl, format.path).requestUrl).toBe(
      'https://router.huggingface.co/v1/chat/completions',
    );
  });
});
