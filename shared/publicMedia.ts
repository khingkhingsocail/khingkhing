export type PublicMediaKind = "image" | "video";

export interface PublicMediaCreator {
  id: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
}

export interface PublicMediaSummary {
  id: string;
  title: string;
  description: string;
  kind: PublicMediaKind;
  mimeType: string;
  size: number;
  createdAt: string;
  viewCount?: number;
  accountLinked?: boolean;
  isMine?: boolean;
  creator?: PublicMediaCreator | null;
}

export interface PublicMediaPage {
  items: PublicMediaSummary[];
  nextCursor: string | null;
}

export interface PublicMediaUploadResult {
  item: PublicMediaSummary;
  deleteToken: string;
}
