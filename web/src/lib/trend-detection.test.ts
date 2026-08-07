import { describe, expect, it } from 'vitest';
import { buildPrompt, extractJson, hasRealWebSearchEvidence } from './trend-detection';
import type Anthropic from '@anthropic-ai/sdk';

describe('extractJson', () => {
  it('parses a well-formed trend result', () => {
    const text = `Here you go:\n${JSON.stringify({
      theme: 'autumn fox',
      imagePrompt: 'A fox sitting in a pile of autumn leaves.',
      signalSource: 'r/CrossStitch weekly thread',
      reasoning: 'Multiple recent finished-object posts feature foxes in fall settings.',
    })}`;
    const result = extractJson(text);
    expect(result).toEqual({
      theme: 'autumn fox',
      imagePrompt: 'A fox sitting in a pile of autumn leaves.',
      signalSource: 'r/CrossStitch weekly thread',
      reasoning: 'Multiple recent finished-object posts feature foxes in fall settings.',
    });
  });

  it('returns null when there is no JSON object in the text', () => {
    expect(extractJson('Sorry, I could not find a clear trend this time.')).toBeNull();
  });

  it('returns null when the JSON is missing a required field', () => {
    const text = JSON.stringify({ theme: 'autumn fox', imagePrompt: 'A fox.' });
    expect(extractJson(text)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(extractJson('{ theme: "autumn fox", not valid json')).toBeNull();
  });
});

describe('hasRealWebSearchEvidence', () => {
  it('is true when a server_tool_use block is present', () => {
    const content = [
      { type: 'server_tool_use', name: 'web_search', input: { query: 'trending cross stitch 2026' } },
      { type: 'text', text: 'searching...' },
    ] as unknown as Anthropic.ContentBlock[];
    expect(hasRealWebSearchEvidence(content)).toBe(true);
  });

  it('is false when the response is text-only (no real search happened)', () => {
    const content = [{ type: 'text', text: 'I think foxes are trending.' }] as unknown as Anthropic.ContentBlock[];
    expect(hasRealWebSearchEvidence(content)).toBe(false);
  });
});

describe('buildPrompt', () => {
  it('includes every theme when under the avoid-list cap', () => {
    const prompt = buildPrompt(['Cats', 'Dogs', 'Christmas']);
    expect(prompt).toContain('Cats, Dogs, Christmas');
  });

  it('caps a very large catalog rather than listing every theme', () => {
    const themes = Array.from({ length: 300 }, (_, i) => `Theme${i}`);
    const prompt = buildPrompt(themes);
    expect(prompt).toContain('Theme0');
    expect(prompt).toContain('Theme199');
    expect(prompt).not.toContain('Theme200');
  });
});
