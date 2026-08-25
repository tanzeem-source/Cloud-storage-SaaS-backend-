import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { supabase } from '../config/supabase';
import { signToken } from '../utils/jwt';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// SIGNUP
export async function signup(req: Request, res: Response) {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Please enter all fields' });
  }

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (existing) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const password_hash = await bcrypt.hash(password, 10);

  const { data: user, error } = await supabase
    .from('users')
    .insert({ email, password_hash, name, auth_provider: 'local' })
    .select('id, email, name')
    .single();

  if (error || !user) {
    return res.status(500).json({ error: 'Failed to create user' });
  }

  const token = signToken({ userId: user.id, email: user.email });
  res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
  res.status(201).json({ user: { id: user.id, email: user.email, name: user.name } });
}

// LOGIN
export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, name, password_hash, auth_provider')
    .eq('email', email)
    .single();

  if (error || !user || user.auth_provider !== 'local' || !user.password_hash) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signToken({ userId: user.id, email: user.email });
  res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
  res.json({ user: { id: user.id, email: user.email, name: user.name } });
}

// LOGOUT
export async function logout(_req: Request, res: Response) {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
}

// GOOGLE OAUTH
export async function googleAuth(req: Request, res: Response) {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: 'idToken required' });
  }

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  if (!payload?.email) {
    return res.status(401).json({ error: 'Invalid Google token' });
  }

  const { data: existing } = await supabase
    .from('users')
    .select('id, email, name')
    .eq('email', payload.email)
    .single();

  let user = existing;

  if (!user) {
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        email: payload.email,
        name: payload.name,
        image_url: payload.picture,
        auth_provider: 'google',
        provider_id: payload.sub,
      })
      .select('id, email, name')
      .single();

    if (error || !newUser) {
      return res.status(500).json({ error: 'Failed to create user' });
    }
    user = newUser;
  }

  const token = signToken({ userId: user.id, email: user.email });
  res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
  res.json({ user });
}