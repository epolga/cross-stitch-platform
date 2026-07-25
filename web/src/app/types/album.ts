export interface Album {
    AlbumID: number;
    Caption: string;
    SeoDescription?: string;
    // Real per-row content-change timestamp (ISO string), stamped by whichever
    // write path last touched this album's content. Used as sitemap <lastmod>
    // instead of "now" so Google can tell real changes from unchanged pages.
    LastModifiedAt?: string;
}

export interface AlbumsResponse {
    albums: Album[];
    entryCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
}