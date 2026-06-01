import dotenv from "dotenv";
import path from "path";
import { google } from "googleapis";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GA4_PROPERTY_ID } =
  process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN || !GA4_PROPERTY_ID) {
  throw new Error("Missing required Google environment variables in .env");
}

const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });

export const analyticsData = google.analyticsdata({ version: "v1beta", auth: oauth2Client });
export const adsense = google.adsense({ version: "v2", auth: oauth2Client });
export const searchConsole = google.searchconsole({ version: "v1", auth: oauth2Client });
export { GA4_PROPERTY_ID };
