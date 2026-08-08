import { describe, expect, it } from 'vitest';
import { assessGrounding, buildPrompt, extractJson, hasRealWebSearchEvidence } from './trend-detection';
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

describe('assessGrounding', () => {
  function textBlock(citations: Array<{ url: string; title: string | null; cited_text: string }>): Anthropic.ContentBlock {
    return {
      type: 'text',
      text: 'irrelevant',
      citations: citations.map((c) => ({ type: 'web_search_result_location', ...c, encrypted_index: 'x' })),
    } as unknown as Anthropic.ContentBlock;
  }
  function searchBlock(query: string): Anthropic.ContentBlock {
    return { type: 'server_tool_use', name: 'web_search', input: { query } } as unknown as Anthropic.ContentBlock;
  }

  it('passes the gate with 2+ citations including an allowed domain', () => {
    const content = [
      searchBlock('trending cross stitch fox'),
      searchBlock('r/CrossStitch fox 2026'),
      textBlock([
        { url: 'https://www.pinterest.com/board/foxes', title: 'Fox boards', cited_text: 'foxes are popular' },
        { url: 'https://www.reddit.com/r/CrossStitch/abc', title: 'Weekly thread', cited_text: 'lots of foxes' },
      ]),
    ] as Anthropic.ContentBlock[];

    const result = assessGrounding(content);
    expect(result.distinctQueries).toBe(2);
    expect(result.distinctCitedUrls).toBe(2);
    expect(result.citedDomains).toEqual(expect.arrayContaining(['www.pinterest.com', 'www.reddit.com']));
    expect(result.passesGate).toBe(true);
  });

  it('fails the gate with only one citation', () => {
    const content = [
      searchBlock('trending cross stitch fox'),
      textBlock([{ url: 'https://www.pinterest.com/board/foxes', title: 'Fox boards', cited_text: 'foxes are popular' }]),
    ] as Anthropic.ContentBlock[];

    expect(assessGrounding(content).passesGate).toBe(false);
  });

  it('fails the gate when citations exist but none are from an allowed domain', () => {
    const content = [
      searchBlock('is fox trending'),
      textBlock([
        { url: 'https://example.com/blog/foxes', title: 'Foxes', cited_text: 'x' },
        { url: 'https://another-site.com/trends', title: 'Trends', cited_text: 'y' },
      ]),
    ] as Anthropic.ContentBlock[];

    expect(assessGrounding(content).passesGate).toBe(false);
  });

  it('deduplicates repeated citations of the same URL', () => {
    const content = [
      textBlock([
        { url: 'https://www.pinterest.com/board/foxes', title: 'Fox boards', cited_text: 'a' },
        { url: 'https://www.pinterest.com/board/foxes', title: 'Fox boards', cited_text: 'b' },
      ]),
    ] as Anthropic.ContentBlock[];

    expect(assessGrounding(content).distinctCitedUrls).toBe(1);
  });

  it('returns zeros for a response with no search/citations at all', () => {
    const content = [{ type: 'text', text: 'I think foxes are trending.', citations: null }] as unknown as Anthropic.ContentBlock[];
    const result = assessGrounding(content);
    expect(result.distinctQueries).toBe(0);
    expect(result.distinctCitedUrls).toBe(0);
    expect(result.passesGate).toBe(false);
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
