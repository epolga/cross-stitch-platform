// DataAccess.ts
import {
  AttributeValue,
  DynamoDBClient,
  QueryCommand,
  ScanCommand,
  ScanCommandInput,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import type { Design, DesignsResponse } from '@/app/types/design';
import type { Album, AlbumsResponse } from '@/app/types/album';
import { albumSubject } from '@/data/album-taxonomy';
import { saveUserToDynamoDB } from '@/lib/users';
import { devLog } from '@/lib/devLog';

// Force SSR to avoid static generation issues
export const dynamic = 'force-dynamic';

const dynamoDBClient = new DynamoDBClient({
  region: process.env.AWS_REGION,
});

export type VerifiedUserProfile = {
  userId: string; // stable cid UUID
  email: string;
  firstName?: string;
};

function normalizeDisplayName(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readOptionalAttributeString(value?: AttributeValue): string | null {
  if (!value) return null;
  if ('S' in value && typeof value.S === 'string') {
    const normalized = value.S.trim();
    return normalized.length > 0 ? normalized : null;
  }
  if ('N' in value && typeof value.N === 'string') {
    const normalized = value.N.trim();
    return normalized.length > 0 ? normalized : null;
  }
  return null;
}

/**
 * Helper: check whether a user with given Email and Password exists
 * in the secondary users table (DDB_USERS_TABLE).
 */
async function verifyUserInSecondaryTable(
  email: string,
  password: string,
): Promise<VerifiedUserProfile | null> {
  const tableName = process.env.DDB_USERS_TABLE;
  if (!tableName) {
    console.warn('DDB_USERS_TABLE is not set. Skipping secondary table check.');
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    devLog('Checking secondary users table:', tableName, { email });

    // 1) Filter only by password (cheap, selective)
    const scanParams: ScanCommandInput = {
      TableName: tableName,
      FilterExpression: '#password = :pwd',
      ExpressionAttributeNames: { '#password': 'Password' },
      ExpressionAttributeValues: { ':pwd': { S: password } },
    };

    const { Items } = await dynamoDBClient.send(new ScanCommand(scanParams));
    if (!Items || Items.length === 0) {
      return null;
    }

    // 2) Email MUST be matched case-insensitively here in code
    for (const item of Items) {
      const dbEmail = item.Email?.S?.trim().toLowerCase();
      if (dbEmail === normalizedEmail) {
        if (item.BotSuspect?.BOOL) {
          devLog('User found in secondary table but flagged BotSuspect — login blocked');
          return null;
        }
        devLog('User found in secondary table (case-insensitive match)');
        return {
          userId: item.cid?.S ?? item.ID?.S ?? normalizedEmail,
          email: normalizedEmail,
          firstName: normalizeDisplayName(item.FirstName?.S || item.UserName?.S),
        };
      }
    }

    return null;
  } catch (err) {
    console.error('Error checking secondary table:', err);
    return null;
  }
}

function computeOrientation(w: number, h: number): 'portrait' | 'landscape' | 'square' {
  if (h === 0) return 'square';
  const ratio = w / h;
  if (ratio > 1.1) return 'landscape';
  if (ratio < 0.9) return 'portrait';
  return 'square';
}

function computeSizeCategory(w: number, h: number): 'small' | 'medium' | 'large' {
  const maxDim = Math.max(w, h);
  if (maxDim <= 50) return 'small';
  if (maxDim <= 100) return 'medium';
  return 'large';
}

function computeColorBucket(n: number): 'few' | 'medium' | 'many' {
  if (n <= 5) return 'few';
  if (n <= 15) return 'medium';
  return 'many';
}

// In-memory caches for designs and albums
const designCache: Map<number, Design> = new Map();
const designKeyCache: Map<number, { id: string; nPage: string }> = new Map();
const albumCache: Map<number, Album> = new Map();
const albumCaptionCache: Map<number, string> = new Map();
let cacheInitialized: boolean = false;
let cacheInitializationPromise: Promise<void> | null = null;

// Initialize the cache by fetching all designs and albums from DynamoDB
async function initializeCache(): Promise<void> {
  if (cacheInitialized) {
    devLog('Cache already initialized');
    return;
  }

  if (cacheInitializationPromise) {
    devLog('Cache initialization already in progress');
    return cacheInitializationPromise;
  }

  cacheInitializationPromise = (async () => {
    try {
      devLog('Starting cache initialization');

      // Scan for designs
      const designScanParams: ScanCommandInput = {
        TableName: process.env.DYNAMODB_TABLE_NAME,
        FilterExpression: "EntityType = :entityType",
        ExpressionAttributeValues: {
          ":entityType": { S: "DESIGN" },
        },
      };

      let designLastEvaluatedKey: Record<string, AttributeValue> | undefined;
      let totalDesigns = 0;

      do {
        if (designLastEvaluatedKey) {
          designScanParams.ExclusiveStartKey = designLastEvaluatedKey;
        }

        const { Items, LastEvaluatedKey } = await dynamoDBClient.send(new ScanCommand(designScanParams));
        designLastEvaluatedKey = LastEvaluatedKey;

        if (Items && Items.length > 0) {
          Items.forEach((item) => {
            const design: Design = {
              DesignID: item.DesignID?.N ? parseInt(item.DesignID.N) : 0,
              AlbumID: item.AlbumID?.N ? parseInt(item.AlbumID.N) : 0,
              Caption: item.Caption?.S || "",
              Description: item.Description?.S || "",
              NDownloaded: item.NDownloaded?.N ? parseInt(item.NDownloaded.N) : 0,
              NColors: item.NColors?.N ? parseInt(item.NColors.N) : 0,
              Width: item.Width?.N ? parseInt(item.Width.N) : 0,
              Height: item.Height?.N ? parseInt(item.Height.N) : 0,
              Notes: item.Notes?.S || "",
              Text: item.Text?.S || "",
              NPage: item.NPage?.S ? parseInt(item.NPage.S) : 0,
              ImageUrl: item.ImageUrl?.S || (item.AlbumID?.N && item.DesignID?.N
                ? `https://d2o1uvvg91z7o4.cloudfront.net/photos/${item.AlbumID.N}/${item.DesignID.N}/4.jpg`
                : null),
              PdfUrl: getPDFUrl(item.AlbumID, item.DesignID),
              PinterestPinId:
                readOptionalAttributeString(item.PinterestPinId) ||
                readOptionalAttributeString(item.PinterestPinID) ||
                readOptionalAttributeString(item.PinterestID) ||
                readOptionalAttributeString(item.PinterestId) ||
                readOptionalAttributeString(item.PinID) ||
                readOptionalAttributeString(item.PinId) ||
                null,
              PinterestPinUrl:
                readOptionalAttributeString(item.PinterestPinUrl) ||
                readOptionalAttributeString(item.PinterestPinURL) ||
                readOptionalAttributeString(item.PinterestUrl) ||
                readOptionalAttributeString(item.PinUrl) ||
                readOptionalAttributeString(item.PinURL) ||
                null,
              NGlobalPage: item.NGlobalPage?.N ? parseInt(item.NGlobalPage.N) : 0,
              SeoDescription: item.SeoDescription?.S || undefined,
              SeoTitle: item.SeoTitle?.S || undefined,
              CanonicalDesignId: item.CanonicalDesignId?.N ? parseInt(item.CanonicalDesignId.N) : undefined,
              SeoSubjectBlurb: item.SeoSubjectBlurb?.S || undefined,
              LastModifiedAt: item.LastModifiedAt?.S || undefined,
              EditorPatternKey: item.EditorPatternKey?.S || undefined,
            };
            const w = design.Width;
            const h = design.Height;
            const n = design.NColors;
            design.subject = albumSubject[design.AlbumID];
            design.orientation = computeOrientation(w, h);
            design.sizeCategory = computeSizeCategory(w, h);
            design.colorBucket = computeColorBucket(n);
            design.isBeginnerFriendly = n <= 5 && w <= 60 && h <= 60;
            if (design.DesignID > 0) {
              designCache.set(design.DesignID, design);
              const rawId = item.ID?.S;
              const rawNPage = item.NPage?.S;
              if (rawId && rawNPage) {
                designKeyCache.set(design.DesignID, { id: rawId, nPage: rawNPage });
              }
            }
          });
          totalDesigns += Items.length;
        }

      } while (designLastEvaluatedKey);

      // Scan for albums
      const albumScanParams: ScanCommandInput = {
        TableName: process.env.DYNAMODB_TABLE_NAME,
        FilterExpression: "EntityType = :entityType",
        ExpressionAttributeValues: {
          ":entityType": { S: "ALBUM" },
        },
      };

      let albumLastEvaluatedKey: Record<string, AttributeValue> | undefined;
      let totalAlbums = 0;

      do {
        if (albumLastEvaluatedKey) {
          albumScanParams.ExclusiveStartKey = albumLastEvaluatedKey;
        }

        const { Items, LastEvaluatedKey } = await dynamoDBClient.send(new ScanCommand(albumScanParams));
        albumLastEvaluatedKey = LastEvaluatedKey;

        if (Items && Items.length > 0) {
          Items.forEach((item) => {
            const albumId = item.AlbumID?.N ? parseInt(item.AlbumID.N) : 0;
            const caption = item.Caption?.S || "";
            if (albumId > 0 && caption) {
              const album: Album = {
                AlbumID: albumId,
                Caption: caption,
                SeoDescription: item.SeoDescription?.S || undefined,
                LastModifiedAt: item.LastModifiedAt?.S || undefined,
              };
              albumCache.set(albumId, album);
              albumCaptionCache.set(albumId, caption); // Update caption cache
            }
          });
          totalAlbums += Items.length;
        }

      } while (albumLastEvaluatedKey);

      cacheInitialized = true;
      devLog(`Cache initialized with ${totalDesigns} designs and ${totalAlbums} albums`);
    } catch (error) {
      console.error('Error initializing cache:', error);
      cacheInitialized = false;
      throw error;
    } finally {
      cacheInitializationPromise = null;
    }
  })();

  return cacheInitializationPromise;
}

// Wrapper to initialize cache on first access
async function ensureCacheReady(): Promise<void> {
  if (!cacheInitialized && !cacheInitializationPromise) {
    devLog('First access, initializing cache');
    await initializeCache();
  } else if (cacheInitializationPromise) {
    devLog('Waiting for cache initialization');
    await cacheInitializationPromise;
  }
}

async function withCache<T>(fn: () => Promise<T>): Promise<T> {
  await ensureCacheReady();
  return fn();
}

// Fetch album caption with caching
export async function getAlbumCaption(albumId: number): Promise<string | undefined> {
  // Check album cache first
  const album = albumCache.get(albumId);
  if (album) {
    return album.Caption;
  }

  // Fallback to caption cache
  if (albumCaptionCache.has(albumId)) {
    return albumCaptionCache.get(albumId);
  }

  try {
    const paddedAlbumId = albumId.toString().padStart(4, "0");
    const partitionKey = `ALB#${paddedAlbumId}`;

    const queryParams = {
      TableName: process.env.DYNAMODB_TABLE_NAME,
      KeyConditionExpression: "ID = :id AND NPage = :nPage",
      ExpressionAttributeValues: {
        ":id": { S: partitionKey },
        ":nPage": { S: "00000" },
      },
      Limit: 1,
      ScanIndexForward: false,
    };

    const { Items } = await dynamoDBClient.send(new QueryCommand(queryParams));

    if (!Items || Items.length === 0) {
      console.warn(`No album found for AlbumID ${albumId}`);
      albumCaptionCache.set(albumId, "");
      return undefined;
    }

    const caption = Items[0].Caption?.S || "";
    albumCaptionCache.set(albumId, caption);
    return caption;
  } catch (error) {
    console.error(`Error fetching album caption for AlbumID ${albumId}:`, error);
    albumCaptionCache.set(albumId, "");
    return undefined;
  }
}

export async function getAllAlbumCaptions(): Promise<{ albumId: number; Caption: string }[] | undefined> {
  return withCache(async () => {
    try {
      const albums = Array.from(albumCache.values())
        .map(album => ({
          albumId: album.AlbumID,
          Caption: album.Caption,
        }))
        .sort((a, b) => a.Caption.localeCompare(b.Caption, undefined, { sensitivity: 'base' }));

      if (albums.length === 0) {
        console.warn(`No albums found in cache`);
        return [];
      }

      devLog(`Fetched ${albums.length} albums from cache`);
      return albums;
    } catch (error) {
      console.error(`Error fetching all album captions:`, error);
      return undefined;
    }
  });
}

export async function getAllAlbums(pageSize: number, nPage: number): Promise<AlbumsResponse> {
  return withCache(async () => {
    try {
      const allAlbums = Array.from(albumCache.values());
      const totalItems = allAlbums.length;

      const responseData: AlbumsResponse = {
        albums: [],
        entryCount: totalItems,
        page: nPage,
        pageSize,
        totalPages: Math.ceil(totalItems / pageSize) || 1,
      };

      if (totalItems === 0) {
        console.warn("No albums found in cache");
        return responseData;
      }

      // Sort by AlbumID
      allAlbums.sort((a, b) => a.AlbumID - b.AlbumID);

      // Paginate
      const startIndex = (nPage - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      responseData.albums = allAlbums.slice(startIndex, endIndex);

      if (responseData.albums.length === 0) {
        console.warn(`No albums found for page ${nPage}`);
      }

      return responseData;
    } catch (error) {
      console.error("Error fetching albums:", error);
      throw error;
    }
  });
}

function getPDFUrl(albumId: AttributeValue, designId: AttributeValue): string | null {
  return (albumId?.N && designId?.N)
    ? `https://d2o1uvvg91z7o4.cloudfront.net/pdfs/${albumId.N}/Stitch${designId.N}_Kit.pdf`
    : null;
}

export async function getDesignById(designId: number): Promise<Design | undefined> {
  return withCache(async () => {
    try {
      const design = designCache.get(designId);
      if (!design) {
        console.warn(`No design found for DesignID ${designId} in cache`);
        return undefined;
      }
      return design;
    } catch (error) {
      console.error(`Error fetching design for DesignID ${designId}:`, error);
      return undefined;
    }
  });
}

export async function getDesignPhotoUrlById(designId: number): Promise<string | undefined | null> {
  return withCache(async () => {
    try {
      const design = designCache.get(designId);
      if (!design) {
        console.warn(`No design found for DesignID ${designId} in cache`);
        return null;
      }
      return design.ImageUrl;
    } catch (error) {
      console.error(`Error fetching design for DesignID ${designId}:`, error);
      return null;
    }
  });
}

export async function getDesigns(pageSize: number, nPage: number): Promise<DesignsResponse> {
  return withCache(async () => {
    try {
      const allDesigns = Array.from(designCache.values());
      const totalItems = allDesigns.length;

      const responseData: DesignsResponse = {
        designs: [],
        entryCount: totalItems,
        page: nPage,
        pageSize,
        totalPages: Math.ceil(totalItems / pageSize) || 1,
      };

      if (totalItems === 0) {
        console.warn("No designs found in cache");
        return responseData;
      }

      allDesigns.sort((a, b) => (b.NGlobalPage || 0) - (a.NGlobalPage || 0));

      const startIndex = (nPage - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      responseData.designs = allDesigns.slice(startIndex, endIndex);

      if (responseData.designs.length === 0) {
        console.warn(`No designs found for page ${nPage}`);
      }

      return responseData;
    } catch (error) {
      console.error("Error fetching designs:", error);
      throw error;
    }
  });
}

export async function getDesignsByAlbumId(albumId: string, pageSize: number, nPage: number): Promise<DesignsResponse> {
  return withCache(async () => {
    try {
      const albumCaption = await getAlbumCaption(parseInt(albumId)) || "Unknown Album";
      const albumSeoDescription = albumCache.get(parseInt(albumId))?.SeoDescription;

      const allDesigns = Array.from(designCache.values()).filter(
        (design) => design.AlbumID === parseInt(albumId)
      );
      const totalItems = allDesigns.length;

      const responseData: DesignsResponse = {
        designs: [],
        entryCount: totalItems,
        page: nPage,
        pageSize,
        totalPages: Math.ceil(totalItems / pageSize) || 1,
        albumCaption,
        albumSeoDescription,
      };

      if (totalItems === 0) {
        console.warn(`No designs found for AlbumID ${albumId}`);
        return responseData;
      }

      allDesigns.sort((a, b) => (b.NPage || 0) - (a.NPage || 0));

      const startIndex = (nPage - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      responseData.designs = allDesigns.slice(startIndex, endIndex);

      if (responseData.designs.length === 0) {
        console.warn(`No designs found for AlbumID ${albumId} on page ${nPage}`);
      }

      return responseData;
    } catch (error) {
      console.error(`Error fetching designs for AlbumID ${albumId}:`, error);
      throw error;
    }
  });
}

export interface FilterOptions {
  widthFrom: number;
  widthTo: number;
  heightFrom: number;
  heightTo: number;
  ncolorsFrom: number;
  ncolorsTo: number;
  nPage: number;
  pageSize: number;
  searchText?: string;
  subject?: string;
  sizeCategory?: 'small' | 'medium' | 'large';
  orientation?: 'portrait' | 'landscape' | 'square';
  isBeginnerFriendly?: boolean;
  semanticIds?: number[];
}

export async function fetchFilteredDesigns(filters: FilterOptions): Promise<DesignsResponse> {
  return withCache(async () => {
    try {
      const { nPage, pageSize, searchText } = filters;
      let allDesigns = Array.from(designCache.values());

      // Apply filters
      if (filters.widthFrom !== undefined && filters.widthTo !== undefined) {
        allDesigns = allDesigns.filter(
          (design) => design.Width >= filters.widthFrom && design.Width <= filters.widthTo
        );
      }
      if (filters.heightFrom !== undefined && filters.heightTo !== undefined) {
        allDesigns = allDesigns.filter(
          (design) => design.Height >= filters.heightFrom && design.Height <= filters.heightTo
        );
      }
      if (filters.ncolorsFrom !== undefined && filters.ncolorsTo !== undefined) {
        allDesigns = allDesigns.filter(
          (design) => design.NColors >= filters.ncolorsFrom && design.NColors <= filters.ncolorsTo
        );
      }
      if (filters.subject) {
        allDesigns = allDesigns.filter(d => d.subject === filters.subject);
      }
      if (filters.sizeCategory) {
        allDesigns = allDesigns.filter(d => d.sizeCategory === filters.sizeCategory);
      }
      if (filters.orientation) {
        allDesigns = allDesigns.filter(d => d.orientation === filters.orientation);
      }
      if (filters.isBeginnerFriendly) {
        allDesigns = allDesigns.filter(d => d.isBeginnerFriendly === true);
      }
      if (searchText && filters.semanticIds && filters.semanticIds.length > 0) {
        // Text search is the hard filter; semantic is used only for re-ranking within those results
        const terms = searchText.toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
        const textMatches = (await Promise.all(
          allDesigns.map(async (design) => {
            const designCaption = design.Caption.toLowerCase();
            const albumCaption = (await getAlbumCaption(design.AlbumID))?.toLowerCase() || '';
            return terms.some(term => designCaption.includes(term) || albumCaption.includes(term)) ? design : null;
          })
        )).filter((d): d is Design => d !== null);
        const idSet = new Set(filters.semanticIds);
        const idOrder = new Map(filters.semanticIds.map((id, i) => [id, i]));
        const inSemantic = textMatches.filter(d => idSet.has(d.DesignID));
        const notInSemantic = textMatches.filter(d => !idSet.has(d.DesignID));
        inSemantic.sort((a, b) => (idOrder.get(a.DesignID) ?? 9999) - (idOrder.get(b.DesignID) ?? 9999));
        notInSemantic.sort((a, b) => b.DesignID - a.DesignID);
        allDesigns = [...inSemantic, ...notInSemantic];
      } else if (filters.semanticIds && filters.semanticIds.length > 0) {
        // No text filter — semantic is the only signal
        const idSet = new Set(filters.semanticIds);
        const idOrder = new Map(filters.semanticIds.map((id, i) => [id, i]));
        allDesigns = allDesigns.filter(d => idSet.has(d.DesignID));
        allDesigns.sort((a, b) => (idOrder.get(a.DesignID) ?? 9999) - (idOrder.get(b.DesignID) ?? 9999));
      } else {
        if (searchText) {
          const terms = searchText.toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
          allDesigns = (await Promise.all(
            allDesigns.map(async (design) => {
              const designCaption = design.Caption.toLowerCase();
              const albumCaption = (await getAlbumCaption(design.AlbumID))?.toLowerCase() || '';
              return terms.some(term => designCaption.includes(term) || albumCaption.includes(term)) ? design : null;
            })
          )).filter((d): d is Design => d !== null);
        }
        allDesigns.sort((a, b) => b.DesignID - a.DesignID);
      }

      const totalItems = allDesigns.length;
      const totalPages = totalItems > 0 ? Math.ceil(totalItems / pageSize) : 0;

      const responseData: DesignsResponse = {
        designs: [],
        entryCount: totalItems,
        page: nPage,
        pageSize,
        totalPages,
      };

      if (totalItems == 0) {
        console.warn("No designs found matching filters");
        return responseData;
      }

      const startIndex = (nPage - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      responseData.designs = allDesigns.slice(startIndex, endIndex);

      if (responseData.designs.length === 0) {
        console.warn(`No designs found for page ${nPage}`);
      }

      return responseData;
    } catch (error) {
      console.error("Error fetching filtered designs:", error);
      throw error;
    }
  });
}

export async function fetchAllDesigns(): Promise<Design[]> {
  return withCache(async () => {
    try {
      const allDesigns = Array.from(designCache.values());
      return allDesigns;
    } catch (error) {
      console.error("Error fetching filtered designs:", error);
      throw error;
    }
  });
}

async function fetchDesignKeyFromDb(designId: number): Promise<{ id: string; nPage: string } | null> {
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    throw new Error('DYNAMODB_TABLE_NAME environment variable is not set');
  }

  const params = {
    TableName: tableName,
    IndexName: 'DesignsByID-index',
    KeyConditionExpression: 'EntityType = :entityType AND DesignID = :designId',
    ExpressionAttributeValues: {
      ':entityType': { S: 'DESIGN' },
      ':designId': { N: designId.toString() },
    },
    Limit: 1,
  };

  const { Items } = await dynamoDBClient.send(new QueryCommand(params));
  if (!Items || Items.length === 0) {
    return null;
  }

  const id = Items[0].ID?.S;
  const nPage = Items[0].NPage?.S;
  if (!id || !nPage) {
    return null;
  }

  const keyInfo = { id, nPage };
  designKeyCache.set(designId, keyInfo);
  return keyInfo;
}

export async function incrementDesignDownloadCount(designId: number): Promise<void> {
  await ensureCacheReady();
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    throw new Error('DYNAMODB_TABLE_NAME environment variable is not set');
  }

  let keyInfo: { id: string; nPage: string } | null =
    designKeyCache.get(designId) ?? null;
  if (!keyInfo) {
    keyInfo = await fetchDesignKeyFromDb(designId);
  }

  if (!keyInfo) {
    throw new Error(`Unable to locate DynamoDB key info for design ${designId}`);
  }

  const { id, nPage } = keyInfo;

  await dynamoDBClient.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: {
        ID: { S: id },
        NPage: { S: nPage },
      },
      UpdateExpression: 'SET NDownloaded = if_not_exists(NDownloaded, :zero) + :inc',
      ExpressionAttributeValues: {
        ':inc': { N: '1' },
        ':zero': { N: '0' },
      },
    }),
  );

  const cached = designCache.get(designId);
  if (cached) {
    cached.NDownloaded = (cached.NDownloaded ?? 0) + 1;
    designCache.set(designId, cached);
  }
}

// Verify user credentials by email and password
export async function verifyUserWithProfile(
  email: string,
  password: string,
): Promise<VerifiedUserProfile | null> {
  try {
    devLog('verifyUser called with:', { email, password });
    const userId = `USR#${email}`;
    const normalizedEmail = email.trim().toLowerCase();
    devLog('Querying primary DynamoDB table with ID:', userId);
    const queryParams = {
      TableName: process.env.DYNAMODB_TABLE_NAME,
      KeyConditionExpression: "ID = :id",
      ExpressionAttributeValues: {
        ":id": { S: userId },
      },
      Limit: 1,
    };

    const { Items } = await dynamoDBClient.send(new QueryCommand(queryParams));
    devLog('Primary table query result:', Items);

    // Not found in primary table → check secondary table
    if (!Items || Items.length === 0) {
      devLog(`No user found for ID ${userId} in primary table, checking DDB_USERS_TABLE...`);

      const secondaryMatch = await verifyUserInSecondaryTable(email, password);
      if (secondaryMatch) {
        devLog('User validated via secondary users table');
        return secondaryMatch;
      }

      devLog('User not found in secondary users table either');
      return null;
    }

    // Found in primary table → use original password logic
    const storedPassword = Items[0].OpenPwd?.S;
    devLog('Stored password:', storedPassword);
    if (!storedPassword) {
      devLog(`No OpenPwd found for ID ${userId}`);
      return null;
    }

    const isMatch = storedPassword === password;
    devLog('Password match:', isMatch);
    if (!isMatch) {
      return null;
    }

    return {
      userId: Items[0].cid?.S ?? Items[0].ID?.S ?? normalizedEmail,
      email: normalizedEmail,
      firstName: normalizeDisplayName(
        Items[0].FName?.S || Items[0].FirstName?.S || Items[0].UserName?.S,
      ),
    };
  } catch (error) {
    console.error(`Error verifying user for ID USR#${email}:`, error);
    return null;
  }
}

export async function verifyUser(email: string, password: string): Promise<boolean> {
  const user = await verifyUserWithProfile(email, password);
  return Boolean(user);
}

// Create a new user in DynamoDB
export async function createUser(email: string, password: string, username: string, subscriptionId: string, receiveUpdates: boolean, registrationSource?: string): Promise<void> {
  const resolvedName = username?.trim() || email.split('@')[0] || 'User';
  try {
    devLog('Creating user:', { email, username, subscriptionId, receiveUpdates });
    const { userId } = await saveUserToDynamoDB({
      email,
      firstName: resolvedName,
      password,
      username,
      subscriptionId,
      receiveUpdates,
      registrationSource,
    });
    devLog('User created successfully:', userId);
  } catch (error: unknown) {
    const errorDetails = error instanceof Error
      ? { message: error.message, name: error.name, stack: error.stack }
      : { message: String(error), name: 'UnknownError', stack: '' };
    console.error(`Error creating user for email ${email}:`, errorDetails);
    throw error;
  }
}

// Create a new test user in DynamoDB
export async function createTestUser(email: string, password: string, username: string, subscriptionId: string, receiveUpdates: boolean, registrationSource?: string): Promise<void> {
  const resolvedName = username?.trim() || email.split('@')[0] || 'Test User';
  const testId = `TST#${email}` + Date.now();
  try {
    devLog('Creating test user:', { email, username, subscriptionId, receiveUpdates });
    const { userId } = await saveUserToDynamoDB({
      email,
      firstName: resolvedName,
      password,
      username,
      subscriptionId,
      receiveUpdates,
      idOverride: testId,
      registrationSource,
    });
    devLog('Test user created successfully:', userId);
  } catch (error: unknown) {
    const errorDetails = error instanceof Error
      ? { message: error.message, name: error.name, stack: error.stack }
      : { message: String(error), name: 'UnknownError', stack: '' };
    console.error(`Error creating test user for email ${email}:`, errorDetails);
    throw error;
  }
}

/**
 * Update LastEmailEntry for a user (primary table) identified by cid.
 * Uses a scan (no index on cid) and updates the first matching record.
 */
export async function updateLastEmailEntryByCid(cid: string): Promise<void> {
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    console.warn('DYNAMODB_TABLE_NAME not set; skipping LastEmailEntry update');
    return;
  }

  devLog(`Updating LastEmailEntry for user with cid: ${cid}`);
  const trimmedCid = cid.trim();
  if (!trimmedCid) {
    console.warn('Empty cid provided; skipping LastEmailEntry update');
    return;
  }

  const scanParams: ScanCommandInput = {
    TableName: tableName,
    FilterExpression: '#entityType = :user AND #cid = :cid',
     ExpressionAttributeNames: {
      '#entityType': 'EntityType',
      '#cid': 'cid',
    },
    ExpressionAttributeValues: {
      ':user': { S: 'USER' },
      ':cid': { S: trimmedCid },
    },
    ProjectionExpression: 'ID'
  };

  const { Items } = await dynamoDBClient.send(new ScanCommand(scanParams));
  const id = Items?.[0]?.ID?.S;
  if (!id) {
    console.warn(`No user found for cid ${trimmedCid} in ${tableName}, id: ${id}`);
    return;
  }

  const nowIso = new Date().toISOString();

  await dynamoDBClient.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: { ID: { S: id } },
      UpdateExpression: 'SET #lastEmailEntry = :now',
      ExpressionAttributeNames: { '#lastEmailEntry': 'LastEmailEntry' },
      ExpressionAttributeValues: { ':now': { S: nowIso } },
    }),
  );
}

