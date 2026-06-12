import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const SEARCH_QUERIES_TABLE = process.env.DDB_SEARCH_QUERIES_TABLE || 'SearchQueries';

function logSearchQuery(rawQuery: string, filters: Record<string, unknown>): void {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const ts = `${now.toISOString()}#${Math.random().toString(36).slice(2, 9)}`;
  ddb.send(new PutItemCommand({
    TableName: SEARCH_QUERIES_TABLE,
    Item: {
      date: { S: date },
      ts: { S: ts },
      rawQuery: { S: rawQuery },
      resolvedFilters: { S: JSON.stringify(filters) },
    },
  })).catch((err) => console.error('Search query log failed:', err));
}

const SYSTEM_PROMPT = `You extract cross-stitch pattern search filters from natural language queries.
Return ONLY valid JSON with exactly these fields:
{
  "searchText": string,
  "widthFrom": number,
  "widthTo": number,
  "heightFrom": number,
  "heightTo": number,
  "ncolorsFrom": number,
  "ncolorsTo": number
}

Rules for searchText:
- The library uses specific design names (e.g. "Rose", "Sunflower", "Cat", "Horse", "Owl", "Christmas Tree").
- For specific subjects, use them directly: "cat" → searchText="cat"
- For THEMATIC/GENRE terms, expand them into a comma-separated list of specific subjects that would appear in design titles. The search treats comma-separated terms as OR. Examples:
  - "floral" / "flowers" → "rose, sunflower, lily, iris, tulip, daisy, flower, peony, poppy"
  - "animals" → "cat, dog, horse, owl, bird, rabbit, deer, fox, bear, butterfly"
  - "landscape" / "nature" / "scenery" → "mountain, forest, lake, river, tree, cottage, house, village"
  - "Christmas" / "holiday" → "Christmas, Santa, snowflake, reindeer, star, angel"
  - "birds" → "bird, owl, parrot, swan, eagle, peacock, robin, heron"
  - Leave searchText empty only if the user mentions NO subjects at all (pure size/color query)
- width/height: stitch dimensions. Use 0 for unspecified min, 10000 for unspecified max
- ncolors: thread color count. Use 0 for unspecified min, 10000 for unspecified max
- Size guide: small/tiny/beginner ≤ 60 stitches wide and tall; medium 60–120; large > 120
- Complexity: simple/easy/few colors ≤ 5 colors; normal 6–12; detailed/colorful > 12
- "beginner" implies small (≤ 60) AND few colors (≤ 6)`;

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();
    if (!query?.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: String(query).slice(0, 500) }],
    });

    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 });
    }

    const jsonMatch = text.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not parse AI response' }, { status: 500 });
    }

    const filters = JSON.parse(jsonMatch[0]);
    logSearchQuery(String(query).slice(0, 500), filters);
    return NextResponse.json(filters);
  } catch (err) {
    console.error('AI search error:', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
