import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type PropertyOwner = { owner_name: string; owner_phone: string };

export async function loadPropertyOwner(propertyId: string): Promise<PropertyOwner | null> {
  const snapshot = await getDoc(doc(db, 'property_owners', propertyId));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    owner_name: typeof data.owner_name === 'string' ? data.owner_name : '',
    owner_phone: typeof data.owner_phone === 'string' ? data.owner_phone : '',
  };
}

export function savePropertyOwner(propertyId: string, createdByStaffId: string, owner: PropertyOwner) {
  return setDoc(doc(db, 'property_owners', propertyId), {
    ...owner,
    created_by_staff_id: createdByStaffId,
  });
}