export async function refreshCache(): Promise<void> {
  devLog('Refreshing cache');
  designCache.clear();
  designKeyCache.clear();
  albumCache.clear();
  albumCaptionCache.clear();
  cacheInitialized = false;
  cacheInitializationPromise = null;
  await initializeCache();
}

export function isCacheInitialized(): boolean {
  return cacheInitialized;
}

export async function getAdjacentAlbums(albumId: number): Promise<{
  prev: Album | null;
  next: Album | null;
} | null> {
  return withCache(async () => {
    const albums = Array.from(albumCache.values())
      .sort((a, b) => a.AlbumID - b.AlbumID);

    const idx = albums.findIndex(a => a.AlbumID === albumId);
    if (idx === -1) return null;

    const total = albums.length;
    const prev = total > 1 ? albums[(idx - 1 + total) % total] : null;
    const next = total > 1 ? albums[(idx + 1) % total] : null;

    return { prev, next };
  });
}

export async function getAdjacentDesigns(designId: number): Promise<{
  prev: Design | null;
  next: Design | null;
  albumId: number;
  albumCaption: string | undefined;
} | null> {
  return withCache(async () => {
    const design = designCache.get(designId);
    if (!design) return null;

    const albumId = design.AlbumID;
    const albumDesigns = Array.from(designCache.values())
      .filter(d => d.AlbumID === albumId)
      .sort((a, b) => a.DesignID - b.DesignID);

    const idx = albumDesigns.findIndex(d => d.DesignID === designId);
    if (idx === -1) return null;

    const total = albumDesigns.length;
    const prev = total > 1 ? albumDesigns[(idx - 1 + total) % total] : null;
    const next = total > 1 ? albumDesigns[(idx + 1) % total] : null;

    return { prev, next, albumId, albumCaption: albumCache.get(albumId)?.Caption };
  });
}

