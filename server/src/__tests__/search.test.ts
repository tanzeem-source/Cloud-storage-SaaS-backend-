import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import { createTestUser, uploadTestFile } from './helpers';


describe('Search API', () => {
  let cookie: string;

  beforeAll(async () => {
    ({ cookie } = await createTestUser('searchtest'));
    await uploadTestFile(cookie, 'unique-searchable-name.txt');
  });

  it('should reject search with no query', async () => {
    const res = await request(app).get('/api/search').set('Cookie', cookie);
    expect(res.status).toBe(400);
  });

  it('should find a file by partial name match', async () => {
    const res = await request(app).get('/api/search?q=searchable').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.results.some((f: any) => f.name === 'unique-searchable-name.txt')).toBe(true);
  });

  it('should return empty results for a non-matching query', async () => {
    const res = await request(app).get('/api/search?q=zzzznomatchzzzz').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(0);
  });

  it('should respect pagination limit', async () => {
    const res = await request(app).get('/api/search?q=searchable&limit=1').set('Cookie', cookie);
    expect(res.body.pagination.limit).toBe(1);
  });
});


