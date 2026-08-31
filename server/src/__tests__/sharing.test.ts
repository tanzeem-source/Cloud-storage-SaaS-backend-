import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import { createTestUser, uploadTestFile } from './helpers';


describe('Sharing API', () => {
  let owner: { email: string; cookie: string };
  let viewer: { email: string; cookie: string };
  let fileId: string;

  beforeAll(async () => {
    owner = await createTestUser('shareowner');
    viewer = await createTestUser('shareviewer');
    const file = await uploadTestFile(owner.cookie, 'shared.txt');
    fileId = file.id;
  });

  it('should share a file with another user as viewer', async () => {
    const res = await request(app)
      .post('/api/shares/user')
      .set('Cookie', owner.cookie)
      .send({ resource_type: 'file', resource_id: fileId, grantee_email: viewer.email, role: 'viewer' });

    expect(res.status).toBe(201);
    expect(res.body.share.role).toBe('viewer');
  });

  it('should reject sharing by a non-owner', async () => {
    const res = await request(app)
      .post('/api/shares/user')
      .set('Cookie', viewer.cookie) // viewer trying to share, not owner
      .send({ resource_type: 'file', resource_id: fileId, grantee_email: owner.email, role: 'editor' });

    expect(res.status).toBe(403);
  });

  it('should create a public link with expiry', async () => {
    const res = await request(app)
      .post('/api/shares/link')
      .set('Cookie', owner.cookie)
      .send({ resource_type: 'file', resource_id: fileId, expires_in_hours: 1 });

    expect(res.status).toBe(201);
    expect(res.body.linkShare.token).toBeDefined();
  });

  it('should open a valid link and return a signed URL', async () => {
    const linkRes = await request(app)
      .post('/api/shares/link')
      .set('Cookie', owner.cookie)
      .send({ resource_type: 'file', resource_id: fileId, expires_in_hours: 1 });

    const openRes = await request(app)
      .post(`/api/shares/link/${linkRes.body.linkShare.token}`)
      .set('Cookie', viewer.cookie);

    expect(openRes.status).toBe(200);
    expect(openRes.body.downloadUrl).toContain('supabase.co');
  });

  it('should reject opening a link for a trashed file', async () => {
    const trashedFile = await uploadTestFile(owner.cookie, 'to-trash.txt');
    const linkRes = await request(app)
      .post('/api/shares/link')
      .set('Cookie', owner.cookie)
      .send({ resource_type: 'file', resource_id: trashedFile.id, expires_in_hours: 1 });

    await request(app).delete(`/api/files/${trashedFile.id}`).set('Cookie', owner.cookie);

    const openRes = await request(app)
      .post(`/api/shares/link/${linkRes.body.linkShare.token}`)
      .set('Cookie', viewer.cookie);

    expect(openRes.status).toBe(404);
  });

  it('should reject opening a nonexistent link token', async () => {
    const res = await request(app)
      .post('/api/shares/link/nonexistenttoken123')
      .set('Cookie', viewer.cookie);

    expect(res.status).toBe(404);
  });
});


