import { useEffect, useState } from 'react';
import { loadPropertyOwner, type PropertyOwner } from '@/lib/property-owner';

export function OwnerInfo({ propertyId }: { propertyId: string }) {
  const [owner, setOwner] = useState<PropertyOwner | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    setStatus('loading');
    loadPropertyOwner(propertyId)
      .then((result) => { if (active) { setOwner(result); setStatus('ready'); } })
      .catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [propertyId]);

  return (
    <div className="owner-info">
      <span className="eyebrow">بيانات المالك (للموظفين فقط)</span>
      {status === 'loading' && <small>جارٍ التحميل...</small>}
      {status === 'error' && <small>تعذر تحميل بيانات المالك.</small>}
      {status === 'ready' && !owner && <small>لا توجد بيانات مسجلة لهذا العقار.</small>}
      {status === 'ready' && owner && (
        <div className="owner-info-grid">
          <span>الاسم <b>{owner.owner_name || '—'}</b></span>
          <span>الجوال <b dir="ltr">{owner.owner_phone || '—'}</b></span>
        </div>
      )}
    </div>
  );
}
