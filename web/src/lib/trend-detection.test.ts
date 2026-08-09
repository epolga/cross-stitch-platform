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
      targetWidth: 100,
      targetHeight: 100,
      colorPalette: 'warm autumn palette: burnt orange, cream, deep brown',
    })}`;
    const result = extractJson(text);
    expect(result).toEqual({
      theme: 'autumn fox',
      imagePrompt: 'A fox sitting in a pile of autumn leaves.',
      signalSource: 'r/CrossStitch weekly thread',
      reasoning: 'Multiple recent finished-object posts feature foxes in fall settings.',
      targetWidth: 100,
      targetHeight: 100,
      colorPalette: 'warm autumn palette: burnt orange, cream, deep brown',
    });
  });

  // 2026-08-09: real live failure — the model returned targetWidth/
  // targetHeight as quoted numeric strings ("70") instead of numbers,
  // despite buildPrompt() asking for numbers. A strict typeof check
  // rejected an otherwise well-formed, well-grounded response over this.
  it('coerces numeric-string targetWidth/targetHeight instead of rejecting them', () => {
    const text = JSON.stringify({
      theme: 'capybara portrait',
      imagePrompt: 'A capybara.',
      signalSource: 'Pinterest capybara cross-stitch board',
      reasoning: 'Sustained niche demand.',
      targetWidth: '70',
      targetHeight: '70',
      colorPalette: 'warm rodent-brown palette',
    });
    const result = extractJson(text);
    expect(result?.targetWidth).toBe(70);
    expect(result?.targetHeight).toBe(70);
    expect(typeof result?.targetWidth).toBe('number');
  });

  it('returns null when targetWidth is a non-numeric string', () => {
    const text = JSON.stringify({
      theme: 'autumn fox',
      imagePrompt: 'A fox.',
      signalSource: 'r/CrossStitch',
      reasoning: 'Popular.',
      targetWidth: 'large',
      targetHeight: 100,
      colorPalette: 'warm autumn palette',
    });
    expect(extractJson(text)).toBeNull();
  });

  it('returns null when a new size/color field is missing', () => {
    const text = JSON.stringify({
      theme: 'autumn fox',
      imagePrompt: 'A fox.',
      signalSource: 'r/CrossStitch',
      reasoning: 'Popular.',
      targetWidth: 100,
      // targetHeight and colorPalette omitted
    });
    expect(extractJson(text)).toBeNull();
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
  // 2026-08-09: buildPrompt() used to take the full list of existing
  // catalog captions and dump it into the prompt as a text avoid-list —
  // replaced with an instruction to use the search_catalog tool instead
  // (see trend-detection.ts's SEARCH_CATALOG_TOOL comment for why: exact-
  // string matching against a static list can't catch a near-duplicate
  // like "kawaii green frog" vs "Kawaii Cottagecore Frog"). No more
  // themes argument, so nothing left to test for inclusion/truncation —
  // just confirm the model is actually told about the tool.
  it('instructs the model to use search_catalog before finalizing a theme', () => {
    const prompt = buildPrompt();
    expect(prompt).toContain('search_catalog');
  });
});
