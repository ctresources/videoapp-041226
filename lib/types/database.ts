export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type UserRole = "user" | "admin";
export type SubscriptionTier = "free" | "pro" | "agency";
export type RecordingStatus = "uploaded" | "transcribing" | "transcribed" | "processing" | "error";
export type ProjectType = "blog_video" | "short_form" | "carousel";
export type ProjectStatus = "draft" | "generating" | "ready" | "posted" | "error";
export type VideoType = "blog_long" | "reel_9x16" | "short_1x1" | "youtube_16x9";
export type RenderProvider = "creatomate" | "heygen";
export type RenderStatus = "pending" | "rendering" | "completed" | "failed";
export type SocialPlatform = "youtube" | "instagram" | "tiktok" | "facebook" | "linkedin" | "x";
export type PostStatus = "scheduled" | "posting" | "posted" | "failed";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  company_name: string | null;
  phone: string | null;
  role: UserRole;
  onboarding_done: boolean;
  voice_clone_id: string | null;
  heygen_avatar_id: string | null;
  subscription_tier: SubscriptionTier;
  credits_remaining: number;
  created_at: string;
  updated_at: string;
}

export interface VoiceRecording {
  id: string;
  user_id: string;
  title: string | null;
  audio_url: string;
  transcript: string | null;
  duration_seconds: number | null;
  status: RecordingStatus;
  created_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  voice_recording_id: string | null;
  title: string;
  project_type: ProjectType;
  status: ProjectStatus;
  ai_script: Json | null;
  seo_data: Json | null;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface GeneratedVideo {
  id: string;
  project_id: string;
  user_id: string;
  video_url: string | null;
  video_type: VideoType;
  duration_seconds: number | null;
  render_provider: RenderProvider;
  render_job_id: string | null;
  render_status: RenderStatus;
  metadata: Json | null;
  created_at: string;
}

export interface SocialAccount {
  id: string;
  user_id: string;
  platform: SocialPlatform;
  access_token: string;
  refresh_token: string | null;
  platform_user_id: string | null;
  platform_username: string | null;
  token_expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface SocialPost {
  id: string;
  user_id: string;
  video_id: string;
  social_account_id: string;
  platform: SocialPlatform;
  post_status: PostStatus;
  scheduled_at: string | null;
  posted_at: string | null;
  platform_post_id: string | null;
  caption: string | null;
  hashtags: string[] | null;
  error_message: string | null;
  created_at: string;
}

export interface ApiUsageLog {
  id: string;
  user_id: string;
  api_provider: string;
  endpoint: string | null;
  credits_used: number;
  response_status: number | null;
  created_at: string;
}

// Supabase Database type — intentionally loose to avoid TypeScript inference conflicts
// All Supabase client calls use explicit casting where needed
export type Database = Record<string, unknown>;
