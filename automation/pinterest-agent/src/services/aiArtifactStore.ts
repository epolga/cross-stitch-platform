// S3 wrapper for AI markdown bodies referenced by AI_ANALYSIS rows.
// Schema reference: plan/integration/business-history-schema.md §4.3, §10.

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const REGION = process.env.AWS_REGION || "us-east-1";
const BUCKET = process.env.AI_ARTIFACT_BUCKET || "cross-stitch-ai-reports";

const s3 = new S3Client({ region: REGION });

export type AnalysisType = "trend" | "design";

/**
 * Build the S3 key for an AI analysis markdown body.
 *
 *   analysis/{forDate}/{generatedAt-with-hyphens}-{analysisType}.md
 *
 * Colons in the ISO timestamp are replaced with hyphens — S3 keys with `:` are
 * valid but awkward in URLs, shell paths, and console UI.
 */
export function buildArtifactKey(
  forDate: string,
  generatedAt: string,
  analysisType: AnalysisType
): string {
  const tsSafe = generatedAt.replace(/:/g, "-");
  return `analysis/${forDate}/${tsSafe}-${analysisType}.md`;
}

export async function putMarkdown(
  forDate: string,
  generatedAt: string,
  analysisType: AnalysisType,
  body: string
): Promise<string> {
  const key = buildArtifactKey(forDate, generatedAt, analysisType);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: "text/markdown; charset=utf-8",
    })
  );
  return key;
}

export async function getMarkdown(key: string): Promise<string> {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  if (!res.Body) throw new Error(`Empty body for S3 key: ${key}`);
  return await res.Body.transformToString();
}
