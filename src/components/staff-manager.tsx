import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

type EmployeeRecord = {
  id: string;
  displayName: string;
  phone: string;
  role: 'employee' | 'super_admin';
};

function employeeErrorMessage(status: number) {
  if (status === 409) return 'رقم الجوال لديه حساب دخول مسجل مسبقاً.';
  if (status === 400) return 'البيانات غير صالحة. تأكد من الاسم والرقم وأن كلمة المرور 6 أحرف على الأقل.';
  if (status === 403) return 'صلاحيتك لا تسمح بهذا الإجراء.';
  return 'تعذر إضافة الموظف. تحقق من الاتصال وحاول مجدداً.';
}

export function StaffManager({ currentStaffId }: { currentStaffId: string }) {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [loadError, setLoadError] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => onSnapshot(collection(db, 'employees'), (snapshot) => {
    const loaded = snapshot.docs.map((item) => {
      const data = item.data();
      return {
        id: item.id,
        displayName: String(data.displayName ?? ''),
        phone: String(data.phone ?? ''),
        role: data.role === 'super_admin' ? 'super_admin' as const : 'employee' as const,
      };
    });
    setEmployees(loaded.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ar')));
    setLoadError('');
  }, () => setLoadError('تعذر تحميل قائمة الموظفين.')), []);

  const addEmployee = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const displayName = String(data.get('displayName') ?? '').trim();
    const phone = String(data.get('phone') ?? '').replace(/\D/g, '');
    const password = String(data.get('password') ?? '');
    const confirmPassword = String(data.get('confirmPassword') ?? '');
    if (password !== confirmPassword) {
      setMessage('كلمة المرور وتأكيدها غير متطابقتين.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('session');
      const idToken = await user.getIdToken();
      const response = await fetch('/api/employees', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, phone, password }),
      });
      if (!response.ok) {
        setMessage(employeeErrorMessage(response.status));
        return;
      }
      form.reset();
      setAdding(false);
      setMessage('تمت إضافة الموظف بنجاح ويمكنه تسجيل الدخول الآن.');
    } catch {
      setMessage(employeeErrorMessage(0));
    } finally {
      setBusy(false);
    }
  };

  const saveName = async (employee: EmployeeRecord) => {
    const displayName = draftName.trim();
    if (!displayName) return;
    setBusy(true);
    setMessage('');
    try {
      await updateDoc(doc(db, 'employees', employee.id), { displayName });
      setEditingId(null);
      setMessage('تم تحديث اسم الموظف.');
    } catch {
      setMessage('تعذر تحديث اسم الموظف.');
    } finally {
      setBusy(false);
    }
  };

  const removeEmployee = async (employee: EmployeeRecord) => {
    if (!window.confirm(`هل تريد حذف صلاحية ${employee.displayName} ؟ لن يتمكن من إدارة العقارات بعد الآن.`)) return;
    setBusy(true);
    setMessage('');
    try {
      await deleteDoc(doc(db, 'employees', employee.id));
      setMessage('تم حذف الموظف وإلغاء صلاحياته.');
    } catch {
      setMessage('تعذر حذف الموظف.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="staff-manager">
      <div className="form-heading">
        <div><span className="eyebrow">الإدارة العامة</span><h2>إدارة الموظفين</h2></div>
        <button className="primary-button small" onClick={() => { setAdding((value) => !value); setMessage(''); }}>
          {adding ? <><X size={15} /> إلغاء</> : <><Plus size={15} /> موظف جديد</>}
        </button>
      </div>

      {adding && (
        <form className="add-staff-form" onSubmit={(event) => void addEmployee(event)}>
          <b>إضافة موظف جديد</b>
          <input name="displayName" required maxLength={80} placeholder="الاسم الظاهر" />
          <input name="phone" inputMode="tel" required placeholder="رقم الجوال" />
          <input name="password" type="password" required minLength={6} placeholder="كلمة المرور" />
          <input name="confirmPassword" type="password" required minLength={6} placeholder="تأكيد كلمة المرور" />
          <button className="primary-button small" disabled={busy}>{busy ? 'جارٍ الحفظ...' : 'حفظ'}</button>
        </form>
      )}

      {message && <div className="form-note">{message}</div>}
      {loadError && <div className="form-error">{loadError}</div>}

      <div className="staff-list">
        {employees.map((employee) => (
          <div className="staff-row" key={employee.id}>
            <div>
              <b>{employee.displayName || 'بدون اسم'}</b>
              <small>{employee.role === 'super_admin' ? 'إدارة عامة' : 'موظف'}</small>
            </div>
            <span dir="ltr">{employee.phone}</span>
            {editingId === employee.id ? (
              <input value={draftName} maxLength={80} onChange={(event) => setDraftName(event.target.value)} aria-label="الاسم الظاهر" />
            ) : <span />}
            {editingId === employee.id ? (
              <button className="primary-button small" disabled={busy} onClick={() => void saveName(employee)}>حفظ</button>
            ) : (
              <button className="refresh-button" disabled={busy} onClick={() => { setEditingId(employee.id); setDraftName(employee.displayName); setMessage(''); }}><Pencil size={14} /> تعديل</button>
            )}
            <button className="danger-button" disabled={busy || employee.id === currentStaffId} onClick={() => void removeEmployee(employee)} aria-label="حذف الموظف"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
