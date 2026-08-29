import { Response, NextFunction } from 'express';
import { randomUUID, createHash } from 'crypto';
import { supabase } from '../config/supabase';
import { AuthRequest } from '../middleware/auth';

const BUCKET = 'user-files';

export async function uploadFile(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const file = req.file; // populated by multer
    const { folder_id } = req.body;
    const userId = req.userId!;

    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Generate a unique storage path: userId/uuid-filename
    const fileId = randomUUID();
    const storageKey = `${userId}/${fileId}-${file.originalname}`;

    // Compute checksum
    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storageKey, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      return res.status(500).json({ error: 'Storage upload failed', details: uploadError.message });
    }

    // Insert into `files` table (metadata record)
    const { data: fileRecord, error: fileError } = await supabase
      .from('files')
      .insert({
        id: fileId,
        name: file.originalname,
        mime_type: file.mimetype,
        size_bytes: file.size,
        storage_key: storageKey,
        owner_id: userId,
        folder_id: folder_id || null,
        checksum,
      })
      .select()
      .single();

    if (fileError || !fileRecord) {
      // Rollback: remove the uploaded storage object since the DB insert failed
      await supabase.storage.from(BUCKET).remove([storageKey]);
      return res.status(500).json({ error: 'Failed to save file metadata', details: fileError?.message });
    }

    // Insert into `file_versions` (version 1)
    const { data: versionRecord, error: versionError } = await supabase
      .from('file_versions')
      .insert({
        file_id: fileRecord.id,
        version_number: 1,
        storage_key: storageKey,
        size_bytes: file.size,
        checksum,
      })
      .select()
      .single();

    if (versionError || !versionRecord) {
      return res.status(500).json({ error: 'Failed to save version record', details: versionError?.message });
    }

    // Update files.version_id to point to this version
    await supabase
      .from('files')
      .update({ version_id: versionRecord.id })
      .eq('id', fileRecord.id);

    return res.status(201).json({ file: { ...fileRecord, version_id: versionRecord.id } });
  } catch (err) {
    next(err);
  }
}


// RENAME file
export async function renameFile(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const userId = req.userId!;

    if (!name) {
      return res.status(400).json({ error: 'New name is required' });
    }

    const { data: file, error } = await supabase
      .from('files')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', userId)
      .select()
      .single();

    if (error || !file) {
      return res.status(404).json({ error: 'File not found or not yours' });
    }

    res.json({ file });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

// SOFT DELETE file (move to trash)
export async function deleteFile(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const { data: file, error } = await supabase
      .from('files')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', userId)
      .select()
      .single();

    if (error || !file) {
      return res.status(404).json({ error: 'File not found or not yours' });
    }

    res.json({ message: 'File moved to trash', file });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

// RESTORE file from trash
export async function restoreFile(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const { data: file, error } = await supabase
      .from('files')
      .update({ is_deleted: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', userId)
      .select()
      .single();

    if (error || !file) {
      return res.status(404).json({ error: 'File not found or not yours' });
    }

    res.json({ message: 'File restored', file });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

// LIST trash (files + folders where is_deleted = true)
export async function getTrash(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;

    const { data: files } = await supabase
      .from('files')
      .select('*')
      .eq('owner_id', userId)
      .eq('is_deleted', true);

    const { data: folders } = await supabase
      .from('folders')
      .select('*')
      .eq('owner_id', userId)
      .eq('is_deleted', true);

    res.json({ files, folders });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

// PERMANENT DELETE (actually removes from storage + DB — separate from soft delete)
export async function permanentlyDeleteFile(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const { data: file } = await supabase
      .from('files')
      .select('storage_key')
      .eq('id', id)
      .eq('owner_id', userId)
      .single();

    if (!file) {
      return res.status(404).json({ error: 'File not found or not yours' });
    }

    await supabase.storage.from('user-files').remove([file.storage_key]);
    await supabase.from('files').delete().eq('id', id);

    res.json({ message: 'File permanently deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}