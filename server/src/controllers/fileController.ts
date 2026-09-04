import { Response, NextFunction } from "express";
import { randomUUID, createHash } from "crypto";
import { supabase } from "../config/supabase";
import { AuthRequest } from "../middleware/auth";
import { getUserAccessRole } from "../utils/permissions";
import { getSignedUrl } from "../utils/storage";

const BUCKET = "user-files";

export async function uploadFile(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const file = req.file; // populated by multer
    const { folder_id } = req.body;
    const userId = req.userId!;

    if (!file) {
      return res.status(400).json({ error: "No file provided" });
    }

    // Generate a unique storage path: userId/uuid-filename
    const fileId = randomUUID();
    const storageKey = `${userId}/${fileId}-${file.originalname}`;

    // Compute checksum
    const checksum = createHash("sha256").update(file.buffer).digest("hex");

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storageKey, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      return res
        .status(500)
        .json({ error: "Storage upload failed", details: uploadError.message });
    }

    // Insert into `files` table (metadata record)
    const { data: fileRecord, error: fileError } = await supabase
      .from("files")
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
      return res
        .status(500)
        .json({
          error: "Failed to save file metadata",
          details: fileError?.message,
        });
    }

    // Insert into `file_versions` (version 1)
    const { data: versionRecord, error: versionError } = await supabase
      .from("file_versions")
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
      return res
        .status(500)
        .json({
          error: "Failed to save version record",
          details: versionError?.message,
        });
    }

    // Update files.version_id to point to this version
    await supabase
      .from("files")
      .update({ version_id: versionRecord.id })
      .eq("id", fileRecord.id);

    return res
      .status(201)
      .json({ file: { ...fileRecord, version_id: versionRecord.id } });
  } catch (err) {
    next(err);
  }
}

// RENAME file
export async function renameFile(req: AuthRequest, res: Response) {
  try {
    const id = req.params.id as string;
    const { name } = req.body;
    const userId = req.userId!;

    if (!name) {
      return res.status(400).json({ error: "New name is required" });
    }

    const role = await getUserAccessRole(userId, "file", id);
    if (role !== "owner" && role !== "editor") {
      return res
        .status(403)
        .json({ error: "You do not have permission to rename this file" });
    }

    const { data: file, error } = await supabase
      .from("files")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error || !file) {
      return res.status(404).json({ error: "File not found" });
    }

    res.json({ file });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
}

// SOFT DELETE file (move to trash)
export async function deleteFile(req: AuthRequest, res: Response) {
  try {
    const id = req.params.id as string;
    const userId = req.userId!;

    const role = await getUserAccessRole(userId, "file", id);
    if (role !== "owner" && role !== "editor") {
      return res
        .status(403)
        .json({ error: "You do not have permission to delete this file" });
    }

    const { data: file, error } = await supabase
      .from("files")
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error || !file) {
      return res.status(404).json({ error: "File not found" });
    }

    res.json({ message: "File moved to trash", file });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
}

