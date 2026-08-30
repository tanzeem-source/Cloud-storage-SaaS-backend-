import { supabase } from '../config/supabase';

export type AccessRole = 'owner' | 'editor' | 'viewer' | null;

export async function getUserAccessRole(
  userId: string,
  resourceType: 'file' | 'folder',
  resourceId: string
): Promise<AccessRole> {
  const table = resourceType === 'file' ? 'files' : 'folders';

  // 1. Check ownership
  const { data: resource } = await supabase
    .from(table)
    .select('owner_id')
    .eq('id', resourceId)
    .single();

  if (resource?.owner_id === userId) {
    return 'owner';
  }

  // 2. Check per-user share (shares table)
  const { data: share } = await supabase
    .from('shares')
    .select('role')
    .eq('resource_type', resourceType)
    .eq('resource_id', resourceId)
    .eq('grantee_user_id', userId)
    .single();

  if (share) {
    return share.role as AccessRole;
  }

  return null; // no access
}