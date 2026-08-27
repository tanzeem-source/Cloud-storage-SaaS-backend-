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