// RESTORE file from trash
export async function restoreFile(req: AuthRequest, res: Response) {
  try {
    const id = req.params.id as string;
    const userId = req.userId!;

    const role = await getUserAccessRole(userId, "file", id);
    if (role !== "owner" && role !== "editor") {
      return res
        .status(403)
        .json({ error: "You do not have permission to restore this file" });
    }

    const { data: file, error } = await supabase
      .from("files")
      .update({ is_deleted: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error || !file) {
      return res.status(404).json({ error: "File not found" });
    }

    res.json({ message: "File restored", file });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
}

// LIST trash (files + folders where is_deleted = true)
export async function getTrash(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;

    const { data: files } = await supabase
      .from("files")
      .select("*")
      .eq("owner_id", userId)
      .eq("is_deleted", true);

    const { data: folders } = await supabase
      .from("folders")
      .select("*")
      .eq("owner_id", userId)
      .eq("is_deleted", true);

    res.json({ files, folders });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
}

// PERMANENT DELETE (actually removes from storage + DB — separate from soft delete)
export async function permanentlyDeleteFile(req: AuthRequest, res: Response) {
  try {
    const id = req.params.id as string;
    const userId = req.userId!;

    const role = await getUserAccessRole(userId, "file", id);
    if (role !== "owner" && role !== "editor") {
      return res
        .status(403)
        .json({
          error: "You do not have permission to permanently delete this file",
        });
    }

    const { data: file } = await supabase
      .from("files")
      .select("storage_key")
      .eq("id", id)
      .single();

    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    await supabase.storage.from("user-files").remove([file.storage_key]);
    await supabase.from("files").delete().eq("id", id);

    res.json({ message: "File permanently deleted" });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getFileDownloadUrl(req: AuthRequest, res: Response) {
  try {
    const id = req.params.id as string;
    const userId = req.userId!;

    const role = await getUserAccessRole(userId, "file", id);
    if (!role) {
      return res
        .status(403)
        .json({ error: "You do not have access to this file" });
    }

    const { data: file } = await supabase
      .from("files")
      .select("*")
      .eq("id", id)
      .single();
    if (!file) return res.status(404).json({ error: "File not found" });

    const signedUrl = await getSignedUrl(file.storage_key);
    res.json({ downloadUrl: signedUrl, expiresIn: 300 });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
}

// UPLOAD a new version of an existing file
export async function uploadNewVersion(req: AuthRequest, res: Response) {
  try {
    const id = req.params.id as string;
    const userId = req.userId!;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const role = await getUserAccessRole(userId, "file", id);
    if (role !== "owner" && role !== "editor") {
      return res
        .status(403)
        .json({ error: "You do not have permission to update this file" });
    }

    const { data: existingFile } = await supabase
      .from("files")
      .select("*")
      .eq("id", id)
      .single();
    if (!existingFile) {
      return res.status(404).json({ error: "File not found" });
    }

    const { data: latestVersion } = await supabase
      .from("file_versions")
      .select("version_number")
      .eq("file_id", id)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();

    const nextVersionNumber = (latestVersion?.version_number || 0) + 1;
    const storageKey = `${existingFile.owner_id}/${id}-v${nextVersionNumber}-${file.originalname}`;
    const checksum = createHash("sha256").update(file.buffer).digest("hex");

    const { error: uploadError } = await supabase.storage
      .from("user-files")
      .upload(storageKey, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      return res
        .status(500)
        .json({ error: "Storage upload failed", details: uploadError.message });
    }

    const { data: versionRecord, error: versionError } = await supabase
      .from("file_versions")
      .insert({
        file_id: id,
        version_number: nextVersionNumber,
        storage_key: storageKey,
        size_bytes: file.size,
        checksum,
      })
      .select()
      .single();

    if (versionError || !versionRecord) {
      await supabase.storage.from("user-files").remove([storageKey]);
      return res.status(500).json({ error: "Failed to save version record" });
    }

    const { data: updatedFile } = await supabase
      .from("files")
      .update({
        version_id: versionRecord.id,
        size_bytes: file.size,
        mime_type: file.mimetype,
        checksum,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    res.status(201).json({ file: updatedFile, version: versionRecord });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// LIST version history for a file
export async function listFileVersions(req: AuthRequest, res: Response) {
  try {
    const id = req.params.id as string;
    const userId = req.userId!;

    const role = await getUserAccessRole(userId, "file", id);
    if (!role) {
      return res
        .status(403)
        .json({ error: "You do not have access to this file" });
    }

    const { data: versions, error } = await supabase
      .from("file_versions")
      .select("*")
      .eq("file_id", id)
      .order("version_number", { ascending: false });

    if (error) {
      return res.status(500).json({ error: "Failed to fetch versions" });
    }

    res.json({ versions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// RESTORE an older version (makes it the current version)
export async function restoreVersion(req: AuthRequest, res: Response) {
  try {
    const id = req.params.id as string;
    const versionId = req.params.versionId as string;
    const userId = req.userId!;

    const role = await getUserAccessRole(userId, "file", id);
    if (role !== "owner" && role !== "editor") {
      return res
        .status(403)
        .json({ error: "You do not have permission to restore a version" });
    }

    const { data: version } = await supabase
      .from("file_versions")
      .select("*")
      .eq("id", versionId)
      .eq("file_id", id)
      .single();

    if (!version) {
      return res.status(404).json({ error: "Version not found" });
    }

    const { data: updatedFile } = await supabase
      .from("files")
      .update({
        version_id: version.id,
        size_bytes: version.size_bytes,
        checksum: version.checksum,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    res.json({ file: updatedFile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
}