export async function getAlbumIdByCaption(caption: string): Promise<number | null> {
  return withCache(async () => {
    for (const album of albumCache.values()) {
      if (album.Caption === caption) {
        return album.AlbumID;
      }
    }
    return null;
  });
}

export async function getDesignIdByAlbumAndPage(albumId: number, nPage: number): Promise<number | null> {
  return withCache(async () => {
    nPage++; // Adjust for zero-based NPage
    for (const design of designCache.values()) {
      if (design.AlbumID === albumId && design.NPage === nPage) {
        return design.DesignID;
      }
    }
    return null;
  });
}

// ===== Mock registration persistence (replace with real DynamoDB later) =====

/** Payload for a new user created via the "register-only" dialog */
export type NewUserRegistration = {
  email: string;
  firstName: string;
  password: string;
};

/**
 * Mock function that pretends to save a new user to DynamoDB.
 * Replace this with AWS SDK v3 calls to DynamoDB when ready.
 */
export async function saveUserMock(
  user: NewUserRegistration
): Promise<{ userId: string }> {
  // Simulate network/DB latency
  await new Promise((r) => setTimeout(r, 200));

  // Server log to verify payload during development
  devLog('[data-access] saveUserMock:', {
    email: user.email,
    firstName: user.firstName,
    passwordLength: user.password?.length ?? 0,
  });

  // Return a mock ID
  return { userId: `mock-${Date.now()}` };
}
