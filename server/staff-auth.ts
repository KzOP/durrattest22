export type StaffRole = 'employee' | 'super_admin';

export type StaffAuthResult =
  | { ok: true; uid: string; role: StaffRole; idToken: string }
  | { ok: false; status: 401 | 403; error: string };

export type FirestoreFields = Record<string, unknown>;

export function firestoreDocumentsUrl(projectId: string) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
}

export function bearerToken(authorization: unknown) {
  return typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';
}

export async function authenticateStaff(idToken: string, apiKey: string, projectId: string): Promise<StaffAuthResult> {
  if (!idToken) return { ok: false, status: 401, error: 'Unauthorized' };

  const identityResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!identityResponse.ok) return { ok: false, status: 401, error: 'Unauthorized' };
  const identity = await identityResponse.json() as {
    users?: Array<{ localId?: string; disabled?: boolean }>;
  };
  const user = identity.users?.[0];
  const uid = user?.localId;
  if (!uid || user.disabled === true) return { ok: false, status: 401, error: 'Unauthorized' };

  const employeeResponse = await fetch(
    `${firestoreDocumentsUrl(projectId)}/employees/${encodeURIComponent(uid)}`,
    { headers: { Authorization: `Bearer ${idToken}` } },
  );
  if (!employeeResponse.ok) return { ok: false, status: 403, error: 'Active employee required' };
  const employee = await employeeResponse.json() as { fields?: Record<string, { booleanValue?: boolean; stringValue?: string }> };
  const role = employee.fields?.role?.stringValue;
  if (employee.fields?.active?.booleanValue !== true) {
    return { ok: false, status: 403, error: 'Active employee required' };
  }
  if (role !== 'employee' && role !== 'super_admin') {
    return { ok: false, status: 403, error: 'Active employee required' };
  }

  return { ok: true, uid, role, idToken };
}
