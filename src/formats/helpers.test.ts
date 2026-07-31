import { describe, expect, it } from 'vitest';
import { asArray, asNumber, asRecord, asString, parseData } from './helpers';

// Every format parses provider JSON it has no schema for, so these guards are
// the only thing between a malformed payload and a render-time TypeError.

describe('asRecord', () => {
  it('passes an object through', () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
  });

  it.each([null, undefined, 'text', 42, true])('rejects the non-object %p', (value) => {
    expect(asRecord(value)).toBeNull();
  });
});

describe('asString', () => {
  it('passes a string through, including the empty one', () => {
    expect(asString('hi')).toBe('hi');
    expect(asString('')).toBe('');
  });

  it.each([null, undefined, 0, {}, []])('rejects the non-string %p', (value) => {
    expect(asString(value)).toBeNull();
  });
});

describe('asNumber', () => {
  it('passes a number through, including zero', () => {
    expect(asNumber(7)).toBe(7);
    expect(asNumber(0)).toBe(0);
  });

  // Undefined rather than null: a usage field that is absent and one that is
  // zero have to stay distinguishable in the token chips.
  it.each([null, undefined, '7', {}])('rejects the non-number %p', (value) => {
    expect(asNumber(value)).toBeUndefined();
  });
});

describe('asArray', () => {
  it('passes an array through', () => {
    expect(asArray([1, 2])).toEqual([1, 2]);
  });

  it.each([null, undefined, {}, 'no'])('rejects the non-array %p', (value) => {
    expect(asArray(value)).toBeNull();
  });
});

describe('parseData', () => {
  it('parses an SSE data payload', () => {
    expect(parseData('{"a":1}')).toEqual({ a: 1 });
  });

  it('tolerates the whitespace an SSE line carries', () => {
    expect(parseData('  {"a":1}  ')).toEqual({ a: 1 });
  });

  it('treats the OpenAI end-of-stream sentinel as no payload', () => {
    expect(parseData('[DONE]')).toBeNull();
  });

  it('returns null for an empty payload', () => {
    expect(parseData('   ')).toBeNull();
  });

  // A half-delivered chunk is normal on a stream; it must not throw.
  it('returns null for malformed JSON', () => {
    expect(parseData('{"a":')).toBeNull();
  });

  it('returns null when the payload parses to a non-object', () => {
    expect(parseData('"just a string"')).toBeNull();
  });
});
