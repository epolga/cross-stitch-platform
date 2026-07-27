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
    // Set on a near-duplicate design to point Google at the primary design
    // instead (see docs/Focus.md Pending #13, Gap 3) — this design still
    // renders normally, only its <link rel="canonical"> target changes.
    CanonicalDesignId?: number;
    // Short vision-generated fact/story about the design's actual subject
    // (an animal, a landmark, a plant, the meaning of stitched text, or —
    // for abstract/geometric patterns — the ornamental style itself), shown
    // on the design page in place of the old fixed "About this pattern"
    // paragraph. Empty/absent for designs not yet re-backfilled.
    SeoSubjectBlurb?: string;
    // Real content-change timestamp (ISO string), stamped by whichever script
    // last wrote SEO/content fields on this design. Used as sitemap <lastmod>
    // instead of "now" so Google can tell real changes from unchanged pages.
    LastModifiedAt?: string;
    // S3 object key (in the private cross-stitch-editor-designs bucket) of this
    // design's grid+palette JSON, once the catalog batch-extractor has produced
    // one. Presence of this field is what gates showing "Open in editor" on the
    // design page — absence just means it hasn't been processed yet.
    EditorPatternKey?: string;
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