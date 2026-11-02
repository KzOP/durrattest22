import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { auth, db, firebaseConfigReady, storage } from '@/lib/firebase';
import { browserSessionPersistence, onAuthStateChanged, setPersistence, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadString } from 'firebase/storage';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Building2, ChevronDown, ExternalLink, Eye, FilePenLine, LockKeyhole, MapPin, Menu, MessageCircle, Moon, Plus, Search, Sun, Trash2, X, Layers as Layers3, MapPinned, Navigation, Share2, Phone, ClipboardList, LayoutGrid, RefreshCw, Users } from 'lucide-react';
import { createPortal } from 'react-dom';
import { StaffManager } from '@/components/staff-manager';
import { OwnerInfo } from '@/components/owner-info';
import { formatListingLabel, formatPrice, type RentPeriod } from '@/lib/listing-format';
import { loadPropertyOwner, savePropertyOwner } from '@/lib/property-owner';
import { publisherPhone, whatsappUrl } from '@/lib/whatsapp';
import { watermarkImage } from '@/lib/watermark';

type Staff = { id: string; display_name: string; phone: string; role: 'employee' | 'super_admin'; active: boolean };
type Property = {
  id: string; created_by_staff_id: string | null; created_by_name: string; publisher_name?: string; publisher_phone?: string; contact_phone?: string;
  listing_type: 'sale' | 'rent'; rent_period?: RentPeriod; property_type: string; title: string; city: string; district: string;
  street: string; price: number; area: number; rooms: number; lounges: number; floors: number; kitchens: number;
  bathrooms: number; floor_number: number; has_roof: boolean; has_elevator: boolean; notes: string;
  latitude: number | null; longitude: number | null; images: string[]; published: boolean;
  created_at: string; serial_number?: number;
};
type FormState = Omit<Property, 'id' | 'created_by_staff_id' | 'created_by_name' | 'publisher_name' | 'publisher_phone' | 'contact_phone' | 'created_at'> & {
  images: string[]; owner_name: string; owner_phone: string;
};

const officePhone = '0569996744';
const whatsappNumber = '0569996744';
const logo = '/images/image.png';
const allPropertyTypes = ['شقة', 'فيلا', 'أرض', 'دور', 'عمارة', 'محل', 'مزرعة', 'حوش', 'ستوديو', 'بيت', 'أرض خام', 'أرض تجارية'];
type CategoryDef = { type: string; label: string };
const saleCategories: CategoryDef[] = [
  { type: 'الكل', label: 'الكل' },
  { type: 'عمارة', label: 'عمارة للبيع' },
  { type: 'فيلا', label: 'فيلا للبيع' },
  { type: 'أرض', label: 'أرض للبيع' },
  { type: 'شقة', label: 'شقة للبيع' },
  { type: 'محل', label: 'محل للبيع' },
  { type: 'مزرعة', label: 'مزرعة للبيع' },
  { type: 'بيت', label: 'بيت للبيع' },
  { type: 'أرض خام', label: 'أرض خام للبيع' },
  { type: 'دور', label: 'دور للبيع' },
  { type: 'ستوديو', label: 'ستوديو للبيع' },
  { type: 'حوش', label: 'حوش للبيع' },
];
const rentCategories: CategoryDef[] = [
  { type: 'الكل', label: 'الكل' },
  { type: 'عمارة', label: 'عمارة للإيجار' },
  { type: 'فيلا', label: 'فيلا للإيجار' },
  { type: 'أرض تجارية', label: 'أرض تجارية للإيجار' },
  { type: 'شقة', label: 'شقة للإيجار' },
  { type: 'دور', label: 'دور للإيجار' },
  { type: 'محل', label: 'محل للإيجار' },
  { type: 'مزرعة', label: 'مزرعة للإيجار' },
  { type: 'ستوديو', label: 'ستوديو للإيجار' },
];
const licenseNumber = '1200007348';
const initialForm: FormState = {
  listing_type: 'sale', rent_period: 'annual', property_type: 'شقة', title: '', city: '', district: '', street: '', price: 0,
  area: 0, rooms: 0, lounges: 0, floors: 0, kitchens: 0, bathrooms: 0, floor_number: 0, has_roof: false,
  has_elevator: false, notes: '', latitude: null, longitude: null, images: [], published: true,
  owner_name: '', owner_phone: '',
};

function MapClickHandler({ onSelect }: { onSelect: (latitude: number, longitude: number) => void }) {
  useMapEvents({ click: ({ latlng }) => onSelect(latlng.lat, latlng.lng) });
  return null;
}

function OfficeMap() {
  return (
    <MapContainer center={[24.64, 46.68]} zoom={13} scrollWheelZoom className="leaflet-map">
      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <CircleMarker center={[24.64, 46.68]} radius={10} pathOptions={{ color: '#bd9135', fillColor: '#efc968', fillOpacity: 0.85 }} />
    </MapContainer>
  );
}

