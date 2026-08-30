import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthRequest } from '../middleware/auth';
import { getUserAccessRole } from '../utils/permissions';

// CREATE folder
export async function createFolder(req: AuthRequest, res: Response) {
  try {
    const { name, parent_id } = req.body;
    const userId = req.userId!;

    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const { data: folder, error } = await supabase
      .from('folders')
      .insert({ name, owner_id: userId, parent_id: parent_id || null })
      .select()
      .single();

    if (error || !folder) {
      return res.status(500).json({ error: 'Failed to create folder', details: error?.message });
    }

    res.status(201).json({ folder });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

// LIST folder contents (subfolders + files inside a given folder)
export async function getFolderContents(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const folderId = req.params.id === 'root' ? null : req.params.id;

    const { data: folders, error: folderErr } = await supabase
      .from('folders')
      .select('*')
      .eq('owner_id', userId)
      .eq('is_deleted', false)
      .is('parent_id', folderId);

    const { data: files, error: fileErr } = await supabase
      .from('files')
      .select('*')
      .eq('owner_id', userId)
      .eq('is_deleted', false)
      .is('folder_id', folderId);

    if (folderErr || fileErr) {
      return res.status(500).json({ error: 'Failed to fetch contents' });
    }

    res.json({ folders, files });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

// RENAME folder
export async function renameFolder(req: AuthRequest, res: Response) {
  try {
    const id = req.params.id as string;
    const { name } = req.body;
    const userId = req.userId!;

    if (!name) {
      return res.status(400).json({ error: 'New name is required' });
    }

    const role = await getUserAccessRole(userId, 'folder', id);
    if (role !== 'owner' && role !== 'editor') {
      return res.status(403).json({ error: 'You do not have permission to rename this folder' });
    }

    const { data: folder, error } = await supabase
      .from('folders')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error || !folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    res.json({ folder });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

// SOFT DELETE folder (move to trash)
export async function deleteFolder(req: AuthRequest, res: Response) {
  try {
    const id = req.params.id as string;
    const userId = req.userId!;

    const role = await getUserAccessRole(userId, 'folder', id);
    if (role !== 'owner' && role !== 'editor') {
      return res.status(403).json({ error: 'You do not have permission to delete this folder' });
    }

    async function cascadeTrash(folderId: string) {
      await supabase
        .from('files')
        .update({ is_deleted: true, updated_at: new Date().toISOString() })
        .eq('folder_id', folderId);

      const { data: subfolders } = await supabase
        .from('folders')
        .select('id')
        .eq('parent_id', folderId);

      for (const sub of subfolders || []) {
        await supabase
          .from('folders')
          .update({ is_deleted: true, updated_at: new Date().toISOString() })
          .eq('id', sub.id);
        await cascadeTrash(sub.id);
      }
    }

    const { data: folder, error } = await supabase
      .from('folders')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error || !folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    await cascadeTrash(id);

    res.json({ message: 'Folder and its contents moved to trash', folder });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

// RESTORE folder from trash
export async function restoreFolder(req: AuthRequest, res: Response) {
  try {
    const id = req.params.id as string;
    const userId = req.userId!;

    const role = await getUserAccessRole(userId, 'folder', id);
    if (role !== 'owner' && role !== 'editor') {
      return res.status(403).json({ error: 'You do not have permission to restore this folder' });
    }

    const { data: folder, error } = await supabase
      .from('folders')
      .update({ is_deleted: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error || !folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    res.json({ message: 'Folder restored', folder });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}