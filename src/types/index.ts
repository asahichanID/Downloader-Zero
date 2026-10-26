export type PlatformType = 'youtube' | 'tiktok' | 'facebook' | 'instagram' | 'pinterest' | 'spotify' | 'terabox' | 'unknown';

export type MediaType = 'video' | 'audio' | 'photos';

export interface AudioTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  releaseDate?: string;
  thumbnail: string;
  duration?: number;
  durationFormatted?: string;
  url: string;
  previewUrl?: string;
  filesize?: string;
}

export interface MediaFormat {
  id: string;
  quality: string; // e.g., '360p', '480p', '720p HD', '1080p FHD', '2K', '4K', '128 kbps', '320 kbps'
  resolution?: string; // '1080p', '720p', etc.
  type: 'video' | 'audio' | 'photos';
  extension: 'mp4' | 'mp3' | 'm4a' | 'jpg' | 'jpeg' | 'png' | 'zip';
  filesize?: string; // e.g. '15.4 MB'
  filesizeBytes?: number;
  url: string; // direct download or conversion URL
  jobId?: string; // for async polling like loader.to
  isDirect: boolean;
  note?: string; // e.g., 'No Watermark', 'Original Audio', 'Lossless'
}

export interface MediaMetadata {
  id: string;
  url: string;
  platform: PlatformType;
  title: string;
  author: string;
  authorUrl?: string;
  thumbnail: string;
  genre?: string;
  album?: string;
  releaseDate?: string;
  previewUrl?: string;
  duration?: number; // in seconds
  durationFormatted?: string; // '03:45'
  formats: MediaFormat[];
  images?: string[];
  isPhotoSlide?: boolean;
  tracks?: AudioTrack[];
  isAudioPlaylist?: boolean;
  source: string;
  createdAt: string;
}

export interface ExtractResponse {
  success: boolean;
  data?: MediaMetadata;
  error?: string;
}

export interface ProgressResponse {
  success: boolean;
  progress: number; // 0 - 100
  downloadUrl?: string;
  statusText?: string;
  error?: string;
}

export interface HistoryItem {
  id: string;
  sourceUrl: string;
  platform: PlatformType;
  title: string;
  author: string;
  thumbnail: string;
  quality: string;
  resolution?: string;
  mediaType: 'video' | 'audio' | 'photos';
  extension: 'mp4' | 'mp3' | 'm4a' | 'jpg' | 'jpeg' | 'png' | 'zip';
  filename: string;
  filesize: string;
  filesizeBytes: number;
  blob?: Blob;
  downloadedAt: number;
}