function LocationPicker({ latitude, longitude, onSelect }: { latitude: number | null; longitude: number | null; onSelect: (latitude: number, longitude: number) => void }) {
  const position: [number, number] = latitude !== null && longitude !== null ? [latitude, longitude] : [24.7136, 46.6753];
  return (
    <div className="location-map">
      <MapContainer center={position} zoom={latitude !== null ? 15 : 11} scrollWheelZoom className="leaflet-map">
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapClickHandler onSelect={onSelect} />
        {latitude !== null && longitude !== null && <CircleMarker center={position} radius={10} pathOptions={{ color: '#bd9135', fillColor: '#efc968', fillOpacity: 0.85 }} />}
      </MapContainer>
    </div>
  );
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    } else {
      map.setView([24.7136, 46.6753], 11);
    }
  }, [map, positions]);
  return null;
}

function FloatingMap({ properties, onSelect }: { properties: Property[]; onSelect: (property: Property) => void }) {
  const mapped = properties.filter((p) => p.latitude !== null && p.longitude !== null);
  const positions = mapped.map((p) => [p.latitude!, p.longitude!] as [number, number]);
  const center: [number, number] = positions.length > 0 ? positions[0] : [24.7136, 46.6753];
  const createPin = (serial: number | undefined) => L.divIcon({
    className: 'custom-pin',
    html: `<div class="pin-inner">${serial ?? '•'}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -26],
  });
  return (
    <div className="floating-map-wrapper">
      <div className="floating-map-header">
        <span className="eyebrow">خريطة العقارات</span>
        <h3>مواقع العقارات على الخريطة</h3>
        <small>{mapped.length} عقار موقع</small>
      </div>
      <MapContainer center={center} zoom={12} scrollWheelZoom className="floating-map">
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {mapped.map((property) => (
          <Marker key={property.id} position={[property.latitude!, property.longitude!]} icon={createPin(property.serial_number)}>
            <Popup>
              <div className="map-popup">
                <span className="serial-badge">#{property.serial_number ?? '—'}</span>
                <strong>{property.title}</strong>
                <em className="card-price">{formatPrice(property.price, property.listing_type, property.rent_period)}</em>
                <small><MapPin size={11} /> {property.city} — {property.district}</small>
                <button className="primary-button small" onClick={() => onSelect(property)}>عرض التفاصيل</button>
              </div>
            </Popup>
          </Marker>
        ))}
        <FitBounds positions={positions} />
      </MapContainer>
    </div>
  );
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('timeout')), milliseconds);
    promise.then((value) => { window.clearTimeout(timer); resolve(value); }).catch((error: unknown) => { window.clearTimeout(timer); reject(error); });
  });
}

function phoneAlias(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@durrat.internal`;
}

function loginErrorMessage(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';

  if (code === 'auth/api-key-not-valid' || code === 'auth/invalid-api-key') {
    return 'إعداد Firebase غير صحيح. راجع VITE_FIREBASE_API_KEY في إعدادات النشر ثم أعد البناء.';
  }
  if (code === 'auth/network-request-failed') {
    return 'تعذر الاتصال بـ Firebase. تحقق من الاتصال بالإنترنت وإعدادات النطاقات المسموح بها.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'تسجيل الدخول بالبريد وكلمة المرور غير مفعّل في Firebase Authentication.';
  }
  if (code === 'permission-denied' || code === 'firestore/permission-denied') {
    return 'تم تسجيل الدخول، لكن تعذر قراءة صلاحية الموظف. راجع قواعد Firestore المنشورة.';
  }
  if (code === 'auth/too-many-requests') {
    return 'تم إيقاف المحاولات مؤقتاً لكثرتها. انتظر قليلاً ثم حاول مجدداً.';
  }
  return 'بيانات الدخول غير صحيحة أو تعذر التحقق من الحساب. تحقق من الرقم وكلمة المرور وإعدادات Firebase.';
}

async function sendTelegramNotification(propertyId: string) {
  const user = auth.currentUser;
  if (!user) throw new Error('Employee session is unavailable');
  const idToken = await user.getIdToken();
  const response = await fetch('/api/telegram-notify', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ propertyId }),
  });
  const result = await response.json().catch(() => null) as {
    notificationSent?: boolean;
    sent?: boolean;
    warning?: string;
    error?: string;
    code?: string;
  } | null;

  if (!response.ok) {
    throw new Error(
      `Telegram API request failed (${response.status})${result?.code ? ` [${result.code}]` : ''}: ${result?.error ?? 'No error details returned'}`,
    );
  }

  if (result?.notificationSent !== true && result?.sent !== true) {
    throw new Error(
      `${result?.code ?? 'TELEGRAM_DELIVERY_FAILED'}: ${result?.warning ?? 'The server did not confirm notification delivery'}`,
    );
  }
}

