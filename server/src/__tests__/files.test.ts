import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';

describe('Files API', () => {
  let cookie: string;

  beforeAll(async () => {
    const email = `filetest-${Date.now()}@example.com`;
    await request(app).post('/api/auth/signup').send({ email, password: 'password123', name: 'File Tester' });
    const loginRes = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
    cookie = loginRes.headers['set-cookie'][0];
  });

  it('should reject upload without auth', async () => {
    const res = await request(app).post('/api/files/upload');
    expect(res.status).toBe(401);
  });

  it('should upload a file when authenticated', async () => {
    const res = await request(app)
      .post('/api/files/upload')
      .set('Cookie', cookie)
      .attach('file', Buffer.from('test content'), 'test.txt');
    expect(res.status).toBe(201);
    expect(res.body.file.name).toBe('test.txt');
  });
});