export type PlatformType = 'youtube' | 'tiktok' | 'facebook' | 'instagram' | 'pinterest' | 'unknown';

export type MediaType = 'video' | 'audio';

export interface MediaFormat {
  id: string;
  quality: string; // e.g., '360p', '480p', '720p HD', '1080p FHD', '2K', '4K', '128 kbps', '320 kbps'
  resolution?: string; // '1080p', '720p', etc.
  type: 'video' | 'audio';
  extension: 'mp4' | 'mp3' | 'm4a' | 'jpg' | 'png' | 'zip';
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
  duration?: number; // in seconds
  durationFormatted?: string; // '03:45'
  formats: MediaFormat[];
  images?: string[];
  isPhotoSlide?: boolean;
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
