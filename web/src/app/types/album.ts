export interface Album {
    AlbumID: number;
    Caption: string;
    SeoDescription?: string;
}

export interface AlbumsResponse {
    albums: Album[];
    entryCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
}