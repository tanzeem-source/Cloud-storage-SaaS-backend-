import request from 'supertest';
import app from '../app';

export async function createTestUser(emailPrefix: string) {
  const email = `${emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = 'password123';

  await request(app).post('/api/auth/signup').send({ email, password, name: 'Test User' });
  const loginRes = await request(app).post('/api/auth/login').send({ email, password });
  const cookie = loginRes.headers['set-cookie'][0];

  return { email, password, cookie };
}

export async function uploadTestFile(cookie: string, filename = 'test.txt', folderId?: string) {
  const req = request(app)
    .post('/api/files/upload')
    .set('Cookie', cookie)
    .attach('file', Buffer.from('test content'), filename);

  if (folderId) req.field('folder_id', folderId);

  const res = await req;
  return res.body.file;
}