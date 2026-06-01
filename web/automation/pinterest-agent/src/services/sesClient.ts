// Thin SES v2 wrapper for the pinterest-agent. Sender, recipient, and
// configuration set come from .env (SES_SENDER, SES_RECIPIENT,
// SES_CONFIGURATION_SET) so non-secret addresses live in config, not code.
//
// The verified sender identity (ann@cross-stitch.com / cross-stitch.com) is
// shared with the Uploader app — no separate SES verification needed.
// IAM permission: CrossStitch-SES-Send (attached to CrossStitch-Agents).

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const REGION = process.env.AWS_REGION || "us-east-1";

const ses = new SESv2Client({ region: REGION });

export interface SendEmailInput {
  subject: string;
  textBody: string;
  htmlBody?: string;
  sender?: string;       // defaults to process.env.SES_SENDER
  recipient?: string;    // defaults to process.env.SES_RECIPIENT
  configurationSet?: string; // defaults to process.env.SES_CONFIGURATION_SET
}

export interface SendEmailResult {
  messageId: string;
}

function requireEnv(name: string, override?: string): string {
  const v = override ?? process.env[name];
  if (!v || !v.trim()) throw new Error(`SES config missing: set ${name} in .env`);
  return v;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const sender = requireEnv("SES_SENDER", input.sender);
  const recipient = requireEnv("SES_RECIPIENT", input.recipient);
  const configurationSet = input.configurationSet ?? process.env.SES_CONFIGURATION_SET;

  const body: { Text: { Data: string; Charset: string }; Html?: { Data: string; Charset: string } } = {
    Text: { Data: input.textBody, Charset: "UTF-8" },
  };
  if (input.htmlBody) {
    body.Html = { Data: input.htmlBody, Charset: "UTF-8" };
  }

  const res = await ses.send(
    new SendEmailCommand({
      FromEmailAddress: sender,
      Destination: { ToAddresses: [recipient] },
      ConfigurationSetName: configurationSet,
      Content: {
        Simple: {
          Subject: { Data: input.subject, Charset: "UTF-8" },
          Body: body,
        },
      },
    })
  );

  if (!res.MessageId) throw new Error("SES SendEmail returned no MessageId");
  return { messageId: res.MessageId };
}
