import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import { createTestUser } from './helpers';


describe('Folders API', () => {
  let cookie: string;

  beforeAll(async () => {
    ({ cookie } = await createTestUser('foldertest'));
  });

  it('should reject folder creation without a name', async () => {
    const res = await request(app).post('/api/folders').set('Cookie', cookie).send({});
    expect(res.status).toBe(400);
  });

  it('should create a folder', async () => {
    const res = await request(app).post('/api/folders').set('Cookie', cookie).send({ name: 'Test Folder' });
    expect(res.status).toBe(201);
    expect(res.body.folder.name).toBe('Test Folder');
    expect(res.body.folder.parent_id).toBeNull();
  });

  it('should create a nested subfolder', async () => {
    const parent = await request(app).post('/api/folders').set('Cookie', cookie).send({ name: 'Parent' });
    const child = await request(app)
      .post('/api/folders')
      .set('Cookie', cookie)
      .send({ name: 'Child', parent_id: parent.body.folder.id });

    expect(child.status).toBe(201);
    expect(child.body.folder.parent_id).toBe(parent.body.folder.id);
  });

  it('should list root contents', async () => {
    const res = await request(app).get('/api/folders/root').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.folders)).toBe(true);
    expect(res.body.pagination.folders).toBeDefined();
  });

  it('should rename a folder', async () => {
    const created = await request(app).post('/api/folders').set('Cookie', cookie).send({ name: 'Old Name' });
    const renamed = await request(app)
      .patch(`/api/folders/${created.body.folder.id}/rename`)
      .set('Cookie', cookie)
      .send({ name: 'New Name' });

    expect(renamed.status).toBe(200);
    expect(renamed.body.folder.name).toBe('New Name');
  });

  it('should soft-delete a folder and cascade to its file', async () => {
    const folder = await request(app).post('/api/folders').set('Cookie', cookie).send({ name: 'ToDelete' });
    const folderId = folder.body.folder.id;

    await request(app)
      .post('/api/files/upload')
      .set('Cookie', cookie)
      .field('folder_id', folderId)
      .attach('file', Buffer.from('x'), 'inside.txt');

    const del = await request(app).delete(`/api/folders/${folderId}`).set('Cookie', cookie);
    expect(del.status).toBe(200);

    const trash = await request(app).get('/api/files/trash').set('Cookie', cookie);
    const trashedFolder = trash.body.folders.find((f: any) => f.id === folderId);
    const trashedFile = trash.body.files.find((f: any) => f.name === 'inside.txt');

    expect(trashedFolder?.is_deleted).toBe(true);
    expect(trashedFile?.is_deleted).toBe(true);
  });

  it('should restore a folder', async () => {
    const folder = await request(app).post('/api/folders').set('Cookie', cookie).send({ name: 'RestoreMe' });
    await request(app).delete(`/api/folders/${folder.body.folder.id}`).set('Cookie', cookie);
    const restored = await request(app)
      .patch(`/api/folders/${folder.body.folder.id}/restore`)
      .set('Cookie', cookie);

    expect(restored.status).toBe(200);
    expect(restored.body.folder.is_deleted).toBe(false);
  });

  it('should reject operations on another user\'s folder', async () => {
    const owner = await createTestUser('folderowner');
    const stranger = await createTestUser('folderstranger');

    const created = await request(app)
      .post('/api/folders')
      .set('Cookie', owner.cookie)
      .send({ name: 'Private' });

    const renameAttempt = await request(app)
      .patch(`/api/folders/${created.body.folder.id}/rename`)
      .set('Cookie', stranger.cookie)
      .send({ name: 'Hijacked' });

    expect(renameAttempt.status).toBe(403); // or 404, depending on your getUserAccessRole return
  });
});



