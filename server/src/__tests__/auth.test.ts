import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import app from '../app';

describe('Auth API', () => {
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = 'password123';

  it('should reject signup with missing fields', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email: testEmail });
    expect(res.status).toBe(400);
  });

  it('should sign up a new user', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: testEmail, password: testPassword, name: 'Test User' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(testEmail);
  });

  it('should reject duplicate signup', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: testEmail, password: testPassword, name: 'Test User' });
    expect(res.status).toBe(409);
  });

  it('should log in with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: testPassword });
    expect(res.status).toBe(200);
  });

  it('should reject login with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });
});