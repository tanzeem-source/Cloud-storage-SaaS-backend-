import { Response } from 'express';
import { randomBytes } from 'crypto';
import { supabase } from '../config/supabase';
import { AuthRequest } from '../middleware/auth';
import { getUserAccessRole } from '../utils/permissions';
import { getSignedUrl } from '../utils/storage';

// SHARE a file/folder with a specific user (Viewer/Editor)
export async function shareWithUser(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { resource_type, resource_id, grantee_email, role } = req.body;

    if (!resource_type || !resource_id || !grantee_email || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!['viewer', 'editor'].includes(role)) {
      return res.status(400).json({ error: 'Role must be viewer or editor' });
    }

    // Only the owner can share
    const accessRole = await getUserAccessRole(userId, resource_type, resource_id);
    if (accessRole !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can share this item' });
    }

    // Find the user to share with, by email
    const { data: grantee } = await supabase
      .from('users')
      .select('id')
      .eq('email', grantee_email)
      .single();

    if (!grantee) {
      return res.status(404).json({ error: 'User with that email not found' });
    }

    const { data: share, error } = await supabase
      .from('shares')
      .upsert(
        {
          resource_type,
          resource_id,
          grantee_user_id: grantee.id,
          role,
          created_by: userId,
        },
        { onConflict: 'resource_type,resource_id,grantee_user_id' }
      )
      .select()
      .single();

    if (error || !share) {
      return res.status(500).json({ error: 'Failed to share', details: error?.message });
    }

    res.status(201).json({ share });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

// REVOKE a user's access
export async function revokeShare(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params; // shares.id

    const { data: share } = await supabase
      .from('shares')
      .select('created_by')
      .eq('id', id)
      .single();

    if (!share || share.created_by !== userId) {
      return res.status(404).json({ error: 'Share not found or not yours to revoke' });
    }

    await supabase.from('shares').delete().eq('id', id);
    res.json({ message: 'Access revoked' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

// CREATE a public shareable link (with expiry)
export async function createLinkShare(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { resource_type, resource_id, expires_in_hours, password } = req.body;

    if (!resource_type || !resource_id) {
      return res.status(400).json({ error: 'resource_type and resource_id are required' });
    }

    const accessRole = await getUserAccessRole(userId, resource_type, resource_id);
    if (accessRole !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can create a share link' });
    }

    const token = randomBytes(24).toString('hex'); // long random token for the URL

    let password_hash: string | null = null;
    if (password) {
      const bcrypt = await import('bcrypt');
      password_hash = await bcrypt.hash(password, 10);
    }

    const expires_at = expires_in_hours
      ? new Date(Date.now() + expires_in_hours * 60 * 60 * 1000).toISOString()
      : null;

    const { data: linkShare, error } = await supabase
      .from('link_shares')
      .insert({
        resource_type,
        resource_id,
        token,
        role: 'viewer',
        password_hash,
        expires_at,
        created_by: userId,
      })
      .select()
      .single();

    if (error || !linkShare) {
      return res.status(500).json({ error: 'Failed to create link', details: error?.message });
    }

    res.status(201).json({
      link: `${process.env.FRONTEND_URL}/share/${token}`,
      linkShare,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

// OPEN a shared link (requires login — resolves token -> signed URL)
export async function openLinkShare(req: AuthRequest, res: Response) {
  try {
    const { token } = req.params;
    // Read password from both body and query params to support GET requests
    const password = req.body?.password || req.query?.password;

    const { data: linkShare } = await supabase
      .from('link_shares')
      .select('*')
      .eq('token', token)
      .single();

    if (!linkShare) {
      return res.status(404).json({ error: 'Link not found' });
    }

    if (linkShare.expires_at && new Date(linkShare.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This link has expired' });
    }

    if (linkShare.password_hash) {
      const bcrypt = await import('bcrypt');
      const valid = password && (await bcrypt.compare(String(password), linkShare.password_hash));
      if (!valid) {
        return res.status(401).json({ error: 'Password required or incorrect' });
      }
    }

    if (linkShare.resource_type === 'file') {
      const { data: file } = await supabase
        .from('files')
        .select('*')
        .eq('id', linkShare.resource_id)
        .single();

      if (!file || file.is_deleted) {
        return res.status(404).json({ error: 'This file is no longer available' });
      }

      const signedUrl = await getSignedUrl(file.storage_key);
      return res.json({ file, downloadUrl: signedUrl });
    }

    // resource_type === 'folder' — return folder contents
    const { data: folder } = await supabase
      .from('folders')
      .select('is_deleted')
      .eq('id', linkShare.resource_id)
      .single();

    if (!folder || folder.is_deleted) {
      return res.status(404).json({ error: 'This folder is no longer available' });
    }

    const { data: files } = await supabase
      .from('files')
      .select('*')
      .eq('folder_id', linkShare.resource_id)
      .eq('is_deleted', false);

    return res.json({ folderId: linkShare.resource_id, files });
  } catch (err) {
     console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}


// LIST all shares (per-user + link) for a resource
export async function listShares(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const resourceType = req.params.resourceType as 'file' | 'folder';
    const resourceId = req.params.resourceId as string;

    const accessRole = await getUserAccessRole(userId, resourceType as 'file' | 'folder', resourceId);
    if (accessRole !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can view sharing details' });
    }

    const { data: userShares } = await supabase
      .from('shares')
      .select('id, role, created_at, grantee_user_id, users:grantee_user_id(email, name)')
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId);

    const { data: linkShares } = await supabase
      .from('link_shares')
      .select('id, token, role, expires_at, password_hash, created_at')
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId);

    res.json({
      userShares: userShares || [],
      linkShares: (linkShares || []).map((l) => ({ ...l, hasPassword: !!l.password_hash, password_hash: undefined })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// UPDATE a share's role
export async function updateShareRole(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { role } = req.body;

    if (!['viewer', 'editor'].includes(role)) {
      return res.status(400).json({ error: 'Role must be viewer or editor' });
    }

    const { data: share } = await supabase.from('shares').select('created_by').eq('id', id).single();
    if (!share || share.created_by !== userId) {
      return res.status(404).json({ error: 'Share not found or not yours to modify' });
    }

    const { data: updated, error } = await supabase
      .from('shares')
      .update({ role })
      .eq('id', id)
      .select()
      .single();

    if (error || !updated) {
      return res.status(500).json({ error: 'Failed to update role' });
    }

    res.json({ share: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// REVOKE a link share
export async function revokeLinkShare(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const { data: link } = await supabase.from('link_shares').select('created_by').eq('id', id).single();
    if (!link || link.created_by !== userId) {
      return res.status(404).json({ error: 'Link not found or not yours to revoke' });
    }

    await supabase.from('link_shares').delete().eq('id', id);
    res.json({ message: 'Link revoked' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
}