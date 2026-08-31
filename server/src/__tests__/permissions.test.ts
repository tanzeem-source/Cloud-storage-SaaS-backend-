import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import { createTestUser, uploadTestFile } from './helpers';


describe('Permission enforcement', () => {
  let owner: { email: string; cookie: string };
  let editor: { email: string; cookie: string };
  let stranger: { email: string; cookie: string };
  let fileId: string;

  beforeAll(async () => {
    owner = await createTestUser('permowner');
    editor = await createTestUser('permeditor');
    stranger = await createTestUser('permstranger');

    const file = await uploadTestFile(owner.cookie, 'perm-test.txt');
    fileId = file.id;

    await request(app)
      .post('/api/shares/user')
      .set('Cookie', owner.cookie)
      .send({ resource_type: 'file', resource_id: fileId, grantee_email: editor.email, role: 'editor' });
  });

  it('editor CAN rename the file', async () => {
    const res = await request(app)
      .patch(`/api/files/${fileId}/rename`)
      .set('Cookie', editor.cookie)
      .send({ name: 'renamed-by-editor.txt' });

    expect(res.status).toBe(200);
  });

  it('stranger CANNOT rename the file', async () => {
    const res = await request(app)
      .patch(`/api/files/${fileId}/rename`)
      .set('Cookie', stranger.cookie)
      .send({ name: 'hijacked.txt' });

    expect(res.status).toBe(403);
  });

  it('stranger CANNOT access download-url', async () => {
    const res = await request(app).get(`/api/files/${fileId}/download-url`).set('Cookie', stranger.cookie);
    expect(res.status).toBe(403);
  });

  it('editor CAN delete the file', async () => {
    const res = await request(app).delete(`/api/files/${fileId}`).set('Cookie', editor.cookie);
    expect(res.status).toBe(200);
  });
});


