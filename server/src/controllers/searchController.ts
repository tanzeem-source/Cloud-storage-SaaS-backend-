import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthRequest } from '../middleware/auth';

export async function searchFiles(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const query = (req.query.q as string) || '';
    const sortBy = (req.query.sort as string) || 'created_at';
    const order = (req.query.order as string) === 'asc' ? 'asc' : 'desc';
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 100);

    if (!query.trim()) {
      return res.status(400).json({ error: 'Search query (q) is required' });
    }

    const allowedSort = ['name', 'size_bytes', 'created_at'];
    const sortColumn = allowedSort.includes(sortBy) ? sortBy : 'created_at';

    // Call the RPC function instead of .textSearch()
    const { data, error } = await supabase.rpc('search_files', {
      search_query: query,
      owner: userId,
    });

    if (error) {
      return res.status(500).json({ error: 'Search failed', details: error.message });
    }

    // Sort + paginate in JS, since the SQL function returns unsorted/unpaginated rows for now
    const sorted = (data || []).sort((a: any, b: any) => {
      if (a[sortColumn] < b[sortColumn]) return order === 'asc' ? -1 : 1;
      if (a[sortColumn] > b[sortColumn]) return order === 'asc' ? 1 : -1;
      return 0;
    });

    const total = sorted.length;
    const offset = (page - 1) * limit;
    const paginated = sorted.slice(offset, offset + limit);

    res.json({
      results: paginated,
      pagination: {
        page,
        limit,
        total,
        totalPages: total ? Math.ceil(total / limit) : 0,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
}