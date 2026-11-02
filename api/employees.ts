import type { IncomingMessage, ServerResponse } from 'node:http';
import { authenticateStaff, bearerToken, firestoreDocumentsUrl } from '../server/staff-auth';

type ApiRequest = IncomingMessage & { body?: unknown };
type ApiResponse = ServerResponse & {
  status(code: number): ApiResponse;
  json(body: unknown): void;
};

const identityBase = 'https://identitytoolkit.googleapis.com/v1/accounts';

function parseBody(body: unknown): Record<string, unknown> | null {
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) as unknown : body;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const idToken = bearerToken(req.headers.authorization);
  if (!idToken) return res.status(401).json({ error: 'Unauthorized' });

  const apiKey = process.env.VITE_FIREBASE_API_KEY;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId) {
    return res.status(500).json({ error: 'Server settings are incomplete' });
  }

  const body = parseBody(req.body);
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  const rawPhone = typeof body?.phone === 'string' ? body.phone : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const phone = rawPhone.replace(/\D/g, '');
  if (!displayName || displayName.length > 80) {
    return res.status(400).json({ error: 'Invalid employee name' });
  }
  if (!/^\d{9,15}$/.test(phone)) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }
  if (password.length < 6 || password.length > 128) {
    return res.status(400).json({ error: 'Password must be 6 to 128 characters' });
  }

  try {
    const staff = await authenticateStaff(idToken, apiKey, projectId);
    if (!staff.ok) return res.status(staff.status).json({ error: staff.error });
    if (staff.role !== 'super_admin') return res.status(403).json({ error: 'Super admin required' });

    const signUpResponse = await fetch(
      `${identityBase}:signUp?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `${phone}@durrat.internal`,
          password,
          returnSecureToken: true,
        }),
      },
    );
    if (!signUpResponse.ok) {
      const failure = await signUpResponse.json().catch(() => ({})) as { error?: { message?: string } };
      const message = failure.error?.message ?? '';
      if (message === 'EMAIL_EXISTS') return res.status(409).json({ error: 'Phone number already has a login' });
      if (message.startsWith('WEAK_PASSWORD')) return res.status(400).json({ error: 'Password is too weak' });
      return res.status(502).json({ error: 'Could not create the login' });
    }
    const created = await signUpResponse.json() as { localId?: string; idToken?: string };
    const uid = created.localId;
    if (!uid || !created.idToken) return res.status(502).json({ error: 'Could not create the login' });

    const profileResponse = await fetch(
      `${firestoreDocumentsUrl(projectId)}/employees/${encodeURIComponent(uid)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${staff.idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            displayName: { stringValue: displayName },
            phone: { stringValue: phone },
            role: { stringValue: 'employee' },
            active: { booleanValue: true },
          },
        }),
      },
    );
    if (!profileResponse.ok) {
      await fetch(`${identityBase}:delete?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: created.idToken }),
      });
      return res.status(502).json({ error: 'Could not save the employee profile' });
    }

    return res.status(201).json({ uid });
  } catch {
    return res.status(502).json({ error: 'Employee service unavailable' });
  }
}
