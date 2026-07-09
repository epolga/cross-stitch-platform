// src/types/design.ts

export interface Design {
    DesignID: number;
    AlbumID: number;
    Caption: string;
    Description: string;
    NColors: number;
    NDownloaded: number;
    Width: number;
    Height: number;
    Notes: string;
    Text: string;
    NPage: number;
    ImageUrl?: string | null;
    PdfUrl?: string | null;
    PinterestPinId?: string | null;
    PinterestPinUrl?: string | null;
    NGlobalPage: number;
    SeoDescription?: string;
    SeoTitle?: string;
    // Computed facets — derived at cache load, not stored in DDB
    subject?: string;
    orientation?: 'portrait' | 'landscape' | 'square';
    sizeCategory?: 'small' | 'medium' | 'large';
    colorBucket?: 'few' | 'medium' | 'many';
    isBeginnerFriendly?: boolean;
}

export interface DesignsResponse {
    designs: Design[];
    entryCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
    albumCaption?: string;
    albumSeoDescription?: string;
}