async function uploadWatermarkedImages(propertyId: string, images: string[]): Promise<string[]> {
  return Promise.all(images.map(async (image, index) => {
    if (!image.startsWith('data:')) return image;
    try {
      const imageRef = storageRef(storage, `properties/${propertyId}/image-${index}.jpg`);
      return await withTimeout((async () => {
        await uploadString(imageRef, image, 'data_url', { contentType: 'image/jpeg' });
        return getDownloadURL(imageRef);
      })(), 5000);
    } catch {
      return image;
    }
  }));
}

function App() {
  const [dark, setDark] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '' });
  const [staff, setStaff] = useState<Staff | null>(null);
  const [modal, setModal] = useState<'login' | 'form' | 'details' | 'staff' | null>(null);
  const [selected, setSelected] = useState<Property | null>(null);
  const [loginMessage, setLoginMessage] = useState('');
  const [helpVisible, setHelpVisible] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'sale' | 'rent'>('rent');
  const [selectedType, setSelectedType] = useState('الكل');
  const [form, setForm] = useState<FormState>(initialForm);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const isAdmin = staff?.role === 'super_admin' && staff.active;

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void setPersistence(auth, browserSessionPersistence).then(() => {
      if (!active) return;
      unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (!user) {
          setStaff(null);
          return;
        }
        try {
          const employeeSnapshot = await getDoc(doc(db, 'employees', user.uid));
          const employee = employeeSnapshot.data();
          if (!employeeSnapshot.exists() || employee?.active !== true || !['employee', 'super_admin'].includes(employee?.role)) {
            await signOut(auth);
            setStaff(null);
          } else {
            setStaff({
              id: user.uid,
              display_name: String(employee.displayName ?? ''),
              phone: String(employee.phone ?? ''),
              role: employee.role === 'super_admin' ? 'super_admin' : 'employee',
              active: true,
            });
          }
        } catch {
          setStaff(null);
          setNotice('تعذر التحقق من صلاحيات الموظف.');
        }
      });
    }).catch(() => {
      setNotice('تعذر تهيئة جلسة الدخول.');
    });
    return () => { active = false; unsubscribe?.(); };
  }, []);

  useEffect(() => {
    const propertyCollection = collection(db, 'properties');
    const propertiesQuery = staff
      ? query(propertyCollection, orderBy('created_at', 'desc'))
      : query(propertyCollection, where('published', '==', true));
    return onSnapshot(propertiesQuery, (snapshot) => {
      const loaded = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Property)
        .filter((property) => property.published || Boolean(staff))
        .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
      const sorted = [...loaded].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
      const existingMax = Math.max(0, ...loaded.map((p) => p.serial_number ?? 0));
      let nextSerial = existingMax;
      sorted.forEach((property) => {
        if (property.serial_number == null) {
          nextSerial += 1;
          property.serial_number = nextSerial;
          void updateDoc(doc(db, 'properties', property.id), { serial_number: nextSerial });
        }
      });
      setProperties(loaded);
      setLoading(false);
    }, () => setLoading(false));
  }, [staff]);

  useEffect(() => {
    const propertyId = new URLSearchParams(window.location.search).get('property');
    const property = propertyId ? properties.find((item) => item.id === propertyId) : null;
    if (property && !selected) { setSelected(property); setModal('details'); }
  }, [properties, selected]);

  const cities = useMemo(() => [...new Set(properties.map((property) => property.city).filter(Boolean))], [properties]);
  const districts = useMemo(() => [...new Set(properties.map((property) => property.district).filter(Boolean))], [properties]);
  const visibleProperties = useMemo(() => properties.filter((property) => {
    const search = filters.search.trim().toLowerCase();
    const matchesSearch = !search || [property.title, property.city, property.district, property.street].some((value) => value.toLowerCase().includes(search));
    const matchesListing = property.listing_type === activeTab;
    const matchesType = selectedType === 'الكل' || property.property_type === selectedType;
    return matchesSearch && matchesListing && matchesType;
  }), [properties, filters, activeTab, selectedType]);

  const updateForm = (key: keyof FormState, value: string | number | boolean | null | string[]) => setForm((current) => ({ ...current, [key]: value }));
  const scrollToListings = () => document.getElementById('listings')?.scrollIntoView({ behavior: 'smooth' });
  const openNewForm = () => { setForm(initialForm); setSelected(null); setModal('form'); };
  const openEditForm = (property: Property) => {
    setForm({
      listing_type: property.listing_type, rent_period: property.rent_period ?? 'annual', property_type: property.property_type, title: property.title,
      city: property.city, district: property.district, street: property.street, price: property.price,
      area: property.area ?? 0, rooms: property.rooms, lounges: property.lounges, floors: property.floors, kitchens: property.kitchens,
      bathrooms: property.bathrooms, floor_number: property.floor_number, has_roof: property.has_roof,
      has_elevator: property.has_elevator, notes: property.notes, latitude: property.latitude,
      longitude: property.longitude, images: property.images, published: property.published,
      owner_name: '', owner_phone: '',
    });
    setSelected(property);
    setModal('form');
    void loadPropertyOwner(property.id)
      .then((owner) => { if (owner) setForm((current) => ({ ...current, ...owner })); })
      .catch(() => setNotice('تعذر تحميل بيانات المالك. أدخلها من جديد قبل الحفظ.'));
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const loginForm = event.currentTarget;
    const formData = new FormData(event.currentTarget);
    const phone = String(formData.get('phone') ?? '');
    const password = String(formData.get('password') ?? '');
    try {
      if (!firebaseConfigReady) {
        setLoginMessage('إعداد Firebase غير مكتمل: أضف VITE_FIREBASE_API_KEY في .env محلياً أو إعدادات Vercel ثم أعد البناء.');
        return;
      }
      await setPersistence(auth, browserSessionPersistence);
      const credential = await signInWithEmailAndPassword(auth, phoneAlias(phone), password);
      const employeeSnapshot = await getDoc(doc(db, 'employees', credential.user.uid));
      const employee = employeeSnapshot.data();
      if (!employeeSnapshot.exists() || employee?.active !== true || !['employee', 'super_admin'].includes(employee?.role)) {
        await signOut(auth);
        setLoginMessage('الحساب لا يملك سجل موظف نشطاً مطابقاً في employees/{Auth UID}. اطلب من مسؤول Firebase مراجعة ربط UID والدور وحالة active.');
        return;
      }
      setStaff({
        id: credential.user.uid,
        display_name: String(employee.displayName ?? ''),
        phone: String(employee.phone ?? phone),
        role: employee.role === 'super_admin' ? 'super_admin' : 'employee',
        active: true,
      });
      setLoginMessage('');
      setModal(null);
      loginForm.reset();
    } catch (error) {
      setLoginMessage(loginErrorMessage(error));
    } finally {
      const passwordInput = loginForm.elements.namedItem('password') as HTMLInputElement | null;
      if (passwordInput) passwordInput.value = '';
    }
  };

  const handleLogout = () => {
    void signOut(auth);
    setStaff(null);
    setModal(null);
    setNotice('تم تسجيل الخروج بنجاح.');
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    try {
      const images = await Promise.all(Array.from(files).slice(0, 6).map(watermarkImage));
      updateForm('images', [...form.images, ...images].slice(0, 6));
    } catch { setNotice('تعذر معالجة إحدى الصور. يرجى المحاولة مرة أخرى.'); }
  };

  const selectLocation = async (latitude: number, longitude: number) => {
    updateForm('latitude', latitude); updateForm('longitude', longitude);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=ar`);
      const result = await response.json() as { address?: { city?: string; town?: string; village?: string; suburb?: string; neighbourhood?: string; road?: string } };
      const address = result.address ?? {};
      updateForm('city', address.city ?? address.town ?? address.village ?? '');
      updateForm('district', address.suburb ?? address.neighbourhood ?? ''); updateForm('street', address.road ?? '');
      setNotice('تم تحديد الدبوس واستخراج العنوان.');
    } catch { setNotice('تم تحديد الدبوس، تعذر استخراج اسم العنوان.'); }
  };

  const saveProperty = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!staff || saving) return;
    setSaving(true); setNotice('');
    try {
      const { owner_name, owner_phone, ...propertyFields } = form;
      const propertyRef = selected ? doc(db, 'properties', selected.id) : doc(collection(db, 'properties'));
      const imageUrls = await uploadWatermarkedImages(propertyRef.id, form.images);
      const isEditing = Boolean(selected);
      const serialNumber = selected?.serial_number ?? (properties.length > 0 ? Math.max(...properties.map((p) => p.serial_number ?? 0)) + 1 : 1);
      const creatorId = selected?.created_by_staff_id ?? staff.id;
      const payload = {
        ...propertyFields,
        images: imageUrls,
        serial_number: serialNumber,
        created_by_staff_id: creatorId,
        created_by_name: selected?.created_by_name ?? staff.display_name,
        publisher_name: selected ? (selected.publisher_name || selected.created_by_name) : staff.display_name,
        publisher_phone: selected ? (selected.publisher_phone || selected.contact_phone || '') : staff.phone,
        created_at: selected?.created_at ?? new Date().toISOString(),
      };
      await setDoc(propertyRef, payload);
      await savePropertyOwner(propertyRef.id, creatorId, { owner_name: owner_name.trim(), owner_phone: owner_phone.trim() });
      let saveMessage = isEditing ? 'تم تحديث العقار بنجاح.' : 'تم حفظ العقار بنجاح.';
      if (!isEditing) {
        try {
          await sendTelegramNotification(propertyRef.id);
        } catch (error) {
          console.error('[property-save] Telegram notification failed after the property was saved', {
            propertyId: propertyRef.id,
            error,
          });
          saveMessage = 'تم حفظ العقار، لكن تعذر تأكيد وصول إشعار تيليجرام بعد تجربة الإرسال الاحتياطية.';
        }
      }
      setNotice(saveMessage);
      setSaving(false); setModal(null); setSelected(null);
    } catch {
      setNotice('تعذر حفظ العقار. تحقق من البيانات وحاول مرة أخرى.');
    } finally {
      setSaving(false);
    }
  };

  const deleteProperty = async (property: Property) => {
    if (!staff || (!isAdmin && property.created_by_staff_id !== staff.id) || !window.confirm('هل تريد حذف هذا العقار؟')) return;
    try {
      await deleteDoc(doc(db, 'properties', property.id));
      await deleteDoc(doc(db, 'property_owners', property.id)).catch(() => undefined);
      setNotice('تم حذف العقار من الموقع.');
    } catch {
      setNotice('تعذر حذف العقار.');
    }
  };

  return (
    <div dir="rtl" className={dark ? 'app dark' : 'app light'}>
      <header className="site-header">
        <div className="header-inner">
          <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="الرئيسية"><img src={logo} alt="درة الهجرة للعقارات" /><span>درة الهجرة للعقارات</span></button>
          <nav className="desktop-nav"><button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>الرئيسية</button><button onClick={() => { setActiveTab('rent'); setSelectedType('الكل'); scrollToListings(); }}>عقارات للإيجار</button><button onClick={() => { setActiveTab('sale'); setSelectedType('الكل'); scrollToListings(); }}>عقارات للبيع</button><a href="https://goo.gl/maps/hP8rVmqhAiBm2XRcA" target="_blank" rel="noreferrer">موقع المكتب <ExternalLink size={14} /></a></nav>
          <div className="header-actions"><button className="icon-button" onClick={() => setDark((value) => !value)} aria-label="تبديل الوضع">{dark ? <Sun size={19} /> : <Moon size={19} />}</button><button className="mobile-menu icon-button" aria-label="القائمة" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((value) => !value)}><Menu size={20} /></button></div>
        </div>
      </header>

      {mobileNavOpen && createPortal(<div className="mobile-nav-overlay" onClick={() => setMobileNavOpen(false)}><nav className="mobile-nav" onClick={(event) => event.stopPropagation()}><button onClick={() => { setMobileNavOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>الرئيسية</button><button onClick={() => { setMobileNavOpen(false); setActiveTab('rent'); setSelectedType('الكل'); scrollToListings(); }}>عقارات للإيجار</button><button onClick={() => { setMobileNavOpen(false); setActiveTab('sale'); setSelectedType('الكل'); scrollToListings(); }}>عقارات للبيع</button><a href="https://goo.gl/maps/hP8rVmqhAiBm2XRcA" target="_blank" rel="noreferrer" onClick={() => setMobileNavOpen(false)}>موقع المكتب <ExternalLink size={14} /></a>{staff ? <button onClick={() => { setMobileNavOpen(false); handleLogout(); }}><LockKeyhole size={14} /> تسجيل الخروج</button> : <button onClick={() => { setMobileNavOpen(false); setLoginMessage(''); setModal('login'); }}><LockKeyhole size={14} /> دخول الموظفين</button>}</nav></div>, document.body)}

      <main className="dashboard-main">
        <section className="dashboard-hero">
          <div className="dashboard-heading"><span className="eyebrow">منصة درة الهجرة</span><h1>عروضي العقارية</h1><p>كل عروضك العقارية في مكان واحد، بوضوح وسهولة.</p></div>
          <a className="office-location" href="https://goo.gl/maps/hP8rVmqhAiBm2XRcA" target="_blank" rel="noreferrer"><MapPin size={18} /><span>موقع<br /><b>المكتب</b></span></a>
          <div className="work-hours-note"><Phone size={15} /><span>يمكنكم الاتصال بنا في أوقات العمل الرسمية<br /><b>9ص-12م، العصر-12ص</b></span></div><div className="stats-grid"><div className="stat-card"><span className="stat-icon"><LayoutGrid size={17} /></span><strong>{properties.length}</strong><small>إجمالي العروض</small></div><div className="stat-card"><span className="stat-icon"><MapPin size={17} /></span><strong>{properties.filter((property) => property.latitude !== null).length}</strong><small>على الخريطة</small></div><div className="stat-card work-hours-card"><span className="stat-icon"><Phone size={17} /></span><strong>ساعات العمل</strong><small>9ص-12م · العصر-12ص</small></div></div>
          <div className="contact-cards"><a className="whatsapp-banner" href={whatsappUrl(whatsappNumber)} target="_blank" rel="noreferrer"><span className="contact-symbol"><MessageCircle size={31} /></span><span><small>التواصل عبر الواتساب</small><b>{whatsappNumber}</b></span><ChevronDown size={24} className="contact-arrow" /></a><div className="license-banner"><span className="license-symbol"><ClipboardList size={30} /></span><span><small>رقم الرخصة العقارية</small><b>{licenseNumber}</b></span></div></div>
          <div className="dashboard-footer"><span>تواصل معنا لإضافة العروض والطلبات</span><span>آخر تحديث: {new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium' }).format(new Date())}</span></div>
        </section>

        <section className="view-tabs listing-type-tabs" id="listings"><button className={activeTab === 'rent' ? 'active' : ''} onClick={() => { setActiveTab('rent'); setSelectedType('الكل'); }}>عقارات للإيجار <b>{properties.filter((property) => property.listing_type === 'rent').length}</b></button><button className={activeTab === 'sale' ? 'active' : ''} onClick={() => { setActiveTab('sale'); setSelectedType('الكل'); }}>عقارات للبيع <b>{properties.filter((property) => property.listing_type === 'sale').length}</b></button></section>

        <section className="category-chips-bar"><div className="chips-track">{(activeTab === 'sale' ? saleCategories : rentCategories).map((cat) => { const count = cat.type === 'الكل' ? properties.filter((p) => p.listing_type === activeTab).length : properties.filter((p) => p.listing_type === activeTab && p.property_type === cat.type).length; const isActive = selectedType === cat.type; return <button key={cat.type} className={`chip ${isActive ? 'active' : ''} ${count === 0 && cat.type !== 'الكل' ? 'empty' : ''}`} onClick={() => setSelectedType(cat.type)}><span className="chip-label">{cat.label}</span>{count > 0 && <span className="chip-count">{count}</span>}{count === 0 && cat.type !== 'الكل' && <span className="chip-empty-dot" />}</button>; })}</div></section>

        <section className="filter-panel"><div className="filter-row"><label className="filter-search"><Search size={16} /><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="ابحث باسم العقار أو المدينة أو الحي" /></label><select value={filters.search && cities.includes(filters.search) ? filters.search : ''} onChange={(event) => setFilters({ ...filters, search: event.target.value })}><option value="">المدينة</option>{cities.map((city) => <option key={city}>{city}</option>)}</select><select value={filters.search && districts.includes(filters.search) ? filters.search : ''} onChange={(event) => setFilters({ ...filters, search: event.target.value })}><option value="">الحي</option>{districts.map((district) => <option key={district}>{district}</option>)}</select></div></section>

        <FloatingMap properties={visibleProperties} onSelect={(property) => { setSelected(property); setModal('details'); }} />

        <section className="listings-section listing-results"><div className="section-top"><div><span className="eyebrow">مكتبة العروض</span><h2>العروض العقارية</h2></div><div className="section-actions">{isAdmin && <button className="outline-button" onClick={() => setModal('staff')}><Users size={15} /> إدارة الموظفين</button>}{staff && <button className="primary-button small" onClick={openNewForm}><Plus size={17} /> إضافة عقار</button>}</div></div><div className="results-meta"><span>{visibleProperties.length} عرض متاح</span><button className="refresh-button" onClick={() => window.location.reload()}><RefreshCw size={14} /> تحديث</button></div>
          {loading ? <div className="empty-state"><span className="loader" /> جاري تحميل العقارات</div> : visibleProperties.length === 0 ? <div className="empty-state"><Building2 size={38} /><p>لا توجد عقارات مطابقة للبحث</p><small>جرّب تغيير خيارات البحث أو التصنيف.</small></div> : <div className="property-grid">{visibleProperties.map((property) => <article className="property-card" key={property.id}><div className="card-topline"><span className="serial-badge">#{property.serial_number ?? '—'}</span><span className={`listing-badge ${property.listing_type}`}>{formatListingLabel(property.listing_type, property.rent_period)}</span></div><button className="card-image" onClick={() => { setSelected(property); setModal('details'); }}><img src={property.images[0] || logo} alt={property.title} /><span className="view-icon"><Eye size={17} /></span></button><div className="card-body"><h3>{property.title}</h3><div className="card-location"><MapPin size={14} /> {property.city} — {property.district}{property.street && ` — ${property.street}`}</div><p className="card-description">{property.notes || `عرض عقاري مميز في ${property.city || 'موقع مميز'}، تواصل معنا لمعرفة التفاصيل.`}</p><strong className="card-price">{formatPrice(property.price, property.listing_type, property.rent_period)}</strong>{property.area > 0 && <span className="card-area"><Layers3 size={13} /> {new Intl.NumberFormat('ar-SA').format(property.area)} م²</span>}<div className="card-actions"><a className="location-action" href={property.latitude && property.longitude ? `https://www.google.com/maps/search/?api=1&query=${property.latitude},${property.longitude}` : 'https://goo.gl/maps/hP8rVmqhAiBm2XRcA'} target="_blank" rel="noreferrer"><Navigation size={15} /> الموقع</a><a className="whatsapp-action" href={whatsappUrl(publisherPhone(property), `السلام عليكم ورحمة الله وبركاته، أنا مهتم بالإعلان رقم ${property.serial_number ?? ''}`)} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a><button className="share-action" onClick={() => { void navigator.share?.({ title: property.title, text: property.title, url: `${window.location.origin}/?property=${property.id}` }); }}><Share2 size={15} /> مشاركة</button></div><div className="card-owner">بواسطة {property.publisher_name || property.created_by_name}</div>{(isAdmin || staff?.id === property.created_by_staff_id) && <div className="owner-actions"><button onClick={() => openEditForm(property)}><FilePenLine size={14} /> تعديل</button><button onClick={() => void deleteProperty(property)}><Trash2 size={14} /> حذف</button></div>}</div></article>)}</div>}
        </section>

        <section className="office-section"><div className="office-copy"><span className="eyebrow">موقع المكتب</span><h2>درة الهجرة للعقارات</h2><p>الجوال متاح يومياً من 9:00 صباحاً إلى 12:00 ظهراً، ومن صلاة العصر حتى 12:00 ليلاً.</p><p>موقع المكتب متاح خلال ساعات التواصل المذكورة أعلاه.</p><a className="outline-button" href="https://goo.gl/maps/hP8rVmqhAiBm2XRcA" target="_blank" rel="noreferrer"><MapPin size={17} /> فتح الموقع في قوقل ماب</a></div><div className="map-frame"><OfficeMap /></div></section>
      </main>

      <footer className="site-footer"><div className="footer-inner"><div className="footer-brand"><img src={logo} alt="" /><span>مكتب درة الهجرة للعقارات</span></div><div className="footer-contact"><a href={`tel:${officePhone}`}><MessageCircle size={17} /> {officePhone}</a><a href="https://goo.gl/maps/hP8rVmqhAiBm2XRcA" target="_blank" rel="noreferrer"><MapPin size={17} /> موقع المكتب</a></div><button className="staff-link" onClick={() => staff ? handleLogout() : (setLoginMessage(''), setModal('login'))}><LockKeyhole size={12} /> {staff ? 'تسجيل الخروج' : 'دخول الموظفين'}</button></div><div className="copyright">© {new Date().getFullYear()} درة الهجرة للعقارات</div></footer>
      {helpVisible && <div className="help-bubble"><button onClick={() => setHelpVisible(false)} aria-label="إغلاق"><X size={15} /></button><span>تحتاج مساعدة؟ تواصل معنا</span></div>}<a className="floating-whatsapp" href={whatsappUrl(whatsappNumber)} target="_blank" rel="noreferrer" aria-label="واتساب"><MessageCircle size={24} /></a>{notice && <div className="toast" role="status">{notice}</div>}

      {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}><div className={`modal ${modal === 'form' || modal === 'staff' ? 'wide-modal' : ''}`}>
        <button className="modal-close" onClick={() => setModal(null)} aria-label="إغلاق"><X size={19} /></button>
        {modal === 'login' && <div className="login-modal"><div className="modal-icon"><LockKeyhole size={22} /></div><span className="eyebrow">بوابة المكتب</span><h2>دخول الموظفين</h2><p>استخدم رقم الجوال وكلمة المرور المعتمدة.</p><form onSubmit={handleLogin}><label>رقم الجوال<input name="phone" inputMode="tel" required placeholder="05xxxxxxxx" /></label><label>كلمة المرور<input name="password" type="password" required /></label>{loginMessage && <div className="form-error">{loginMessage}</div>}<button className="primary-button submit-button">دخول <ChevronDown size={18} /></button></form></div>}
        {modal === 'staff' && isAdmin && staff && <StaffManager currentStaffId={staff.id} />}
        {modal === 'details' && selected && <div className="details-modal"><div className="details-image"><img src={selected.images[0] || logo} alt={selected.title} /></div><span className={`listing-badge ${selected.listing_type}`}>{formatListingLabel(selected.listing_type, selected.rent_period)}</span><span className="serial-badge">#{selected.serial_number ?? '—'}</span><div className="card-location"><MapPin size={14} /> {selected.city} — {selected.district} {selected.street && `— ${selected.street}`}</div><p className="advertiser-line">المعلن: <strong>{selected.publisher_name || selected.created_by_name}</strong></p><h2>{selected.title}</h2><strong className="detail-price">{formatPrice(selected.price, selected.listing_type, selected.rent_period)}</strong>{selected.area > 0 && <div className="detail-area"><Layers3 size={15} /> المساحة: {new Intl.NumberFormat('ar-SA').format(selected.area)} م²</div>}{selected.property_type === 'شقة' && <div className="detail-grid"><span>عدد الغرف <b>{selected.rooms}</b></span><span>الحمامات <b>{selected.bathrooms}</b></span><span>الصالات <b>{selected.lounges}</b></span><span>المطابخ <b>{selected.kitchens}</b></span><span>الدور <b>{selected.floor_number}</b></span><span>عدد الأدوار <b>{selected.floors}</b></span><span>مصعد <b>{selected.has_elevator ? 'نعم' : 'لا'}</b></span><span>سطح <b>{selected.has_roof ? 'نعم' : 'لا'}</b></span></div>}{selected.notes && <p className="notes">{selected.notes}</p>}{staff && <OwnerInfo propertyId={selected.id} />}<a className="primary-button submit-button" href={whatsappUrl(publisherPhone(selected), `السلام عليكم ورحمة الله وبركاته، أنا مهتم بالإعلان رقم ${selected.serial_number ?? ''}`)} target="_blank" rel="noreferrer"><MessageCircle size={18} /> تواصل عبر واتساب</a></div>}
        {modal === 'form' && <form className="property-form" onSubmit={(event) => void saveProperty(event)}><div className="form-heading"><div><span className="eyebrow">إدارة العروض</span><h2>{selected ? 'تعديل العقار' : 'إضافة عقار جديد'}</h2></div><span className="secure-note"><LockKeyhole size={14} /> {staff?.display_name}</span></div><div className="form-grid"><label className="full">عنوان العقار<input required value={form.title} onChange={(event) => updateForm('title', event.target.value)} placeholder="مثال: فيلا عائلية بحي النخيل" /></label><label>نوع العرض<select value={form.listing_type} onChange={(event) => updateForm('listing_type', event.target.value)}><option value="sale">بيع</option><option value="rent">إيجار</option></select></label>{form.listing_type === 'rent' && <label>مدة الإيجار<select value={form.rent_period ?? 'annual'} onChange={(event) => updateForm('rent_period', event.target.value as RentPeriod)}><option value="monthly">شهري</option><option value="annual">سنوي</option><option value="two_installments">على دفعتين</option></select></label>}<label>نوع العقار<select value={form.property_type} onChange={(event) => updateForm('property_type', event.target.value)}>{allPropertyTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label>المدينة<input required value={form.city} onChange={(event) => updateForm('city', event.target.value)} /></label><label>الحي<input required value={form.district} onChange={(event) => updateForm('district', event.target.value)} /></label><label>الشارع<input value={form.street} onChange={(event) => updateForm('street', event.target.value)} /></label><label>{form.listing_type === 'rent' && form.rent_period === 'two_installments' ? 'السعر على الدفعة الواحدة' : 'السعر'}<input required type="number" min="0" value={form.price} onChange={(event) => updateForm('price', Number(event.target.value))} /></label><label>المساحة (م²)<input type="number" min="0" value={form.area} onChange={(event) => updateForm('area', Number(event.target.value))} /></label>{form.property_type === 'شقة' && [['rooms','عدد الغرف'],['bathrooms','الحمامات'],['lounges','الصالات'],['kitchens','المطابخ'],['floor_number','الدور'],['floors','عدد الأدوار']].map(([key, label]) => <label key={key}>{label}<input type="number" min="0" value={form[key as keyof FormState] as number} onChange={(event) => updateForm(key as keyof FormState, Number(event.target.value))} /></label>)}{form.property_type === 'شقة' && <label className="check"><input type="checkbox" checked={form.has_roof} onChange={(event) => updateForm('has_roof', event.target.checked)} /> يوجد سطح</label>}{form.property_type === 'شقة' && <label className="check"><input type="checkbox" checked={form.has_elevator} onChange={(event) => updateForm('has_elevator', event.target.checked)} /> يوجد مصعد</label>}<label>اسم المالك <small>(للموظفين فقط)</small><input required value={form.owner_name} onChange={(event) => updateForm('owner_name', event.target.value)} /></label><label>رقم جوال المالك <small>(للموظفين فقط)</small><input required inputMode="tel" value={form.owner_phone} onChange={(event) => updateForm('owner_phone', event.target.value)} /></label><label className="full">ملاحظات إضافية<textarea value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} rows={3} /></label><label className="full file-label"><span>صور العقار <small>علامة مائية بيضاء شفافة في منتصف الصورة</small></span><input type="file" accept="image/*" multiple onChange={(event) => void handleFiles(event.target.files)} /></label></div><div className="image-previews">{form.images.map((image, index) => <div key={`${image.slice(0, 20)}-${index}`}><img src={image} alt={`صورة ${index + 1}`} /><button type="button" onClick={() => updateForm('images', form.images.filter((_, imageIndex) => imageIndex !== index))}><X size={14} /></button></div>)}</div><div className="location-heading"><span>موقع العقار</span><small>اضغط على الخريطة لوضع الدبوس، وسيتم استخراج المدينة والحي والشارع تلقائياً.</small></div><LocationPicker latitude={form.latitude} longitude={form.longitude} onSelect={(latitude, longitude) => void selectLocation(latitude, longitude)} />{form.latitude !== null && <div className="location-row"><MapPinned size={16} /><span>{form.latitude.toFixed(5)}, {form.longitude?.toFixed(5)}</span></div>}{notice && <div className="form-note">{notice}</div>}<div className="form-footer"><button type="button" className="cancel-button" onClick={() => setModal(null)}>إلغاء</button><button className="primary-button" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ العقار'}</button></div></form>}
      </div></div>}
    </div>
  );
}

export default App;
