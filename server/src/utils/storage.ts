import { supabase } from '../config/supabase';

const BUCKET = 'user-files';

export async function getSignedUrl(storageKey: string, expiresInSeconds = 300) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storageKey, expiresInSeconds);

  if (error || !data) {
    throw new Error(`Failed to generate signed URL: ${error?.message}`);
  }

  return data.signedUrl;
}