import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, BackHandler, Keyboard, Linking, Platform, SafeAreaView, ScrollView,
  StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View, Image, Vibration
} from 'react-native';
import { YandexMapView, Marker, Polyline, geocodeAddress, findDrivingRoutes } from 'expo-yandex-mapkit';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

function calculatePolylineKm(points) {
  const toRad = value => value * Math.PI / 180;
  let meters = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const lat1 = Number(a.latitude), lon1 = Number(a.longitude);
    const lat2 = Number(b.latitude), lon2 = Number(b.longitude);
    if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) continue;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    meters += 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  return meters / 1000;
}

function parseRouteMinutes(value, fallbackKm) {
  // Запасная оценка для тестового интерфейса: не допускаем абсурдные
  // значения вроде 1 минуты на сотни километров.
  const fallback = Math.max(1, Math.round((fallbackKm / 45) * 60 + 5));
  let candidate = null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    candidate = Math.round(value > 600 ? value / 60 : value);
  } else if (value && typeof value === 'object') {
    const nested = value.minutes ?? value.durationMinutes ?? value.seconds ?? value.durationSeconds ?? value.value ?? value.text;
    if (nested != null && nested !== value) return parseRouteMinutes(nested, fallbackKm);
  } else {
    const text = String(value || '').toLowerCase();
    const hours = Number(text.match(/(\\d+)\\s*(?:ч|час)/)?.[1] || 0);
    const minutes = Number(text.match(/(\\d+)\\s*(?:м|мин)/)?.[1] || 0);
    const compact = text.match(/(\\d+)\\s*h(?:ours?)?\\s*(?:(\\d+)\\s*m)?/);
    if (hours || minutes) candidate = hours * 60 + minutes;
    else if (compact) candidate = Number(compact[1]) * 60 + Number(compact[2] || 0);
  }
  // Время маршрута не может означать среднюю скорость выше 120 км/ч.
  const physicallyPlausibleMinimum = Math.max(1, Math.ceil((fallbackKm / 120) * 60));
  if (!Number.isFinite(candidate) || candidate < physicallyPlausibleMinimum) return fallback;
  return candidate;
}

function decodeBase64Image(base64) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = String(base64 || '').replace(/[^A-Za-z0-9+/]/g, '');
  const output = new Uint8Array(Math.floor(clean.length * 3 / 4));
  let out = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = alphabet.indexOf(clean[i]);
    const b = alphabet.indexOf(clean[i + 1]);
    const c = alphabet.indexOf(clean[i + 2]);
    const d = alphabet.indexOf(clean[i + 3]);
    if (a < 0 || b < 0) break;
    output[out++] = (a << 2) | (b >> 4);
    if (c >= 0) output[out++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) output[out++] = ((c & 3) << 6) | d;
  }
  return output.slice(0, out);
}

const P = {
  pink: '#E84F87', pinkDark: '#C93670', pale: '#FFF0F5', ink: '#19171B',
  muted: '#817A80', line: '#ECE8EB', white: '#FFFFFF', green: '#16845B',
  map: 'https://tiles.openfreemap.org/styles/liberty'
};
const TARIFFS = [
  // Сохраняем тарифные ID для совместимости с действующим сервисом расчёта цены.
  { id: 'economy', name: 'Женский', sub: 'Поездки для женщин', icon: '♀' },
  { id: 'comfort', name: 'Детский', sub: 'Поездки с детьми', icon: '♡' },
  { id: 'comfort_plus', name: 'Доставка', sub: 'Доставка вещей и заказов', icon: '⌂' }
];
const STATUS = { new: 'Ищем водителя', accepted: 'Водитель назначен', arrived: 'Водитель на месте', in_progress: 'В пути', completed: 'Завершена', cancelled: 'Отменена', declined: 'Отклонена' };
const fmt = n => Number(n || 0).toLocaleString('ru-RU') + ' ₽';

const translateError = error => {
  const raw = String(error?.message || error || '').trim();
  const message = raw.toLowerCase();
  if (!raw) return 'Произошла ошибка. Попробуй ещё раз.';
  if (/invalid login credentials|invalid email or password/.test(message)) return 'Неверный номер телефона/email или пароль.';
  if (/email not confirmed/.test(message)) return 'Подтверди адрес электронной почты по ссылке в письме.';
  if (/user already registered|already been registered/.test(message)) return 'Этот адрес электронной почты уже зарегистрирован. Войди в аккаунт.';
  if (/password.*(at least|minimum)|weak password/.test(message)) return 'Пароль слишком простой или короткий. Придумай другой пароль.';
  if (/email rate limit exceeded|rate limit/.test(message)) return 'Слишком много запросов. Подожди немного и попробуй снова.';
  if (/network request failed|failed to fetch|fetch failed|networkerror|timeout|timed out/.test(message)) return 'Не удалось подключиться к серверу. Проверь интернет и попробуй ещё раз.';
  if (/duplicate key|unique constraint|orders_one_active_per_passenger_idx/.test(message)) return 'У тебя уже есть активный заказ. Открой раздел «Мои поездки».';
  if (/permission denied|not allowed|unauthorized|forbidden|jwt/.test(message)) return 'Недостаточно прав для этого действия. Перезайди в аккаунт и попробуй снова.';
  if (/function .* not found|could not find the function|schema cache/.test(message)) return 'Функция временно недоступна. Обнови приложение или попробуй позже.';
  if (/row-level security|violates row-level security/.test(message)) return 'Действие не разрешено для этого аккаунта.';
  if (/маршрут не найден/.test(message)) return 'Не удалось построить маршрут. Проверь выбранные адреса.';
  return 'Не удалось выполнить действие. Проверь подключение к интернету и попробуй ещё раз.';
};

async function findAddresses(q) {
  const clean = String(q || '').replace(/\\s+/g, ' ').trim();
  if (clean.length < 2) return [];
  const results = await geocodeAddress(clean, {
    userPosition: { latitude: 43.9052, longitude: 42.7168 },
    resultPageSize: 12
  });
  return (results || []).filter(item => item.point &&
    Number.isFinite(Number(item.point.latitude)) &&
    Number.isFinite(Number(item.point.longitude))
  ).map((item, index) => ({
    id: String(item.name || clean) + ':' + index + ':' + item.point.latitude + ':' + item.point.longitude,
    label: item.formattedAddress || item.name || clean,
    detail: item.description || 'Яндекс Карты',
    latitude: Number(item.point.latitude),
    longitude: Number(item.point.longitude)
  }));
}

function MapPanel({ pickup, destination, route, onLocate, onPickDestination, pickingDestination, driverLocation, allowPickDestination = true }) {
  const cameraRef = useRef(null);
  const [zoom, setZoom] = useState(17);
  const [is3D, setIs3D] = useState(true);
  const [cameraPosition, setCameraPosition] = useState({
    latitude: 43.9052, longitude: 42.7168, zoom: 13, tilt: 0
  });

  useEffect(() => {
    const target = driverLocation || pickup || destination;
    if (target) {
      setCameraPosition(current => ({
        ...current,
        latitude: Number(target.latitude),
        longitude: Number(target.longitude),
        zoom: Math.max(current.zoom || 0, 16),
        tilt: is3D ? 45 : 0
      }));
    }
  }, [pickup?.latitude, pickup?.longitude, destination?.latitude, destination?.longitude,
      driverLocation?.latitude, driverLocation?.longitude, is3D]);

  const handleLocate = async () => {
    const point = await onLocate?.();
    if (point?.latitude != null && point?.longitude != null) {
      setCameraPosition(current => ({
        ...current, latitude: Number(point.latitude), longitude: Number(point.longitude),
        zoom: 17, tilt: is3D ? 45 : 0
      }));
    }
  };

  return <View style={st.map}>
    <YandexMapView
      ref={cameraRef}
      style={{ flex: 1 }}
      mapType="map"
      cameraPosition={cameraPosition}
      showUserPosition={false}
      onMapPress={({ nativeEvent }) => {
        if (!allowPickDestination || !pickingDestination || !onPickDestination) return;
        const point = nativeEvent?.point;
        if (point?.latitude != null && point?.longitude != null) onPickDestination(point);
      }}
    >
      {pickup && <Marker point={{ latitude: Number(pickup.latitude), longitude: Number(pickup.longitude) }}>
        <View style={{ backgroundColor: P.green, borderColor: '#FFFFFF', borderWidth: 2, borderRadius: 16, minWidth: 30, height: 30, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>А</Text>
        </View>
      </Marker>}
      {destination && <Marker point={{ latitude: Number(destination.latitude), longitude: Number(destination.longitude) }}>
        <View style={{ backgroundColor: P.pink, borderColor: '#FFFFFF', borderWidth: 2, borderRadius: 16, minWidth: 30, height: 30, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Б</Text>
        </View>
      </Marker>}
      {route?.length > 1 && <Polyline points={route} strokeColor={P.pink} strokeWidth={5} outlineColor="#FFFFFF" outlineWidth={2} />}
      {driverLocation && <Marker point={{ latitude: Number(driverLocation.latitude), longitude: Number(driverLocation.longitude) }}>
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 2, borderColor: P.pink, padding: 5 }}>
          <Text style={{ fontSize: 20 }}>🚘</Text>
        </View>
      </Marker>}
    </YandexMapView>
    <View style={st.mapControls}>
      <TouchableOpacity style={st.locateButton} onPress={handleLocate}>
        <Text style={st.locateButtonText}>◎  Определить местоположение</Text>
      </TouchableOpacity>
      <View style={st.mapControlRow}>
        <TouchableOpacity style={[st.mapControl, is3D && st.mapControlActive]} onPress={() => {
          setIs3D(v => !v);
          setCameraPosition(current => ({ ...current, tilt: is3D ? 0 : 45 }));
        }}><Text style={[st.mapControlText, is3D && st.mapControlTextActive]}>3D</Text></TouchableOpacity>
        <TouchableOpacity style={st.mapControl} onPress={() => {
          const next = Math.min(20, zoom + 1); setZoom(next);
          setCameraPosition(current => ({ ...current, zoom: next }));
        }}><Text style={st.mapControlText}>＋</Text></TouchableOpacity>
        <TouchableOpacity style={st.mapControl} onPress={() => {
          const next = Math.max(3, zoom - 1); setZoom(next);
          setCameraPosition(current => ({ ...current, zoom: next }));
        }}><Text style={st.mapControlText}>−</Text></TouchableOpacity>
      </View>
    </View>
    <View style={st.mapLabel}><View style={st.liveDot}/><Text style={st.mapLabelText}>{pickingDestination ? 'Нажми на карту, чтобы выбрать точку' : 'Яндекс Карты'}</Text></View>
  </View>;
}

function Field({ label, value, onChangeText, placeholder, onFocus, icon, autoCapitalize = 'sentences' }) {
  return <View style={st.field}>
    <Text style={st.fieldIcon}>{icon}</Text>
    <View style={{ flex: 1 }}>
      <Text style={st.fieldLabel}>{label}</Text>
      <Text numberOfLines={1} style={[st.fieldInput, !value && { color: "#A9A2A7" }]}>{value || placeholder}</Text>
    </View>
  </View>;
}

export default function LadyGoApp() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [boot, setBoot] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('ride');
  const [pickupText, setPickupText] = useState('Моё местоположение');
  const [destinationText, setDestinationText] = useState('');
  const [pickup, setPickup] = useState(null);
  const [destination, setDestination] = useState(null);
  const [pickingDestination, setPickingDestination] = useState(false);
  const [searchField, setSearchField] = useState('');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [route, setRoute] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const [tariff, setTariff] = useState('economy');
  const [payment, setPayment] = useState('cash');
  const [quote, setQuote] = useState(null);
  const [orders, setOrders] = useState([]);
  const [presentationOrders, setPresentationOrders] = useState([]);
  const [offerState, setOfferState] = useState(null);
  const [offerSeconds, setOfferSeconds] = useState(15);
  const [activeOrder, setActiveOrder] = useState(null);
  const [phone, setPhone] = useState('');
  const [driverOrders, setDriverOrders] = useState([]);
  const [driverPrices, setDriverPrices] = useState({});
  const [driverSection, setDriverSection] = useState('overview');
  const [driverLoading, setDriverLoading] = useState(false);
  const [driverOnline, setDriverOnline] = useState(false);
  const [driverPresenceLoading, setDriverPresenceLoading] = useState(false);
  const [driverLocation, setDriverLocation] = useState(null);
  const [driverVehicle, setDriverVehicle] = useState(null);
  const [vehicleForm, setVehicleForm] = useState({ display_name: '', vehicle_make: '', vehicle_model: '', vehicle_color: '', vehicle_plate: '', vehicle_year: '' });
  const [vehiclePhotoPath, setVehiclePhotoPath] = useState('');
  const [vehiclePhotoPreview, setVehiclePhotoPreview] = useState('');
  const [driverPhotoPath, setDriverPhotoPath] = useState('');
  const [driverPhotoPreview, setDriverPhotoPreview] = useState('');
  const [driverPhotoUploading, setDriverPhotoUploading] = useState(false);
  const [vehicleSaving, setVehicleSaving] = useState(false);
  const [vehicleUploading, setVehicleUploading] = useState(false);
  const autoLocateStarted = useRef(false);
  const [adminOrders, setAdminOrders] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminApplications, setAdminApplications] = useState([]);
  const [adminDrivers, setAdminDrivers] = useState([]);
  const [adminSelectedDriverId, setAdminSelectedDriverId] = useState(null);
  const [adminSection, setAdminSection] = useState('applications');
  const [application, setApplication] = useState({ full_name: '', phone: '', experience: '', vehicle_make: '', vehicle_model: '', vehicle_color: '', vehicle_plate: '', vehicle_year: '', license_info: '' });
  const [applicationAdult, setApplicationAdult] = useState(false);
  const [applicationAvatar, setApplicationAvatar] = useState('');
  const [applicationVehiclePhoto, setApplicationVehiclePhoto] = useState('');
  const [applicationSaving, setApplicationSaving] = useState(false);
  const [myApplication, setMyApplication] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [ratedOrderIds, setRatedOrderIds] = useState([]);
  const [ratingOrderId, setRatingOrderId] = useState(null);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [driverRatingStats, setDriverRatingStats] = useState({});

  const loadProfile = useCallback(async u => {
    if (!u || !supabase) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', u.id).maybeSingle();
    setProfile(data || { id: u.id, email: u.email, role: 'passenger' });
    setPhone(data?.phone || u.user_metadata?.phone || '');
  }, []);

  const loadOrders = useCallback(async () => {
    if (!session?.user || !supabase) return;
    const { data, error } = await supabase.from('orders').select('*').eq('passenger_id', session.user.id).order('created_at', { ascending: false }).limit(30);
    if (error) return;
    setOrders(data || []);
    const orderRows = data || [];
    const { data: ownRatings } = await supabase.from('order_ratings').select('order_id').eq('passenger_id', session.user.id);
    setRatedOrderIds((ownRatings || []).map(r => r.order_id));
    const driverIds = [...new Set(orderRows.map(o => o.driver_id).filter(Boolean))];
    if (driverIds.length) {
      const { data: stats } = await supabase.from('driver_rating_stats').select('driver_id,average_rating,rating_count').in('driver_id', driverIds);
      setDriverRatingStats(current => ({ ...current, ...Object.fromEntries((stats || []).map(s => [s.driver_id, s])) }));
    }
    const active = orderRows.find(o => ['new','accepted','arrived','in_progress'].includes(o.status)) || null;
    setActiveOrder(active);
    if (active?.driver_id && ['accepted','arrived','in_progress'].includes(active.status)) {
      const { data: vehicle } = await supabase.from('driver_profiles').select('display_name,avatar_url,vehicle_make,vehicle_model,vehicle_color,vehicle_plate,vehicle_year,vehicle_photo_url').eq('driver_id', active.driver_id).maybeSingle();
      const [vehicleSigned, driverSigned] = await Promise.all([
        vehicle?.vehicle_photo_url ? supabase.storage.from('ladygo-driver-media').createSignedUrl(vehicle.vehicle_photo_url, 3600) : Promise.resolve({ data: null }),
        vehicle?.avatar_url ? supabase.storage.from('ladygo-driver-media').createSignedUrl(vehicle.avatar_url, 3600) : Promise.resolve({ data: null })
      ]);
      setDriverVehicle(vehicle ? { ...vehicle, vehicle_photo_signed_url: vehicleSigned.data?.signedUrl || null, driver_photo_signed_url: driverSigned.data?.signedUrl || null } : null);
    } else { setDriverVehicle(null); setDriverLocation(null); }
  }, [session]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) { setBoot(false); return; }
      const { data } = await supabase.auth.getSession();
      if (alive && data.session) { setSession(data.session); await loadProfile(data.session.user); }
      if (alive) setBoot(false);
    })();
    const { data: listener } = supabase?.auth.onAuthStateChange(async (_event, next) => {
      setSession(next);
      if (next?.user) await loadProfile(next.user); else { setProfile(null); setOrders([]); setActiveOrder(null); }
    }) || { data: { subscription: null } };
    return () => { alive = false; listener?.subscription?.unsubscribe(); };
  }, [loadProfile]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      // Сначала закрываем экран поиска адреса.
      if (searchField) {
        setSearchField('');
        setSuggestions([]);
        setQuery('');
        Keyboard.dismiss();
        return true;
      }

      // Из внутренних разделов возвращаемся на главный экран заказа.
      if (tab !== 'ride') {
        setTab('ride');
        return true;
      }

      // На главном экране не закрываем приложение случайным нажатием.
      Alert.alert('Выйти из LadyGo?', 'Приложение останется открытым, если выбрать «Остаться».', [
        { text: 'Остаться', style: 'cancel' },
        { text: 'Выйти', style: 'destructive', onPress: () => BackHandler.exitApp() }
      ]);
      return true;
    });
    return () => subscription.remove();
  }, [searchField, tab]);

  // Водитель делится геопозицией только при наличии назначенной активной поездки.
  useEffect(() => {
    if (profile?.role !== 'driver' || !session?.user?.id) return;
    const current = driverOrders.find(o => o.driver_id === session.user.id && ['accepted','arrived','in_progress'].includes(o.status));
    if (!current) return;
    let subscription;
    let stopped = false;
    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted' || stopped) return;
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
        async position => {
          if (stopped) return;
          const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
          await supabase.from('driver_locations').upsert({
            driver_id: session.user.id, latitude: point.latitude, longitude: point.longitude,
            heading: position.coords.heading, updated_at: new Date().toISOString()
          }, { onConflict: 'driver_id' });
        }
      );
    })().catch(() => {});
    return () => { stopped = true; subscription?.remove(); };
  }, [profile?.role, session?.user?.id, driverOrders]);

  // Пассажир получает координаты только водителя, назначенного на его текущий заказ.
  useEffect(() => {
    if (!activeOrder?.driver_id || !['accepted','arrived','in_progress'].includes(activeOrder.status) || !supabase) {
      setDriverLocation(null);
      return;
    }
    let alive = true;
    const loadLocation = async () => {
      const { data } = await supabase.from('driver_locations').select('latitude,longitude,heading,updated_at').eq('driver_id', activeOrder.driver_id).maybeSingle();
      if (alive && data && Date.now() - new Date(data.updated_at).getTime() < 120000) setDriverLocation({ latitude: data.latitude, longitude: data.longitude, heading: data.heading });
    };
    loadLocation();
    const channel = supabase.channel('driver-location-' + activeOrder.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations', filter: 'driver_id=eq.' + activeOrder.driver_id }, payload => {
        const row = payload.new;
        if (alive && row?.latitude != null && row?.longitude != null) setDriverLocation({ latitude: row.latitude, longitude: row.longitude, heading: row.heading });
      }).subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [activeOrder?.id, activeOrder?.driver_id, activeOrder?.status]);

  useEffect(() => {
    if (!session?.user?.id || !supabase) return;
    const channel = supabase.channel('passenger-orders-' + session.user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: 'passenger_id=eq.' + session.user.id }, () => {
        loadOrders();
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id, loadOrders]);

  useEffect(() => { if (session?.user) loadOrders(); }, [session, loadOrders]);
  useEffect(() => {
    if (!session?.user?.id || profile?.role !== 'passenger' || !supabase) { setMyApplication(null); return; }
    let alive = true;
    supabase.from('driver_applications').select('id,status,created_at,review_note,admin_note')
      .eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (alive) setMyApplication(data || null); });
    return () => { alive = false; };
  }, [session?.user?.id, profile?.role]);


  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) { setSuggestions([]); return; }
    let alive = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      try { const result = await findAddresses(query); if (alive) setSuggestions(result); }
      catch (_) { if (alive) setSuggestions([]); }
      finally { if (alive) setSearching(false); }
    }, 400);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);

  const loadAdminOrders = useCallback(async () => {
    if (profile?.role !== 'admin' || !supabase) return;
    setAdminLoading(true);
    try {
      // Загружаем всю историю порциями, чтобы старые поездки не терялись из-за лимита Supabase.
      const allOrders = [];
      const pageSize = 500;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase.from('orders')
          .select('id,pickup_address,destination_address,status,price_rub,estimated_price_rub,created_at,passenger_id,driver_id,passenger_phone,requested_for,notes')
          .order('created_at', { ascending: false }).range(from, from + pageSize - 1);
        if (error) throw error;
        allOrders.push(...(data || []));
        if (!data || data.length < pageSize) break;
      }

      const driverIds = [...new Set(allOrders.map(o => o.driver_id).filter(Boolean))];
      let profiles = [];
      let applications = [];
      if (driverIds.length) {
        const [profileResult, applicationResult] = await Promise.all([
          supabase.from('driver_profiles')
            .select('driver_id,display_name,phone,vehicle_make,vehicle_model,vehicle_color,vehicle_plate,vehicle_year')
            .in('driver_id', driverIds),
          supabase.from('driver_applications')
            .select('user_id,full_name,phone,vehicle_make,vehicle_model,vehicle_plate,vehicle_color,vehicle_year,status')
            .in('user_id', driverIds).eq('status', 'approved')
        ]);
        if (profileResult.error) throw profileResult.error;
        if (applicationResult.error) throw applicationResult.error;
        profiles = profileResult.data || [];
        applications = applicationResult.data || [];
      }
      const profileById = new Map(profiles.map(d => [d.driver_id, d]));
      const applicationById = new Map(applications.map(d => [d.user_id, d]));
      setAdminOrders(allOrders.map(order => {
        const driver = profileById.get(order.driver_id) || {};
        const application = applicationById.get(order.driver_id) || {};
        return {
          ...order,
          driver_full_name: application.full_name || driver.display_name || 'Имя не указано',
          driver_phone: driver.phone || application.phone || '',
          driver_vehicle_make: driver.vehicle_make || application.vehicle_make || '',
          driver_vehicle_model: driver.vehicle_model || application.vehicle_model || '',
          driver_vehicle_plate: driver.vehicle_plate || application.vehicle_plate || '',
          driver_vehicle_color: driver.vehicle_color || application.vehicle_color || '',
          driver_vehicle_year: driver.vehicle_year || application.vehicle_year || ''
        };
      }));
    } catch (e) {
      Alert.alert('Не удалось загрузить историю поездок', translateError(e));
    } finally {
      setAdminLoading(false);
    }
  }, [profile?.role]);

  const loadAdminApplications = useCallback(async () => {
    if (profile?.role !== 'admin' || !supabase) return;
    setAdminLoading(true);
    try {
      const { data, error } = await supabase.from('driver_applications').select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      setAdminApplications(data || []);
    } catch (e) { Alert.alert('Не удалось загрузить заявки', translateError(e)); }
    finally { setAdminLoading(false); }
  }, [profile?.role]);

  const loadAdminDrivers = useCallback(async () => {
    if (profile?.role !== 'admin' || !supabase) return;
    try {
      const allDrivers = [];
      const pageSize = 500;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase.from('driver_profiles')
          .select('driver_id,display_name,phone,vehicle_make,vehicle_model,vehicle_color,vehicle_plate,vehicle_year,avatar_url,vehicle_photo_url,updated_at')
          .order('updated_at', { ascending: false }).range(from, from + pageSize - 1);
        if (error) throw error;
        allDrivers.push(...(data || []));
        if (!data || data.length < pageSize) break;
      }
      setAdminDrivers(allDrivers);
    } catch (e) {
      Alert.alert('Не удалось загрузить водителей', translateError(e));
    }
  }, [profile?.role]);

  const reviewDriverApplication = async (item, status) => {
    const label = status === 'approved' ? 'одобрить' : 'отклонить';
    Alert.alert('Проверка заявки', `Точно ${label} заявку ${item.full_name}?`, [
      { text: 'Отмена', style: 'cancel' },
      { text: status === 'approved' ? 'Одобрить' : 'Отклонить', style: status === 'rejected' ? 'destructive' : 'default', onPress: async () => {
        setAdminLoading(true);
        try {
          const { error } = await supabase.from('driver_applications').update({ status }).eq('id', item.id).eq('status', 'pending');
          if (error) throw error;
          await loadAdminApplications();
          await loadAdminDrivers();
          Alert.alert(status === 'approved' ? 'Заявка одобрена' : 'Заявка отклонена', status === 'approved' ? 'Аккаунт получил роль водителя.' : 'Заявка отмечена как отклонённая.');
        } catch (e) { Alert.alert('Не удалось обработать заявку', translateError(e)); }
        finally { setAdminLoading(false); }
      }}
    ]);
  };

  const uploadApplicationPhoto = async kind => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Нужен доступ к фото', 'Разреши доступ к галерее.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: kind === 'avatar' ? [1,1] : [4,3], quality: 0.78, base64: true });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    try {
      if (!asset.base64) throw new Error('Не удалось прочитать фото. Выбери его ещё раз.');
      const mime = ['image/jpeg','image/png','image/webp'].includes(asset.mimeType) ? asset.mimeType : 'image/jpeg';
      const bytes = decodeBase64Image(asset.base64);
      if (!bytes.length) throw new Error('Фото пустое или повреждено.');
      const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
      const path = `${session.user.id}/application-${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('ladygo-driver-media').upload(path, bytes, { contentType: mime, upsert: false });
      if (error) throw error;
      const url = supabase.storage.from('ladygo-driver-media').getPublicUrl(path).data.publicUrl;
      if (kind === 'avatar') setApplicationAvatar(url); else setApplicationVehiclePhoto(url);
      Alert.alert('Фото добавлено', 'Фотография прикреплена к заявке.');
    } catch (e) { Alert.alert('Не удалось загрузить фото', translateError(e)); }
  };

  const submitDriverApplication = async () => {
    if (!session?.user?.id || applicationSaving) return;
    if (!applicationAdult) { Alert.alert('Подтверди возраст', 'Подать заявку на работу водителем можно только с 18 лет.'); return; }
    if (!application.full_name.trim() || !application.phone.trim() || !application.vehicle_make.trim() || !application.vehicle_model.trim()) {
      Alert.alert('Заполни обязательные поля', 'Нужны ФИО, телефон, марка и модель автомобиля.'); return;
    }
    setApplicationSaving(true);
    try {
      const { error } = await supabase.from('driver_applications').insert({
        user_id: session.user.id, full_name: application.full_name.trim(), phone: application.phone.trim(),
        experience: application.experience.trim() || null, license_info: application.license_info.trim() || 'Документы будут проверены администратором лично.',
        vehicle_make: application.vehicle_make.trim(), vehicle_model: application.vehicle_model.trim(),
        vehicle_color: application.vehicle_color.trim() || null, vehicle_plate: application.vehicle_plate.trim() || null,
        vehicle_year: application.vehicle_year.trim() ? Number(application.vehicle_year) : null,
        avatar_url: applicationAvatar || null, vehicle_photo_url: applicationVehiclePhoto || null,
        vehicle_class: 'economy', status: 'pending'
      });
      if (error) throw error;
      const { data } = await supabase.from('driver_applications').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      setMyApplication(data || { status: 'pending' });
      Alert.alert('Заявка отправлена', 'Она появится в панели администратора после обновления.');
      setTab('profile');
    } catch (e) { Alert.alert('Не удалось отправить заявку', translateError(e)); }
    finally { setApplicationSaving(false); }
  };

  useEffect(() => {
    let alive = true;
    if (profile?.role !== 'driver' || !session?.user?.id || !supabase) return () => { alive = false; };
    (async () => {
      const { data } = await supabase.from('driver_profiles').select('display_name,avatar_url,vehicle_make,vehicle_model,vehicle_color,vehicle_plate,vehicle_year,vehicle_photo_url').eq('driver_id', session.user.id).maybeSingle();
      if (!alive) return;
      setVehicleForm({ display_name: data?.display_name || '', vehicle_make: data?.vehicle_make || '', vehicle_model: data?.vehicle_model || '', vehicle_color: data?.vehicle_color || '', vehicle_plate: data?.vehicle_plate || '', vehicle_year: data?.vehicle_year ? String(data.vehicle_year) : '' });
      setVehiclePhotoPath(data?.vehicle_photo_url || '');
      setDriverPhotoPath(data?.avatar_url || '');
      if (data?.avatar_url) {
        const { data: signedAvatar } = await supabase.storage.from('ladygo-driver-media').createSignedUrl(data.avatar_url, 3600);
        if (alive) setDriverPhotoPreview(signedAvatar?.signedUrl || '');
      } else if (alive) setDriverPhotoPreview('');
      if (data?.vehicle_photo_url) {
        const { data: signed } = await supabase.storage.from('ladygo-driver-media').createSignedUrl(data.vehicle_photo_url, 3600);
        if (alive) setVehiclePhotoPreview(signed?.signedUrl || '');
      } else if (alive) setVehiclePhotoPreview('');
    })().catch(() => {});
    return () => { alive = false; };
  }, [profile?.role, session?.user?.id]);

  const chooseVehiclePhoto = async () => {
    if (vehicleUploading || !session?.user?.id) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Нужен доступ к фото', 'Разреши доступ к галерее, чтобы добавить фотографию автомобиля.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.82, base64: true });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setVehicleUploading(true);
    try {
      if (!asset.base64) throw new Error('Не удалось прочитать выбранное фото. Выбери изображение ещё раз.');
      const mime = ['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType) ? asset.mimeType : 'image/jpeg';
      const bytes = decodeBase64Image(asset.base64);
      if (!bytes.length) throw new Error('Фото пустое или повреждено. Выбери другое изображение.');
      const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
      const path = `${session.user.id}/vehicle-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('ladygo-driver-media').upload(path, bytes, { contentType: mime, upsert: false });
      if (error) throw error;
      const { data: signed } = await supabase.storage.from('ladygo-driver-media').createSignedUrl(path, 3600);
      setVehiclePhotoPath(path);
      setVehiclePhotoPreview(signed?.signedUrl || asset.uri);
    } catch (e) { Alert.alert('Не удалось загрузить фото', translateError(e)); }
    finally { setVehicleUploading(false); }
  };

  const chooseDriverPhoto = async () => {
    if (driverPhotoUploading || !session?.user?.id) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Нужен доступ к фото', 'Разреши доступ к галерее, чтобы добавить фотографию профиля водителя.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.82, base64: true });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setDriverPhotoUploading(true);
    try {
      if (!asset.base64) throw new Error('Не удалось прочитать выбранное фото. Выбери изображение ещё раз.');
      const mime = ['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType) ? asset.mimeType : 'image/jpeg';
      const bytes = decodeBase64Image(asset.base64);
      if (!bytes.length) throw new Error('Фото пустое или повреждено. Выбери другое изображение.');
      const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
      const path = `${session.user.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('ladygo-driver-media').upload(path, bytes, { contentType: mime, upsert: false });
      if (error) throw error;
      const { data: signed } = await supabase.storage.from('ladygo-driver-media').createSignedUrl(path, 3600);
      setDriverPhotoPath(path);
      setDriverPhotoPreview(signed?.signedUrl || asset.uri);
    } catch (e) { Alert.alert('Не удалось загрузить фото', translateError(e)); }
    finally { setDriverPhotoUploading(false); }
  };

  const saveVehicleProfile = async () => {
    if (!session?.user?.id || vehicleSaving) return;
    if (!vehicleForm.vehicle_make.trim() || !vehicleForm.vehicle_model.trim()) { Alert.alert('Заполни данные машины', 'Укажи марку и модель автомобиля.'); return; }
    const year = vehicleForm.vehicle_year.trim() ? Number(vehicleForm.vehicle_year) : null;
    if (year !== null && (!Number.isInteger(year) || year < 1950 || year > new Date().getFullYear() + 1)) { Alert.alert('Проверь год выпуска', 'Укажи корректный год автомобиля.'); return; }
    setVehicleSaving(true);
    try {
      const { error } = await supabase.from('driver_profiles').upsert({
        driver_id: session.user.id, display_name: vehicleForm.display_name.trim(), avatar_url: driverPhotoPath || null,
        vehicle_make: vehicleForm.vehicle_make.trim(), vehicle_model: vehicleForm.vehicle_model.trim(),
        vehicle_color: vehicleForm.vehicle_color.trim() || null, vehicle_plate: vehicleForm.vehicle_plate.trim() || null,
        vehicle_year: year, vehicle_photo_url: vehiclePhotoPath || null, updated_at: new Date().toISOString()
      }, { onConflict: 'driver_id' });
      if (error) throw error;
      Alert.alert('Сохранено', 'Данные автомобиля обновлены. Пассажир увидит их после назначения поездки.');
      if (activeOrder?.driver_id === session.user.id) await loadOrders();
    } catch (e) { Alert.alert('Не удалось сохранить автомобиль', translateError(e)); }
    finally { setVehicleSaving(false); }
  };
  const loadDriverOrders = useCallback(async () => {
    if (!session?.user || profile?.role !== 'driver' || !supabase) return;
    setDriverLoading(true);
    try {
      let request = supabase.from('orders').select('*');
      request = driverOnline
        ? request.or('status.eq.new,driver_id.eq.' + session.user.id)
        : request.eq('driver_id', session.user.id);
      const { data, error } = await request.order('created_at', { ascending: false }).limit(60);
      if (error) throw error;
      setDriverOrders(data || []);
      const { data: stats } = await supabase.from('driver_rating_stats').select('driver_id,average_rating,rating_count').eq('driver_id', session.user.id).maybeSingle();
      if (stats) setDriverRatingStats(current => ({ ...current, [session.user.id]: stats }));
    } catch (e) {
      Alert.alert('Не удалось обновить заказы', translateError(e));
    } finally { setDriverLoading(false); }
  }, [session, profile, driverOnline]);

  useEffect(() => {
    if (profile?.role !== 'driver' || !session?.user?.id || !supabase) {
      setDriverOnline(false);
      return;
    }
    let alive = true;
    supabase.from('driver_presence').select('is_online')
      .eq('driver_id', session.user.id).maybeSingle()
      .then(({ data, error }) => {
        if (alive && !error) setDriverOnline(Boolean(data?.is_online));
      });
    return () => { alive = false; };
  }, [profile?.role, session?.user?.id]);

  useEffect(() => {
    if (profile?.role === 'driver') loadDriverOrders();
  }, [profile, loadDriverOrders, driverOnline]);

  const toggleDriverShift = async () => {
    if (profile?.role !== 'driver' || !session?.user?.id || driverPresenceLoading) return;
    if (driverOnline) {
      const hasActive = driverOrders.some(o => o.driver_id === session.user.id && ['accepted','arrived','in_progress'].includes(o.status));
      if (hasActive) {
        Alert.alert('Сначала заверши поездку', 'Нельзя завершить смену, пока у тебя есть активная поездка.');
        return;
      }
    }
    const next = !driverOnline;
    setDriverPresenceLoading(true);
    try {
      const { error } = await supabase.from('driver_presence').upsert({
        driver_id: session.user.id,
        is_online: next,
        updated_at: new Date().toISOString()
      }, { onConflict: 'driver_id' });
      if (error) throw error;
      setDriverOnline(next);
      if (next) await loadDriverOrders();
      else setDriverOrders(current => current.filter(o => o.driver_id === session.user.id));
      Alert.alert(next ? 'Ты на линии' : 'Смена завершена', next ? 'Теперь тебе доступны новые заявки.' : 'Новые заявки больше не будут отображаться.');
    } catch (e) {
      Alert.alert('Не удалось изменить статус', translateError(e));
    } finally {
      setDriverPresenceLoading(false);
    }
  };

  const acceptDriverOrder = async order => {
    const price = Number(String(driverPrices[order.id] || order.estimated_price_rub || '').replace(',', '.'));
    if (!Number.isFinite(price) || price <= 0) return Alert.alert('Укажи стоимость', 'Введи согласованную стоимость поездки в рублях.');
    setBusy(true);
    try {
      const { error } = await supabase.rpc('ladygo_accept_order', { p_order_id: order.id, p_price: price });
      if (error) throw error;
      await loadDriverOrders();
      Alert.alert('Заказ принят', 'Поездка добавлена в твои активные заказы.');
    } catch (e) { Alert.alert('Не удалось принять заказ', translateError(e)); }
    finally { setBusy(false); }
  };

  const updateDriverStatus = async (order, status) => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('ladygo_update_trip_status', { p_order_id: order.id, p_status: status });
      if (error) throw error;
      await loadDriverOrders();
    } catch (e) { Alert.alert('Не удалось обновить поездку', translateError(e)); }
    finally { setBusy(false); }
  };

  const submitDriverRating = async order => {
    if (!session?.user?.id || !order?.driver_id || order.status !== 'completed' || ratingValue < 1 || ratingValue > 5 || ratingSaving) return;
    setRatingSaving(true);
    try {
      const { error } = await supabase.from('order_ratings').insert({ order_id: order.id, passenger_id: session.user.id, driver_id: order.driver_id, rating: ratingValue });
      if (error) throw error;
      setRatedOrderIds(current => [...current, order.id]);
      setRatingOrderId(null);
      setRatingValue(0);
      await loadOrders();
      Alert.alert('Спасибо за оценку!', 'Твоя оценка сохранена и повлияет на рейтинг водителя.');
    } catch (e) {
      const duplicate = /duplicate|unique/i.test(String(e?.message || ''));
      Alert.alert('Не удалось сохранить оценку', duplicate ? 'Эта поездка уже оценена.' : translateError(e));
      if (duplicate) setRatedOrderIds(current => [...new Set([...current, order.id])]);
    } finally { setRatingSaving(false); }
  };
  const signIn = async () => {
    const identifier = email.trim();
    const phoneDigits = identifier.replace(/\D/g, '');
    const isEmail = identifier.includes('@');
    if (!identifier || password.length < 6) return Alert.alert('Проверь данные', 'Введи номер телефона и пароль не короче 6 символов.');
    if (register && (isEmail || phoneDigits.length < 10 || phoneDigits.length > 15)) {
      return Alert.alert('Проверь номер', 'Укажи номер телефона в международном формате, например +79991234567.');
    }
    if (!register && !isEmail && (phoneDigits.length < 10 || phoneDigits.length > 15)) {
      return Alert.alert('Проверь номер', 'Укажи номер телефона в международном формате.');
    }
    // Временная схема без SMS: телефон преобразуется в технический email для Supabase Auth.
    // Вход по email оставлен для существующего аккаунта администратора.
    const authEmail = isEmail && !register ? identifier.toLowerCase() : 'phone-' + phoneDigits + '@auth.ladygo.app';
    setBusy(true);
    try {
      const result = register
        ? await supabase.auth.signUp({ email: authEmail, password, options: { data: { phone: phoneDigits } } })
        : await supabase.auth.signInWithPassword({ email: authEmail, password });
      if (result.error) throw result.error;
      if (register && result.data.user) {
        const { error: profileError } = await supabase.from('profiles').upsert({ id: result.data.user.id, email: null, phone: phoneDigits }, { onConflict: 'id' });
        if (profileError) throw profileError;
      }
      if (register && !result.data.session) Alert.alert('Требуется настройка', 'В Supabase включено подтверждение email. Для этого временного способа его нужно отключить; SMS-подтверждения пока нет.');
    } catch (e) { Alert.alert('Не удалось войти', translateError(e)); }
    finally { setBusy(false); }
  };

  const locate = async ({ silent = false } = {}) => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { if (!silent) Alert.alert('Нужен доступ к геолокации', 'Разреши LadyGo определять место подачи.'); return null; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const point = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setPickup(point);
      setPickupText('Моё местоположение');
      Location.reverseGeocodeAsync(point).then(places => {
        const p = places?.[0] || {};
        const address = [p.street, p.streetNumber, p.city || p.subregion].filter(Boolean).join(', ');
        if (address) setPickupText(address);
      }).catch(() => {});
      return point;
    } catch (_) { if (!silent) Alert.alert('Не удалось определить место', 'Попробуй ещё раз или введи адрес вручную.'); return null; }
  };

  useEffect(() => {
    if (!session?.user?.id || autoLocateStarted.current) return;
    autoLocateStarted.current = true;
    locate({ silent: true });
  }, [session?.user?.id]);

  const pickDestinationOnMap = async point => {
    if (!point) { setPickingDestination(true); return; }
    setPickingDestination(false);
    setDestination(point);
    setDestinationText('Выбранная точка');
    try {
      const response = await fetch('https://photon.komoot.io/reverse?lat=' + point.latitude + '&lon=' + point.longitude + '&lang=ru');
      const data = await response.json();
      const feature = data?.features?.[0];
      const p = feature?.properties || {};
      const label = [p.name, p.housenumber, p.street, p.city || p.town || p.village]
        .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
      if (label) setDestinationText(label);
    } catch (_) {
      setDestinationText(point.latitude.toFixed(5) + ', ' + point.longitude.toFixed(5));
    }
  };

  const chooseSuggestion = async item => {
    const point = { latitude: item.latitude, longitude: item.longitude };
    if (searchField === 'pickup') { setPickup(point); setPickupText(item.label); }
    else { setDestination(point); setDestinationText(item.label); }
    setSuggestions([]); setSearchField(''); setQuery(''); Keyboard.dismiss();
  };

  useEffect(() => {
    let alive = true;
    const build = async () => {
      if (!pickup || !destination) { setRoute([]); setRouteInfo(null); setQuote(null); return; }
      try {
        const routes = await findDrivingRoutes([pickup, destination], { vehicleType: 'taxi' });
        const r = routes?.[0];
        if (!r || !Array.isArray(r.points) || r.points.length < 2) throw new Error('Маршрут не найден');
        const points = r.points.map(p => ({ latitude: Number(p.latitude), longitude: Number(p.longitude) }));
        const routeKm = calculatePolylineKm(points);
        if (!Number.isFinite(routeKm) || routeKm <= 0) throw new Error('Некорректная длина маршрута');
        const durationValue = r.timeWithTraffic || r.time || r.duration || r.durationSeconds;
        const minutes = parseRouteMinutes(durationValue, routeKm);
        if (alive) {
          setRoute(points);
          setRouteInfo({ km: routeKm.toFixed(1), minutes });
        }
      } catch (_) { if (alive) { setRoute([]); setRouteInfo(null); } }
    };
    build();
    return () => { alive = false; };
  }, [pickup, destination]);

  useEffect(() => {
    let alive = true;
    const getQuote = async () => {
      if (!pickup || !destination || !routeInfo || !supabase) { setQuote(null); return; }
      try {
        const { data, error } = await supabase.functions.invoke('pricing-service', {
          body: { action: 'quote', city_id: 'kislovodsk', tariff_id: tariff, points: [pickup, destination], options: [] }
        });
        if (error) throw error;
        if (alive && data?.price_token) setQuote(data); else if (alive) setQuote(null);
      } catch (_) { if (alive) setQuote(null); }
    };
    getQuote();
    return () => { alive = false; };
  }, [pickup, destination, routeInfo, tariff]);

  const virtualDrivers = ['Тестовый водитель №1', 'Тестовый водитель №2', 'Тестовый водитель №3'];
  const rejectVirtualOffer = (reason = 'Отказ') => {
    setOfferState(current => {
      if (!current) return null;
      const nextIndex = current.driverIndex + 1;
      if (nextIndex >= virtualDrivers.length) {
        setPresentationOrders(rows => rows.map(row => row.id === current.orderId ? { ...row, status: 'no_virtual_driver' } : row));
        return null;
      }
      return { ...current, driverIndex: nextIndex, token: Date.now() };
    });
    setOfferSeconds(15);
  };
  const acceptVirtualOffer = () => {
    if (!offerState) return;
    setPresentationOrders(rows => rows.map(row => row.id === offerState.orderId ? { ...row, status: 'accepted', virtual_driver: virtualDrivers[offerState.driverIndex] } : row));
    Vibration.cancel();
    setOfferState(null);
    Alert.alert('Тестовый водитель принял заказ', 'Назначение сохранено только в локальной тестовой истории.');
  };
  useEffect(() => {
    if (!offerState) { Vibration.cancel(); return; }
    setOfferSeconds(15);
    Vibration.vibrate([0, 500, 350, 500, 350, 500], true);
    const started = Date.now();
    const timer = setInterval(() => {
      const left = Math.max(0, 15 - Math.floor((Date.now() - started) / 1000));
      setOfferSeconds(left);
      if (left <= 0) {
        clearInterval(timer);
        Vibration.cancel();
        rejectVirtualOffer('Тайм-аут');
      }
    }, 250);
    return () => { clearInterval(timer); Vibration.cancel(); };
  }, [offerState?.token]);

  const createOrder = async () => {
    if (!session?.user) return;
    if (!pickup || !destination || !routeInfo) return Alert.alert('Укажи маршрут', 'Выбери оба адреса и дождись построения маршрута.');
    // Локальная презентационная запись: не отправляется водителям и не сохраняется на сервере.
    const km = Number(routeInfo.km) || 0;
    const tariffFactor = tariff === 'comfort' ? 1.25 : tariff === 'comfort_plus' ? 1.15 : 1;
    // Только локальная тестовая оценка, не тариф для реальных поездок.
    const amount = Math.max(250, Math.round((250 + km * 42 + (Number(routeInfo.minutes) || 0) * 3) * tariffFactor / 50) * 50);
    const localOrder = {
      id: 'local-' + Date.now(), localPresentation: true,
      pickup_address: pickupText, destination_address: destinationText,
      estimated_price_rub: amount, price_rub: amount, status: 'new',
      payment_method: payment, created_at: new Date().toISOString(), tariff_id: tariff
    };
    setPresentationOrders(current => [localOrder, ...current]);
    setOfferState({ orderId: localOrder.id, driverIndex: 0, token: Date.now() });
    setTab('orders');
    Alert.alert('Тестовый заказ создан', 'Сейчас начнётся проверка карточки виртуального водителя. Реальным водителям заказ не отправляется.');
  };

  const signOut = async () => { await supabase.auth.signOut(); setTab('ride'); };
  const cancelOrder = async order => {
    if (order?.localPresentation) {
      Alert.alert('Отменить поездку?', 'Подтверди отмену этой записи.', [
        { text: 'Не отменять', style: 'cancel' },
        { text: 'Отменить', style: 'destructive', onPress: () => {
          setPresentationOrders(current => current.map(item => item.id === order.id ? { ...item, status: 'cancelled' } : item));
        }}
      ]);
      return;
    }
    Alert.alert('Отменить заказ?', 'Подтверди отмену этой заявки.', [
      { text: 'Не отменять', style: 'cancel' },
      { text: 'Отменить', style: 'destructive', onPress: async () => {
        try {
          const { error } = await supabase.rpc('ladygo_cancel_active_order', {
            p_order_id: order.id,
            p_reason: 'Отмена пассажиром'
          });
          if (error) {
            Alert.alert('Не удалось отменить', translateError(error));
            return;
          }
          await loadOrders();
          Alert.alert('Заказ отменён', 'Заявка успешно отменена.');
        } catch (error) {
          Alert.alert('Не удалось отменить', translateError(error));
        }
      }}
    ]);
  };

  const chatOrder = tab === 'driver'
    ? driverOrders.find(o => o.driver_id === session?.user?.id && ['accepted','arrived','in_progress'].includes(o.status)) || null
    : (activeOrder?.driver_id && ['accepted','arrived','in_progress'].includes(activeOrder.status) ? activeOrder : null);

  useEffect(() => {
    if (!chatOrder?.id || !session?.user?.id || !supabase) {
      setChatMessages([]);
      return;
    }
    let alive = true;
    const loadMessages = async () => {
      const { data, error } = await supabase.from('trip_messages')
        .select('id,order_id,sender_id,message,created_at')
        .eq('order_id', chatOrder.id)
        .order('created_at', { ascending: true })
        .limit(100);
      if (alive && !error) setChatMessages(data || []);
    };
    loadMessages();
    const channel = supabase.channel('trip-chat-' + chatOrder.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trip_messages', filter: 'order_id=eq.' + chatOrder.id }, () => loadMessages())
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [chatOrder?.id, session?.user?.id]);

  const sendTripMessage = async () => {
    const message = chatDraft.trim();
    if (!message || !chatOrder?.id || !session?.user?.id || chatSending) return;
    setChatSending(true);
    try {
      const { error } = await supabase.from('trip_messages').insert({
        order_id: chatOrder.id,
        sender_id: session.user.id,
        message
      });
      if (error) throw error;
      setChatDraft('');
    } catch (e) {
      Alert.alert('Не удалось отправить сообщение', translateError(e));
    } finally {
      setChatSending(false);
    }
  };

  const renderTripChat = () => !chatOrder ? null : <View style={st.chatCard}>
    <View style={st.rowBetween}>
      <Text style={st.heading}>💬 Чат поездки</Text>
      <Text style={st.chatHint}>Только участники заказа</Text>
    </View>
    <ScrollView style={st.chatMessages} nestedScrollEnabled keyboardShouldPersistTaps="handled">
      {chatMessages.length === 0 ? <Text style={st.chatEmpty}>Напиши водителю, чтобы уточнить детали поездки.</Text> :
        chatMessages.map(item => <View key={item.id} style={[st.chatBubble, item.sender_id === session?.user?.id ? st.chatMine : st.chatOther]}>
          <Text style={st.chatSender}>{item.sender_id === session?.user?.id ? 'Вы' : 'Собеседник'}</Text>
          <Text style={st.chatMessage}>{item.message}</Text>
          <Text style={st.chatTime}>{new Date(item.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>)}
    </ScrollView>
    <View style={st.chatComposer}>
      <TextInput style={st.chatInput} value={chatDraft} onChangeText={setChatDraft} placeholder="Сообщение…" multiline maxLength={2000}/>
      <TouchableOpacity style={[st.chatSend, (!chatDraft.trim() || chatSending) && st.disabled]} onPress={sendTripMessage} disabled={!chatDraft.trim() || chatSending}>
        {chatSending ? <ActivityIndicator color="#fff" size="small"/> : <Text style={st.chatSendText}>➤</Text>}
      </TouchableOpacity>
    </View>
  </View>;

  const previewFare = routeInfo
    ? Math.max(250, Math.round((250 + (Number(routeInfo.km) || 0) * 42 + (Number(routeInfo.minutes) || 0) * 3) * (tariff === 'comfort' ? 1.25 : tariff === 'comfort_plus' ? 1.15 : 1) / 50) * 50)
    : null;

  if (boot) return <View style={st.loading}><ActivityIndicator size="large" color={P.pink}/><Text style={st.muted}>Загружаем LadyGo…</Text></View>;
  if (!session) return <SafeAreaView style={st.auth}><StatusBar barStyle="dark-content" backgroundColor={P.white}/>
    <View style={st.authLogo}><Text style={st.logo}>LadyGo</Text><Text style={st.tagline}>Поездки с заботой</Text></View>
    <View style={st.authCard}><Text style={st.heading}>{register ? 'Создать аккаунт' : 'С возвращением'}</Text>
      <TextInput style={st.authInput} value={email} onChangeText={setEmail} placeholder={register ? "Номер телефона" : "Номер телефона или email администратора"} autoCapitalize="none" keyboardType={register || !email.includes("@") ? "phone-pad" : "email-address"} textContentType="telephoneNumber"/>
      <TextInput style={st.authInput} value={password} onChangeText={setPassword} placeholder="Пароль" secureTextEntry/>
      <TouchableOpacity style={st.primaryBtn} onPress={signIn} disabled={busy}>{busy ? <ActivityIndicator color="#fff"/> : <Text style={st.primaryText}>{register ? 'Зарегистрироваться' : 'Войти'}</Text>}</TouchableOpacity>
      <TouchableOpacity onPress={() => setRegister(!register)}><Text style={st.switchText}>{register ? 'Уже есть аккаунт? Войти' : 'Создать новый аккаунт'}</Text></TouchableOpacity>
    </View>
    <Text style={st.footnote}>Создано независимым автором @acyma</Text>
  </SafeAreaView>;

  if (searchField) return <SafeAreaView style={st.searchScreen}>
    <View style={st.searchTop}><TouchableOpacity onPress={() => { setSearchField(''); setSuggestions([]); Keyboard.dismiss(); }}><Text style={st.back}>‹</Text></TouchableOpacity>
      <TextInput autoFocus value={query} onChangeText={setQuery} placeholder={searchField === 'pickup' ? 'Откуда поедем?' : 'Куда поедем?'} style={st.searchInput}/>
      <TouchableOpacity onPress={() => setQuery('')}><Text style={st.clear}>×</Text></TouchableOpacity>
    </View>
    {searching && <ActivityIndicator color={P.pink} style={{ marginTop: 20 }}/>}
    <ScrollView keyboardShouldPersistTaps="handled">
      {suggestions.map(item => <TouchableOpacity key={item.id} style={st.suggestion} onPress={() => chooseSuggestion(item)}>
        <View style={st.suggestionIcon}><Text>⌖</Text></View><View style={{ flex: 1 }}><Text style={st.suggestionTitle}>{item.label}</Text><Text style={st.suggestionSub}>{item.detail || 'Кисловодск'}</Text></View>
      </TouchableOpacity>)}
      {!searching && query.length > 1 && suggestions.length === 0 && <Text style={st.empty}>Не получилось найти адрес. Проверь написание или попробуй указать улицу и номер дома.</Text>}
    </ScrollView>
  </SafeAreaView>;

  return <SafeAreaView style={st.screen}><StatusBar barStyle="dark-content" backgroundColor={P.white}/>
    <View style={st.topbar}><View><Text style={st.logoSmall}>LadyGo</Text><Text style={st.topSub}>Поездки с заботой</Text></View>
      {profile?.role === 'driver' && <View style={st.modeSwitch}>
        <TouchableOpacity onPress={() => setTab('ride')} style={[st.modeOption, tab !== 'driver' && st.modeOptionActive]}><Text style={[st.modeText, tab !== 'driver' && st.modeTextActive]}>⌖  Пассажир</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => { setTab('driver'); loadDriverOrders(); }} style={[st.modeOption, tab === 'driver' && st.modeOptionActive]}><Text style={[st.modeText, tab === 'driver' && st.modeTextActive]}>🚘  Водитель</Text></TouchableOpacity>
      </View>}
      {profile?.role === 'admin' && <TouchableOpacity style={[st.adminTopButton, tab === 'admin' && st.adminTopButtonActive]} onPress={() => { setTab('admin'); loadAdminOrders(); loadAdminApplications(); loadAdminDrivers(); }}>
        <Text style={[st.adminTopButtonText, tab === 'admin' && st.adminTopButtonTextActive]}>⚙ Админ</Text>
      </TouchableOpacity>}
      <TouchableOpacity style={st.avatar} onPress={() => setTab('profile')}><Text style={st.avatarText}>{(profile?.email || 'L').slice(0,1).toUpperCase()}</Text></TouchableOpacity>
    </View>
    {offerState && <View style={{ marginHorizontal: 14, marginTop: 10, padding: 15, borderRadius: 18, backgroundColor: '#FFF0F5', borderWidth: 1, borderColor: P.pink, gap: 8 }}>
      <Text style={{ color: P.pinkDark, fontSize: 11, fontWeight: '900' }}>ТЕСТОВАЯ ЗАЯВКА · ВИРТУАЛЬНЫЙ ВОДИТЕЛЬ</Text>
      <Text style={{ color: P.ink, fontSize: 18, fontWeight: '900' }}>{virtualDrivers[offerState.driverIndex]}</Text>
      <Text style={{ color: P.muted, fontSize: 13 }}>Новый заказ · сигнал и ожидание ответа</Text>
      <Text style={{ color: P.pinkDark, fontSize: 28, fontWeight: '900', textAlign: 'center' }}>{offerSeconds} сек.</Text>
      <View style={{ flexDirection: 'row', gap: 9 }}>
        <TouchableOpacity onPress={acceptVirtualOffer} style={{ flex: 1, backgroundColor: P.green, borderRadius: 12, padding: 13, alignItems: 'center' }}><Text style={{ color: '#FFF', fontWeight: '900' }}>Принять</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => { Vibration.cancel(); rejectVirtualOffer(); }} style={{ flex: 1, backgroundColor: '#FFFFFF', borderColor: P.line, borderWidth: 1, borderRadius: 12, padding: 13, alignItems: 'center' }}><Text style={{ color: P.ink, fontWeight: '900' }}>Отказать</Text></TouchableOpacity>
      </View>
      <Text style={{ color: P.muted, fontSize: 10 }}>При отказе или тайм-ауте карточка перейдёт следующему виртуальному водителю. Это локальная симуляция.</Text>
    </View>}
    {tab === 'ride' && <View style={{ flex: 1 }}>
      <MapPanel pickup={pickup} destination={destination} route={route} onLocate={locate} onPickDestination={pickDestinationOnMap} pickingDestination={pickingDestination}/>
      <ScrollView style={st.sheet} contentContainerStyle={st.sheetContent} keyboardShouldPersistTaps="handled">
        <View style={st.sheetHandle}/>
        <View style={st.rowBetween}><Text style={st.heading}>Куда едем?</Text><View style={st.cityPill}><Text style={st.cityPillText}>Поиск по России</Text></View></View>
        <TouchableOpacity activeOpacity={0.8} onPress={() => { setSearchField('pickup'); setQuery(''); }}><Field label="ОТКУДА" value={pickupText} placeholder="Выберите место подачи" icon="●"/></TouchableOpacity>
        <View style={st.connector}/>
        <TouchableOpacity activeOpacity={0.8} onPress={() => { setSearchField('destination'); setQuery(''); }}><Field label="КУДА" value={destinationText} placeholder="Введите адрес назначения" icon="●"/></TouchableOpacity>
        <TouchableOpacity style={st.locateRow} onPress={locate}><Text style={st.locateRowIcon}>◎</Text><Text style={st.locateRowText}>Определить моё местоположение</Text></TouchableOpacity>
        {routeInfo && <View style={st.routeMeta}><Text style={st.routeMetaText}>Маршрут {routeInfo.km} км</Text><Text style={st.routeMetaText}>Около {routeInfo.minutes} мин</Text></View>}
        <Text style={st.sectionTitle}>Выберите тариф</Text>
        <View style={st.tariffs}>{TARIFFS.map(t => <TouchableOpacity key={t.id} onPress={() => setTariff(t.id)} style={[st.tariff, tariff === t.id && st.tariffSelected]}>
          <Text style={st.tariffIcon}>{t.icon}</Text><Text style={st.tariffName}>{t.name}</Text>{(previewFare) && tariff === t.id ? <Text style={st.tariffPrice}>{fmt(previewFare)}</Text> : null}
        </TouchableOpacity>)}</View>
        <View style={st.priceCard}><View style={{ flex: 1 }}><Text style={st.priceTitle}>{(previewFare) ? 'Предварительная стоимость' : 'Стоимость поездки'}</Text><Text style={st.priceHint}>{(previewFare) ? 'Расчёт по длине и времени маршрута' : 'Укажи оба адреса для расчёта'}</Text></View><Text style={st.priceValue}>{previewFare ? fmt(previewFare) : '—'}</Text></View>
        <Text style={st.sectionTitle}>Способ оплаты</Text>
        <View style={st.payRow}><TouchableOpacity onPress={() => setPayment('cash')} style={[st.payOption, payment === 'cash' && st.paySelected]}><Text style={st.payIcon}>₽</Text><Text style={st.payText}>Наличные</Text></TouchableOpacity><TouchableOpacity onPress={() => setPayment('transfer_to_driver')} style={[st.payOption, payment === 'transfer_to_driver' && st.paySelected]}><Text style={st.payIcon}>↗</Text><Text style={st.payText}>Перевод водителю</Text></TouchableOpacity></View>
        <TextInput style={st.phoneInput} value={phone} onChangeText={setPhone} placeholder="Телефон для связи (необязательно)" keyboardType="phone-pad"/>
        <TouchableOpacity style={[st.primaryBtn, (!pickup || !destination || !routeInfo || busy) && st.disabled]} onPress={createOrder} disabled={!pickup || !destination || !routeInfo || busy}>
          {busy ? <ActivityIndicator color="#fff"/> : <Text style={st.primaryText}>Заказать поездку</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={st.phoneOrderBtn} onPress={() => Linking.openURL('tel:+79911121227')}>
          <Text style={st.phoneOrderText}>☎  Заказать по телефону</Text>
        </TouchableOpacity>
        <Text style={st.footnote}>Создано независимым автором @acyma</Text>
      </ScrollView>
    </View>}
    {tab === 'orders' && <ScrollView contentContainerStyle={st.pageContent}>
      <Text style={st.pageTitle}>Мои поездки</Text>
      {activeOrder?.driver_id && ['accepted','arrived','in_progress'].includes(activeOrder.status) && <>
        <Text style={st.heading}>Водитель едет к вам</Text>
        <MapPanel pickup={activeOrder.pickup_lat && activeOrder.pickup_lng ? { latitude: activeOrder.pickup_lat, longitude: activeOrder.pickup_lng } : null}
          destination={activeOrder.destination_lat && activeOrder.destination_lng ? { latitude: activeOrder.destination_lat, longitude: activeOrder.destination_lng } : null}
          route={[]} driverLocation={driverLocation} onLocate={async () => driverLocation} allowPickDestination={false}/>
        <View style={st.orderCard}>
          <View style={st.passengerDriverRow}>
            {driverVehicle?.driver_photo_signed_url ? <Image source={{ uri: driverVehicle.driver_photo_signed_url }} style={st.passengerDriverPhoto} /> : <View style={st.passengerDriverPlaceholder}><Text style={st.passengerDriverInitial}>{(driverVehicle?.display_name || 'В').slice(0,1).toUpperCase()}</Text></View>}
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={st.heading}>{driverVehicle?.display_name || 'Ваш водитель'}</Text>
              <Text style={st.passengerDriverRating}>★ {driverRatingStats[activeOrder.driver_id]?.average_rating ? Number(driverRatingStats[activeOrder.driver_id].average_rating).toFixed(1) : 'Новый'} · {driverRatingStats[activeOrder.driver_id]?.rating_count || 0} оценок</Text>
            </View>
          </View>
          {driverVehicle?.vehicle_photo_signed_url && <Image source={{ uri: driverVehicle.vehicle_photo_signed_url }} style={st.passengerVehiclePhoto} resizeMode="cover" />}
          <Text style={st.heading}>{[driverVehicle?.vehicle_color, driverVehicle?.vehicle_make, driverVehicle?.vehicle_model].filter(Boolean).join(' ') || 'Автомобиль водителя'}</Text>
          <Text style={st.orderAddress}>{driverVehicle?.vehicle_plate || 'Номер автомобиля не указан'}{driverVehicle?.vehicle_year ? ' · ' + driverVehicle.vehicle_year : ''}</Text>
          <Text style={st.muted}>{driverLocation ? 'Геопозиция обновляется в реальном времени' : 'Ожидаем первую геопозицию автомобиля…'}</Text>
        </View>
        {renderTripChat()}
      </>}
      {orders.length + presentationOrders.length === 0 ? <View style={st.emptyCard}><Text style={st.emptyIcon}>⌁</Text><Text style={st.heading}>Пока нет поездок</Text><Text style={st.muted}>Оформленные заказы появятся здесь.</Text><TouchableOpacity style={st.primaryBtn} onPress={() => setTab('ride')}><Text style={st.primaryText}>Заказать поездку</Text></TouchableOpacity></View> :
        [...presentationOrders, ...orders].map(o => {
          const driverStats = o.driver_id ? driverRatingStats[o.driver_id] : null;
          const canRate = o.status === 'completed' && o.driver_id && !ratedOrderIds.includes(o.id);
          return <View key={o.id} style={st.orderCard}>
            {o.localPresentation && <Text style={st.footnote}>Тестовая запись — не отправлена водителям</Text>}
            <View style={st.rowBetween}><Text style={st.orderStatus}>{STATUS[o.status] || o.status}</Text><Text style={st.orderDate}>{new Date(o.created_at).toLocaleDateString('ru-RU')}</Text></View>
            <Text style={st.orderAddress}>●  {o.pickup_address}</Text>
            <Text style={st.orderAddress}>●  {o.destination_address}</Text>
            <View style={st.rowBetween}><Text style={st.orderPrice}>{o.price_rub ? fmt(o.price_rub) : 'Цена уточняется'}</Text>{o.status === 'new' && <TouchableOpacity onPress={() => cancelOrder(o)}><Text style={st.cancelText}>Отменить</Text></TouchableOpacity>}</View>
            {o.driver_id && o.status === 'completed' && <Text style={st.ratingSummary}>Оценка водителя: ★ {driverStats?.average_rating ? Number(driverStats.average_rating).toFixed(1) : '—'} {driverStats?.rating_count ? '(' + driverStats.rating_count + ')' : ''}</Text>}
            {canRate && <View style={st.rateBox}>
              <Text style={st.rateTitle}>Оцени поездку</Text>
              <View style={st.rateStars}>{[1,2,3,4,5].map(value => <TouchableOpacity key={value} onPress={() => { setRatingOrderId(o.id); setRatingValue(value); }}><Text style={[st.rateStar, (ratingOrderId === o.id && ratingValue >= value) && st.rateStarActive]}>★</Text></TouchableOpacity>)}</View>
              {ratingOrderId === o.id && ratingValue > 0 && <TouchableOpacity style={st.rateSubmit} onPress={() => submitDriverRating(o)} disabled={ratingSaving}><Text style={st.rateSubmitText}>{ratingSaving ? 'Сохраняем…' : 'Отправить оценку'}</Text></TouchableOpacity>}
            </View>}
            {o.status === 'completed' && ratedOrderIds.includes(o.id) && <Text style={st.ratingThanks}>✓ Спасибо, поездка оценена</Text>}
          </View>;
        })}
    </ScrollView>}
    {tab === 'admin' && profile?.role === 'admin' && <ScrollView contentContainerStyle={st.pageContent}>
      <View style={st.adminHero}>
        <View style={{flex:1}}>
          <Text style={st.adminEyebrow}>LADYGO CONTROL CENTER</Text>
          <Text style={st.pageTitle}>Администрирование</Text>
          <Text style={st.muted}>Заявки, водители и поездки — в одном месте</Text>
        </View>
        <TouchableOpacity style={st.adminRefresh} onPress={() => { loadAdminOrders(); loadAdminApplications(); loadAdminDrivers(); }}>
          {adminLoading ? <ActivityIndicator color={P.pink}/> : <Text style={st.adminRefreshText}>↻</Text>}
        </TouchableOpacity>
      </View>
      <View style={st.adminStats}>
        <View style={st.adminStat}><Text style={st.adminStatValue}>{adminApplications.filter(x=>x.status==='pending').length}</Text><Text style={st.adminStatLabel}>Новые заявки</Text></View>
        <View style={st.adminStat}><Text style={st.adminStatValue}>{adminDrivers.length}</Text><Text style={st.adminStatLabel}>Водители</Text></View>
        <View style={st.adminStat}><Text style={st.adminStatValue}>{adminOrders.filter(o=>['new','accepted','arrived','in_progress'].includes(o.status)).length}</Text><Text style={st.adminStatLabel}>Активные поездки</Text></View>
      </View>
      <View style={st.adminTabs}>
        {[
          ['applications','Заявки',adminApplications.filter(x=>x.status==='pending').length],
          ['drivers','Водители',adminDrivers.length],
          ['orders','Заказы',adminOrders.length]
        ].map(([id,label,count])=><TouchableOpacity key={id} onPress={()=>setAdminSection(id)} style={[st.adminTab,adminSection===id&&st.adminTabActive]}>
          <Text style={[st.adminTabText,adminSection===id&&st.adminTabTextActive]}>{label} · {count}</Text>
        </TouchableOpacity>)}
      </View>
      {adminSection==='applications' && <>
        <View style={st.rowBetween}><Text style={st.heading}>Заявки на подключение</Text>{adminLoading&&<ActivityIndicator color={P.pink}/>}</View>
        {adminApplications.length===0 ? <View style={st.emptyCard}><Text style={st.emptyIcon}>▤</Text><Text style={st.heading}>Заявок пока нет</Text><Text style={st.muted}>Новые анкеты кандидатов появятся здесь.</Text></View> :
          adminApplications.map(item=><View key={item.id} style={st.adminApplicationCard}>
            <View style={st.rowBetween}><Text style={st.adminApplicantName}>{item.full_name||'Без имени'}</Text><Text style={[st.adminStatus,item.status==='pending'?st.adminStatusPending:item.status==='approved'?st.adminStatusApproved:st.adminStatusRejected]}>{item.status==='pending'?'На проверке':item.status==='approved'?'Одобрена':'Отклонена'}</Text></View>
            <Text style={st.adminDetail}>☎ {item.phone||'Телефон не указан'}</Text>
            <Text style={st.adminDetail}>Стаж: {item.experience||'Не указан'}</Text>
            <Text style={st.adminDetail}>Автомобиль: {[item.vehicle_make,item.vehicle_model,item.vehicle_color].filter(Boolean).join(' ')||'Не указан'}</Text>
            <Text style={st.adminDetail}>Номер: {item.vehicle_plate||'Не указан'} {item.vehicle_year||''}</Text>
            {item.license_info ? <Text style={st.adminDetail}>Документы: {item.license_info}</Text>:null}
            <Text style={st.adminDate}>Подана: {new Date(item.created_at).toLocaleString('ru-RU')}</Text>
            <View style={st.adminPhotoRow}>
              {item.avatar_url?<Image source={{uri:item.avatar_url}} style={st.adminPhoto}/>:null}
              {item.vehicle_photo_url?<Image source={{uri:item.vehicle_photo_url}} style={st.adminCarPhoto}/>:null}
            </View>
            {item.status==='pending' && <View style={st.adminActionRow}>
              <TouchableOpacity style={st.adminApprove} onPress={()=>reviewDriverApplication(item,'approved')}><Text style={st.adminActionText}>✓ Одобрить</Text></TouchableOpacity>
              <TouchableOpacity style={st.adminReject} onPress={()=>reviewDriverApplication(item,'rejected')}><Text style={st.adminRejectText}>Отклонить</Text></TouchableOpacity>
            </View>}
            {(item.review_note||item.admin_note)&&<Text style={st.adminDate}>Комментарий: {item.review_note||item.admin_note}</Text>}
          </View>)}
      </>}
      {adminSection==='drivers' && <>
        <View style={st.rowBetween}><Text style={st.heading}>Водители и их история поездок</Text><Text style={st.muted}>{adminDrivers.length} всего</Text></View>
        {adminDrivers.length===0?<View style={st.emptyCard}><Text style={st.heading}>Водителей пока нет</Text></View>:adminDrivers.map(d=>{
          const driverTrips = adminOrders.filter(o => o.driver_id === d.driver_id);
          const expanded = adminSelectedDriverId === d.driver_id;
          return <View key={d.driver_id} style={st.adminApplicationCard}>
            <TouchableOpacity activeOpacity={0.8} onPress={()=>setAdminSelectedDriverId(expanded ? null : d.driver_id)}>
              <View style={st.rowBetween}>
                <Text style={st.adminApplicantName}>{d.display_name||'Водитель LadyGo'}</Text>
                <Text style={st.adminTabText}>{expanded ? 'Скрыть ▲' : 'История ▼'}</Text>
              </View>
              <Text style={st.adminDetail}>{d.phone||'Телефон не указан'}</Text>
              <Text style={st.adminDetail}>{[d.vehicle_color,d.vehicle_make,d.vehicle_model].filter(Boolean).join(' ')||'Автомобиль не заполнен'}</Text>
              <Text style={st.adminDetail}>{d.vehicle_plate||'Номер не указан'} {d.vehicle_year||''}</Text>
              <Text style={[st.adminDetail,{marginTop:6,fontWeight:'700',color:P.pink}]}>Поездок: {driverTrips.length} · Нажмите, чтобы открыть историю</Text>
            </TouchableOpacity>
            {expanded && <View style={{marginTop:12,gap:10}}>
              {driverTrips.length===0 ? <Text style={st.muted}>У этого водителя пока нет назначенных поездок.</Text> : driverTrips.map(o=><View key={o.id} style={{backgroundColor:P.pale,borderRadius:12,padding:11,gap:5}}>
                <View style={st.rowBetween}>
                  <Text style={st.orderStatus}>{STATUS[o.status]||o.status}</Text>
                  <Text style={st.orderDate}>{o.created_at ? new Date(o.created_at).toLocaleString('ru-RU') : 'Дата не указана'}</Text>
                </View>
                <Text style={st.orderAddress}>● {o.pickup_address||'Место подачи не указано'}</Text>
                <Text style={st.orderAddress}>● {o.destination_address||'Назначение не указано'}</Text>
                {o.passenger_phone ? <Text style={st.adminDetail}>Телефон пассажира: {o.passenger_phone}</Text> : null}
                <View style={st.rowBetween}>
                  <Text style={st.orderPrice}>{o.price_rub?fmt(o.price_rub):o.estimated_price_rub?fmt(o.estimated_price_rub):'Цена не указана'}</Text>
                  <Text style={st.muted}>ID: {String(o.id).slice(0,8)}</Text>
                </View>
              </View>)}
            </View>}
          </View>;
        })}
      </>}
      {adminSection==='orders' && <>
        <View style={st.rowBetween}><Text style={st.heading}>История всех поездок</Text><Text style={st.muted}>{adminOrders.length} всего</Text></View>
        {adminOrders.length===0?<View style={st.emptyCard}><Text style={st.heading}>Поездок пока нет</Text></View>:adminOrders.map(o=><View key={o.id} style={st.orderCard}>
          <View style={st.rowBetween}><Text style={st.orderStatus}>{STATUS[o.status]||o.status}</Text><Text style={st.orderDate}>{new Date(o.created_at).toLocaleString('ru-RU')}</Text></View>
          <Text style={st.orderAddress}>● {o.pickup_address||'Место подачи не указано'}</Text>
          <Text style={st.orderAddress}>● {o.destination_address||'Назначение не указано'}</Text>
          <View style={{backgroundColor:P.pale,borderRadius:12,padding:11,marginTop:8,gap:5}}>
            <Text style={st.adminDetail}>Водитель: {o.driver_id ? o.driver_full_name : 'Не назначен'}</Text>
            {o.driver_id ? <Text style={st.adminDetail}>Автомобиль: {[o.driver_vehicle_color,o.driver_vehicle_make,o.driver_vehicle_model].filter(Boolean).join(' ')||'Данные не указаны'}</Text> : null}
            {o.driver_id ? <Text style={st.adminDetail}>Госномер: {o.driver_vehicle_plate||'Не указан'}</Text> : null}
            {o.driver_id && o.driver_phone ? <Text style={st.adminDetail}>Телефон водителя: {o.driver_phone}</Text> : null}
          </View>
          <View style={st.rowBetween}><Text style={st.orderPrice}>{o.price_rub?fmt(o.price_rub):o.estimated_price_rub?fmt(o.estimated_price_rub):'Цена не указана'}</Text><Text style={st.muted}>ID: {String(o.id).slice(0,8)}</Text></View>
        </View>)}
      </>}
      <Text style={st.footnote}>Решение об одобрении принимается после личной проверки возраста, водительских документов и автомобиля.</Text>
    </ScrollView>}
    {tab === 'driver' && profile?.role === 'driver' && (() => {
      const mine = driverOrders.filter(o => o.driver_id === session.user.id);
      const active = mine.filter(o => ['accepted','arrived','in_progress'].includes(o.status));
      const available = driverOrders.filter(o => o.status === 'new' && !o.driver_id);
      const history = mine.filter(o => ['completed','cancelled','declined'].includes(o.status));
      const earnings = history.filter(o => o.status === 'completed').reduce((sum,o) => sum + Number(o.price_rub || 0), 0);
      const shown = driverSection === 'available' ? available
        : driverSection === 'active' ? active
        : driverSection === 'history' ? history
        : [...active, ...available];
      const tabs = [['overview','Обзор'],['available','Новые'],['active','Активные'],['history','История']];
      return <ScrollView contentContainerStyle={st.pageContent}>
        <View style={st.driverHeader}>
          <View style={{flex:1}}>
            <Text style={st.driverEyebrow}>РАБОЧЕЕ ПРОСТРАНСТВО</Text>
            <Text style={st.pageTitle}>Панель водителя</Text>
            <Text style={st.driverSubtitle}>Все поездки и рабочие показатели в одном месте</Text>
          </View>
          <TouchableOpacity style={st.driverRefresh} onPress={loadDriverOrders} disabled={driverLoading}>
            {driverLoading ? <ActivityIndicator color={P.pink}/> : <Text style={st.driverRefreshText}>↻</Text>}
          </TouchableOpacity>
        </View>
        <View style={[st.driverModeHint, !driverOnline && { backgroundColor: '#F7F5F6', borderColor: P.line }]}>
          <Text style={st.driverModeIcon}>🚘</Text>
          <View style={{flex:1}}>
            <Text style={st.driverModeTitle}>{driverOnline ? 'Ты на линии' : 'Ты не на линии'}</Text>
            <Text style={st.driverModeSub}>{driverOnline ? 'Новые заявки доступны для принятия' : 'Включи смену, чтобы получать новые заявки'}</Text>
          </View>
          <View style={[st.driverOnlineDot, !driverOnline && { backgroundColor: '#B8B0B5' }]}/>
        </View>
        <TouchableOpacity
          style={[st.shiftButton, driverOnline && st.shiftButtonOff, driverPresenceLoading && st.disabled]}
          onPress={toggleDriverShift}
          disabled={driverPresenceLoading}
        >
          {driverPresenceLoading ? <ActivityIndicator color={P.white}/> : <Text style={st.shiftButtonText}>{driverOnline ? 'Завершить смену' : 'Выйти на линию'}</Text>}
        </TouchableOpacity>
        <View style={st.driverStatsGrid}>
          <View style={st.driverStatCard}>
            <Text style={st.driverStatValue}>{available.length}</Text>
            <Text style={st.driverStatLabel}>Новые заявки</Text>
          </View>
          <View style={st.driverStatCard}>
            <Text style={st.driverStatValue}>{active.length}</Text>
            <Text style={st.driverStatLabel}>Активные поездки</Text>
          </View>
          <View style={st.driverStatCard}>
            <Text style={st.driverStatValue}>{history.filter(o=>o.status==='completed').length}</Text>
            <Text style={st.driverStatLabel}>Завершено</Text>
          </View>
        </View>
        <View style={st.ratingDriverCard}>
          <Text style={st.ratingDriverLabel}>ТВОЙ РЕЙТИНГ</Text>
          <View style={st.rowBetween}><Text style={st.ratingDriverValue}>★ {driverRatingStats[session.user.id]?.average_rating ? Number(driverRatingStats[session.user.id].average_rating).toFixed(2) : '—'}</Text><Text style={st.ratingDriverCount}>{driverRatingStats[session.user.id]?.rating_count || 0} оценок</Text></View>
        </View>
        <View style={st.driverEarningsCard}>
          <View style={{flex:1}}>
            <Text style={st.driverEarningsLabel}>ЗАВЕРШЁННЫЕ ПОЕЗДКИ · СУММА</Text>
            <Text style={st.driverEarningsValue}>{fmt(earnings)}</Text>
            <Text style={st.driverEarningsNote}>По данным завершённых заказов</Text>
          </View>
          <Text style={st.driverEarningsIcon}>₽</Text>
        </View>
        <View style={st.vehicleEditorCard}>
          <View style={st.rowBetween}><Text style={st.heading}>Фото водителя</Text><Text style={st.vehicleEditorHint}>Для карточки поездки</Text></View>
          <View style={st.driverPhotoEditorRow}>
            {driverPhotoPreview ? <Image source={{ uri: driverPhotoPreview }} style={st.driverPhotoPreview} /> : <View style={st.driverPhotoPlaceholder}><Text style={st.driverPhotoPlaceholderText}>👤</Text></View>}
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={st.vehicleEditorHint}>Пассажир увидит это фото вместе с именем и рейтингом водителя</Text>
              <TouchableOpacity style={st.vehiclePhotoButton} onPress={chooseDriverPhoto} disabled={driverPhotoUploading}>
                {driverPhotoUploading ? <ActivityIndicator color={P.pinkDark}/> : <Text style={st.vehiclePhotoButtonText}>{driverPhotoPreview ? 'Изменить фото водителя' : 'Добавить фото водителя'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <View style={st.vehicleEditorCard}>
          <View style={st.rowBetween}><Text style={st.heading}>Мой автомобиль</Text><Text style={st.vehicleEditorHint}>Данные для пассажира</Text></View>
          {vehiclePhotoPreview ? <Image source={{ uri: vehiclePhotoPreview }} style={st.vehiclePhotoPreview} resizeMode="cover" /> : <View style={st.vehiclePhotoPlaceholder}><Text style={st.vehiclePhotoIcon}>🚘</Text><Text style={st.vehiclePhotoPlaceholderText}>Добавь фото своего автомобиля</Text></View>}
          <TouchableOpacity style={st.vehiclePhotoButton} onPress={chooseVehiclePhoto} disabled={vehicleUploading}>
            {vehicleUploading ? <ActivityIndicator color={P.pinkDark}/> : <Text style={st.vehiclePhotoButtonText}>{vehiclePhotoPreview ? 'Изменить фото машины' : 'Добавить фото машины'}</Text>}
          </TouchableOpacity>
          <TextInput style={st.phoneInput} value={vehicleForm.display_name} onChangeText={v=>setVehicleForm(p=>({...p,display_name:v}))} placeholder="Имя водителя (как увидит пассажир)" maxLength={120}/>
          <View style={st.vehicleInputRow}>
            <TextInput style={[st.phoneInput,{flex:1}]} value={vehicleForm.vehicle_make} onChangeText={v=>setVehicleForm(p=>({...p,vehicle_make:v}))} placeholder="Марка (например, Kia)" maxLength={60}/>
            <TextInput style={[st.phoneInput,{flex:1}]} value={vehicleForm.vehicle_model} onChangeText={v=>setVehicleForm(p=>({...p,vehicle_model:v}))} placeholder="Модель" maxLength={60}/>
          </View>
          <View style={st.vehicleInputRow}>
            <TextInput style={[st.phoneInput,{flex:1}]} value={vehicleForm.vehicle_color} onChangeText={v=>setVehicleForm(p=>({...p,vehicle_color:v}))} placeholder="Цвет" maxLength={40}/>
            <TextInput style={[st.phoneInput,{flex:1}]} value={vehicleForm.vehicle_year} onChangeText={v=>setVehicleForm(p=>({...p,vehicle_year:v.replace(/[^0-9]/g,'').slice(0,4)}))} placeholder="Год выпуска" keyboardType="number-pad" maxLength={4}/>
          </View>
          <TextInput style={st.phoneInput} value={vehicleForm.vehicle_plate} onChangeText={v=>setVehicleForm(p=>({...p,vehicle_plate:v.toUpperCase()}))} placeholder="Государственный номер" maxLength={24} autoCapitalize="characters"/>
          <TouchableOpacity style={st.vehicleSaveButton} onPress={saveVehicleProfile} disabled={vehicleSaving || vehicleUploading}>
            {vehicleSaving ? <ActivityIndicator color={P.white}/> : <Text style={st.vehicleSaveText}>Сохранить данные автомобиля</Text>}
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.driverTabs}>
          {tabs.map(([id,label]) => <TouchableOpacity key={id} onPress={()=>setDriverSection(id)} style={[st.driverTab,driverSection===id&&st.driverTabActive]}>
            <Text style={[st.driverTabText,driverSection===id&&st.driverTabTextActive]}>{label}{id==='available'&&available.length>0?'  '+available.length:''}</Text>
          </TouchableOpacity>)}
        </ScrollView>
        <View style={st.rowBetween}>
          <Text style={st.heading}>{driverSection==='available'?'Новые заявки':driverSection==='active'?'Мои активные поездки':driverSection==='history'?'История поездок':'Ближайшие действия'}</Text>
          {driverLoading && <ActivityIndicator color={P.pink}/>}
        </View>
        {shown.length===0 ? <View style={st.emptyCard}>
          <Text style={st.emptyIcon}>{driverSection==='history'?'◷':'⌁'}</Text>
          <Text style={st.heading}>{driverSection==='available'?'Новых заявок пока нет':driverSection==='active'?'Активных поездок нет':driverSection==='history'?'История пока пуста':'Всё спокойно'}</Text>
          <Text style={st.muted}>{driverSection==='available'?'Когда появится новая заявка, она отобразится здесь.':driverSection==='active'?'Принятые поездки будут собраны в этом разделе.':driverSection==='history'?'Завершённые поездки появятся здесь.':'Новые заявки и активные поездки будут показаны в этой панели.'}</Text>
          <TouchableOpacity style={st.driverSecondaryBtn} onPress={loadDriverOrders}><Text style={st.driverSecondaryText}>Обновить список</Text></TouchableOpacity>
        </View> : shown.map(o => <View key={o.id} style={st.driverOrderCard}>
          <View style={st.rowBetween}>
            <View style={[st.driverStatusPill, o.status==='new'?st.driverStatusNew:o.status==='completed'?st.driverStatusDone:st.driverStatusActive]}>
              <Text style={st.driverStatusText}>{STATUS[o.status]||o.status}</Text>
            </View>
            <Text style={st.orderDate}>{new Date(o.created_at).toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</Text>
          </View>
          <View style={st.driverRouteBlock}>
            <View style={st.driverRouteRail}><View style={st.driverRouteDotStart}/><View style={st.driverRouteLine}/><View style={st.driverRouteDotEnd}/></View>
            <View style={{flex:1,gap:12}}>
              <View><Text style={st.driverRouteCaption}>ОТКУДА</Text><Text style={st.driverRouteAddress}>{o.pickup_address||'Адрес подачи не указан'}</Text></View>
              <View><Text style={st.driverRouteCaption}>КУДА</Text><Text style={st.driverRouteAddress}>{o.destination_address||'Адрес назначения не указан'}</Text></View>
            </View>
          </View>
          <View style={st.driverOrderMeta}>
            <View><Text style={st.driverRouteCaption}>СТОИМОСТЬ</Text><Text style={st.driverOrderPrice}>{o.price_rub?fmt(o.price_rub):o.estimated_price_rub?fmt(o.estimated_price_rub):'Уточняется'}</Text></View>
            <View style={{alignItems:'flex-end'}}><Text style={st.driverRouteCaption}>ОПЛАТА</Text><Text style={st.driverOrderPayment}>{o.payment_method==='cash'?'Наличные':o.payment_method?'Перевод':'По договорённости'}</Text></View>
          </View>
          {o.status==='new'&&!o.driver_id ? <View style={st.driverActions}>
            <TextInput style={st.phoneInput} keyboardType="numeric" placeholder="Согласованная стоимость, ₽" value={driverPrices[o.id]||String(o.estimated_price_rub||'')} onChangeText={v=>setDriverPrices(p=>({...p,[o.id]:v}))}/>
            <TouchableOpacity style={st.primaryBtn} onPress={()=>acceptDriverOrder(o)} disabled={busy}><Text style={st.primaryText}>{busy?'Обработка…':'Принять заявку'}</Text></TouchableOpacity>
          </View> : o.driver_id===session.user.id && <View style={st.driverActions}>
            {o.status==='accepted'&&<TouchableOpacity style={st.primaryBtn} onPress={()=>updateDriverStatus(o,'arrived')} disabled={busy}><Text style={st.primaryText}>Отметить прибытие</Text></TouchableOpacity>}
            {o.status==='arrived'&&<TouchableOpacity style={st.primaryBtn} onPress={()=>updateDriverStatus(o,'in_progress')} disabled={busy}><Text style={st.primaryText}>Начать поездку</Text></TouchableOpacity>}
            {o.status==='in_progress'&&<TouchableOpacity style={st.primaryBtn} onPress={()=>updateDriverStatus(o,'completed')} disabled={busy}><Text style={st.primaryText}>Завершить поездку</Text></TouchableOpacity>}
            {chatOrder?.id===o.id&&renderTripChat()}
          </View>}
        </View>)}
        <Text style={st.footnote}>Панель предназначена для совершеннолетних водителей, прошедших проверку LadyGo.</Text>
      </ScrollView>;
    })()}
    {tab === 'apply' && profile?.role === 'passenger' && <ScrollView contentContainerStyle={st.pageContent} keyboardShouldPersistTaps="handled">
      <Text style={st.pageTitle}>Анкета водителя</Text>
      <Text style={st.muted}>Заполни данные. После отправки администратор проверит заявку лично.</Text>
      <TextInput style={st.authInput} placeholder="ФИО полностью *" value={application.full_name} onChangeText={v=>setApplication(p=>({...p,full_name:v}))}/>
      <TextInput style={st.authInput} placeholder="Телефон *" keyboardType="phone-pad" value={application.phone} onChangeText={v=>setApplication(p=>({...p,phone:v}))}/>
      <TextInput style={st.authInput} placeholder="Стаж вождения" value={application.experience} onChangeText={v=>setApplication(p=>({...p,experience:v}))}/>
      <Text style={st.sectionTitle}>Автомобиль</Text>
      <TextInput style={st.authInput} placeholder="Марка *" value={application.vehicle_make} onChangeText={v=>setApplication(p=>({...p,vehicle_make:v}))}/>
      <TextInput style={st.authInput} placeholder="Модель *" value={application.vehicle_model} onChangeText={v=>setApplication(p=>({...p,vehicle_model:v}))}/>
      <TextInput style={st.authInput} placeholder="Цвет" value={application.vehicle_color} onChangeText={v=>setApplication(p=>({...p,vehicle_color:v}))}/>
      <TextInput style={st.authInput} placeholder="Госномер" value={application.vehicle_plate} onChangeText={v=>setApplication(p=>({...p,vehicle_plate:v}))}/>
      <TextInput style={st.authInput} placeholder="Год выпуска" keyboardType="numeric" value={application.vehicle_year} onChangeText={v=>setApplication(p=>({...p,vehicle_year:v}))}/>
      <TextInput style={st.authInput} placeholder="Информация о водительских документах" value={application.license_info} onChangeText={v=>setApplication(p=>({...p,license_info:v}))}/>
      <Text style={st.sectionTitle}>Фотографии</Text>
      <View style={st.adminPhotoRow}>
        <TouchableOpacity style={st.applicationPhotoButton} onPress={()=>uploadApplicationPhoto('avatar')}><Text style={st.applicationPhotoText}>{applicationAvatar?'✓ Фото профиля добавлено':'+ Фото профиля'}</Text></TouchableOpacity>
        <TouchableOpacity style={st.applicationPhotoButton} onPress={()=>uploadApplicationPhoto('vehicle')}><Text style={st.applicationPhotoText}>{applicationVehiclePhoto?'✓ Фото машины добавлено':'+ Фото машины'}</Text></TouchableOpacity>
      </View>
      <TouchableOpacity style={st.adultConfirm} onPress={()=>setApplicationAdult(v=>!v)}><Text style={st.adultConfirmText}>{applicationAdult?'☑':'□'} Мне исполнилось 18 лет</Text></TouchableOpacity>
      <TouchableOpacity style={[st.primaryBtn,(!applicationAdult||applicationSaving)&&st.disabled]} onPress={submitDriverApplication} disabled={!applicationAdult||applicationSaving}>
        {applicationSaving?<ActivityIndicator color={P.white}/>:<Text style={st.primaryText}>Отправить анкету</Text>}
      </TouchableOpacity>
      <Text style={st.footnote}>К работе допускаются только совершеннолетние кандидаты после проверки документов администратором.</Text>
    </ScrollView>}
    {tab === 'profile' && <ScrollView contentContainerStyle={st.pageContent}><Text style={st.pageTitle}>Профиль</Text>
      <View style={st.profileCard}><View style={st.profileAvatar}><Text style={st.profileAvatarText}>{(profile?.phone || profile?.email || 'L').slice(0,1).toUpperCase()}</Text></View><Text style={st.heading}>{profile?.phone || profile?.email || 'Аккаунт LadyGo'}</Text><Text style={st.muted}>{profile?.role === 'driver' ? 'Водитель' : profile?.role === 'admin' ? 'Администратор' : 'Пассажир'}</Text></View>
      <TouchableOpacity style={st.profileRow} onPress={() => setTab('orders')}><Text style={st.profileRowIcon}>◷</Text><Text style={st.profileRowText}>История поездок</Text><Text style={st.chevron}>›</Text></TouchableOpacity>
      {profile?.role === 'admin' && <TouchableOpacity style={st.profileRow} onPress={() => { setTab('admin'); loadAdminOrders(); loadAdminApplications(); loadAdminDrivers(); }}><Text style={st.profileRowIcon}>⚙</Text><Text style={st.profileRowText}>Панель администратора</Text><Text style={st.chevron}>›</Text></TouchableOpacity>}
      {profile?.role === 'passenger' && (myApplication?.status === 'pending' ? <View style={st.applicationStatusCard}><Text style={st.applicationStatusTitle}>Заявка водителя на проверке</Text><Text style={st.muted}>Мы сообщим результат после рассмотрения администратором.</Text></View> : myApplication?.status === 'rejected' ? <View style={st.applicationStatusCard}><Text style={st.applicationStatusTitle}>Заявка отклонена</Text><Text style={st.muted}>{myApplication.review_note || myApplication.admin_note || 'Можно обратиться в поддержку.'}</Text></View> : <TouchableOpacity style={st.profileRow} onPress={() => setTab('apply')}><Text style={st.profileRowIcon}>🚘</Text><Text style={st.profileRowText}>Стать водителем LadyGo</Text><Text style={st.chevron}>›</Text></TouchableOpacity>)}

      <TouchableOpacity style={st.profileRow} onPress={() => Linking.openURL('mailto:ladygosupport@gmail.com')}><Text style={st.profileRowIcon}>?</Text><Text style={st.profileRowText}>Поддержка</Text><Text style={st.chevron}>›</Text></TouchableOpacity>
      <TouchableOpacity style={st.profileRow} onPress={() => Linking.openURL('tel:+79911121227')}><Text style={st.profileRowIcon}>☎</Text><Text style={st.profileRowText}>Заказать по телефону</Text><Text style={st.chevron}>›</Text></TouchableOpacity>
      <TouchableOpacity style={st.logout} onPress={signOut}><Text style={st.logoutText}>Выйти из аккаунта</Text></TouchableOpacity>
      <Text style={st.footnote}>LadyGo · 6.8.0 · Создано независимым автором @acyma</Text>
    </ScrollView>}
    <View style={st.bottomNav}>
      {([['ride','⌖','Заказать'],['orders','◷','Поездки'],['profile','○','Профиль']]).map(([id,icon,label]) => <TouchableOpacity key={id} style={st.navItem} onPress={() => setTab(id)}><Text style={[st.navIcon, tab === id && st.navActive]}>{icon}</Text><Text style={[st.navLabel, tab === id && st.navActive]}>{label}</Text></TouchableOpacity>)}
    </View>
  </SafeAreaView>;
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.white },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: P.white },
  auth: { flex: 1, backgroundColor: P.white, padding: 24, justifyContent: 'center' },
  authLogo: { alignItems: 'center', marginBottom: 38 },
  logo: { color: P.pink, fontSize: 42, fontWeight: '900', letterSpacing: -2 },
  tagline: { color: P.muted, fontSize: 15, marginTop: 4 },
  authCard: { gap: 14 },
  heading: { color: P.ink, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  authInput: { borderWidth: 1, borderColor: P.line, borderRadius: 16, padding: 17, fontSize: 16, color: P.ink, backgroundColor: '#FBFAFB' },
  primaryBtn: { backgroundColor: P.pink, minHeight: 56, borderRadius: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 8 },
  primaryText: { color: P.white, fontSize: 16, fontWeight: '800' },
  phoneOrderBtn: { minHeight: 52, borderRadius: 16, borderWidth: 1.5, borderColor: P.pink, backgroundColor: P.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  phoneOrderText: { color: P.pinkDark, fontSize: 15, fontWeight: '800' },
  switchText: { color: P.pinkDark, textAlign: 'center', fontWeight: '700', padding: 12 },
  footnote: { color: '#A69DA3', fontSize: 11, textAlign: 'center', marginTop: 20 },
  topbar: { height: 62, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: P.white, borderBottomWidth: 1, borderColor: '#F2EEF0' },
  logoSmall: { color: P.pink, fontSize: 25, fontWeight: '900', letterSpacing: -1 },
  topSub: { color: P.muted, fontSize: 10, marginTop: -2 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: P.pale, alignItems: 'center', justifyContent: 'center' },
  modeSwitch: { flexDirection: 'row', backgroundColor: '#F3EEF1', borderRadius: 16, padding: 4, gap: 3, borderWidth: 1, borderColor: '#EDE5E9', flexShrink: 1 },
  modeOption: { paddingHorizontal: 9, paddingVertical: 9, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modeOptionActive: { backgroundColor: P.pink, elevation: 2, shadowColor: P.pinkDark, shadowOpacity: 0.2, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  modeText: { color: P.muted, fontSize: 10, fontWeight: '900' },
  modeTextActive: { color: P.white },
  adminTopButton: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 13, backgroundColor: P.pale, borderWidth: 1, borderColor: '#F5C7D8' },
  adminTopButtonActive: { backgroundColor: P.pink, borderColor: P.pink },
  adminTopButtonText: { color: P.pinkDark, fontSize: 12, fontWeight: '900' },
  adminTopButtonTextActive: { color: P.white },
  adminRefresh: { width: 42, height: 42, borderRadius: 14, backgroundColor: P.pale, alignItems: 'center', justifyContent: 'center' },
  adminRefreshText: { color: P.pinkDark, fontSize: 25, fontWeight: '900' },
  adminStats: { flexDirection: 'row', gap: 9 },
  adminStat: { flex: 1, backgroundColor: '#FAF6F8', borderWidth: 1, borderColor: P.line, borderRadius: 16, padding: 13, gap: 5 },
  adminStatValue: { color: P.pinkDark, fontSize: 24, fontWeight: '900' },
  adminStatLabel: { color: P.muted, fontSize: 10, fontWeight: '800' },
  adminHero: { flexDirection:'row', alignItems:'center', gap:12, backgroundColor:'#FFF5F8', borderWidth:1, borderColor:'#F5D8E3', borderRadius:20, padding:16 },
  adminEyebrow: { color:P.pinkDark, fontSize:9, fontWeight:'900', letterSpacing:1.2, marginBottom:5 },
  adminTabs: { flexDirection:'row', gap:7, flexWrap:'wrap' },
  adminTab: { paddingHorizontal:12, paddingVertical:11, borderRadius:13, backgroundColor:'#F5F1F3', borderWidth:1, borderColor:P.line },
  adminTabActive: { backgroundColor:P.pink, borderColor:P.pink },
  adminTabText: { color:P.muted, fontSize:11, fontWeight:'800' },
  adminTabTextActive: { color:P.white },
  adminApplicationCard: { backgroundColor:P.white, borderWidth:1, borderColor:P.line, borderRadius:18, padding:15, gap:8 },
  adminApplicantName: { color:P.ink, fontSize:16, fontWeight:'900', flexShrink:1 },
  adminDetail: { color:P.ink, fontSize:12, lineHeight:17 },
  adminDate: { color:P.muted, fontSize:10 },
  adminStatus: { overflow:'hidden', borderRadius:20, paddingHorizontal:9, paddingVertical:6, fontSize:10, fontWeight:'900' },
  adminStatusPending: { backgroundColor:'#FFF0D7', color:'#8A5A00' },
  adminStatusApproved: { backgroundColor:'#E5F6EC', color:'#247448' },
  adminStatusRejected: { backgroundColor:'#FCE8EC', color:'#A8324C' },
  adminPhotoRow: { flexDirection:'row', gap:10, flexWrap:'wrap', alignItems:'center' },
  adminPhoto: { width:64, height:64, borderRadius:15, backgroundColor:P.pale },
  adminCarPhoto: { width:132, height:82, borderRadius:13, backgroundColor:P.pale },
  adminActionRow: { flexDirection:'row', gap:9, marginTop:4 },
  adminApprove: { flex:1, minHeight:44, borderRadius:13, backgroundColor:'#218653', alignItems:'center', justifyContent:'center' },
  adminReject: { flex:1, minHeight:44, borderRadius:13, backgroundColor:'#FFF0F3', borderWidth:1, borderColor:'#F2C6D2', alignItems:'center', justifyContent:'center' },
  adminActionText: { color:'#FFFFFF', fontWeight:'900', fontSize:12 },
  adminRejectText: { color:'#B63254', fontWeight:'900', fontSize:12 },
  applicationStatusCard: { backgroundColor:'#FFF5F8', borderRadius:16, padding:15, gap:6, borderWidth:1, borderColor:'#F5D8E3' },
  applicationStatusTitle: { color:P.pinkDark, fontWeight:'900', fontSize:14 },
  applicationPhotoButton: { flex:1, minHeight:52, padding:10, borderRadius:13, backgroundColor:P.pale, alignItems:'center', justifyContent:'center' },
  applicationPhotoText: { color:P.pinkDark, fontSize:11, fontWeight:'900', textAlign:'center' },
  adultConfirm: { padding:14, borderRadius:14, backgroundColor:'#F7F4F6', borderWidth:1, borderColor:P.line },
  adultConfirmText: { color:P.ink, fontSize:13, fontWeight:'800' },
  driverHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  driverEyebrow: { color: P.pinkDark, fontSize: 9, fontWeight: '900', letterSpacing: 1.3, marginBottom: 5 },
  driverSubtitle: { color: P.muted, fontSize: 12, lineHeight: 17, marginTop: -2 },
  driverRefresh: { width: 44, height: 44, borderRadius: 15, backgroundColor: P.pale, alignItems: 'center', justifyContent: 'center' },
  driverRefreshText: { color: P.pinkDark, fontSize: 26, fontWeight: '900' },
  driverModeHint: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderRadius: 17, backgroundColor: '#FFF5F8', borderWidth: 1, borderColor: '#F6D8E3' },
  driverModeIcon: { fontSize: 24 },
  driverModeTitle: { color: P.ink, fontSize: 13, fontWeight: '900' },
  driverModeSub: { color: P.muted, fontSize: 10, marginTop: 3 },
  driverOnlineDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: P.green },
  shiftButton: { minHeight: 52, borderRadius: 16, backgroundColor: P.green, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  shiftButtonOff: { backgroundColor: P.pink },
  shiftButtonText: { color: P.white, fontSize: 15, fontWeight: '900' },
  driverStatsGrid: { flexDirection: 'row', gap: 8 },
  driverStatCard: { flex: 1, backgroundColor: '#FAF7F9', borderWidth: 1, borderColor: P.line, borderRadius: 15, padding: 12, gap: 7 },
  driverStatValue: { color: P.pinkDark, fontSize: 24, fontWeight: '900' },
  driverStatLabel: { color: P.muted, fontSize: 9, fontWeight: '800', lineHeight: 13 },
  driverEarningsCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#211B20', borderRadius: 18, padding: 16 },
  driverEarningsLabel: { color: '#E9DDE3', fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  driverEarningsValue: { color: P.white, fontSize: 25, fontWeight: '900', marginTop: 5 },
  driverEarningsNote: { color: '#C5B8C0', fontSize: 10, marginTop: 2 },
  driverEarningsIcon: { color: '#F6A9C5', fontSize: 36, fontWeight: '900', paddingHorizontal: 8 },
  driverTabs: { gap: 7, paddingVertical: 2 },
  driverTab: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 13, backgroundColor: '#F6F3F5', borderWidth: 1, borderColor: '#EEE8EC' },
  driverTabActive: { backgroundColor: P.pink, borderColor: P.pink },
  driverTabText: { color: P.muted, fontSize: 11, fontWeight: '800' },
  driverTabTextActive: { color: P.white },
  driverSecondaryBtn: { paddingHorizontal: 17, paddingVertical: 11, borderRadius: 13, backgroundColor: P.pale, marginTop: 5 },
  driverSecondaryText: { color: P.pinkDark, fontSize: 12, fontWeight: '900' },
  driverOrderCard: { borderWidth: 1, borderColor: P.line, borderRadius: 19, padding: 15, gap: 13, backgroundColor: P.white },
  driverStatusPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  driverStatusNew: { backgroundColor: '#FFF1D9' },
  driverStatusActive: { backgroundColor: '#FCE5EE' },
  driverStatusDone: { backgroundColor: '#E6F5EE' },
  driverStatusText: { color: P.ink, fontSize: 10, fontWeight: '900' },
  driverRouteBlock: { flexDirection: 'row', gap: 12, paddingVertical: 3 },
  driverRouteRail: { width: 12, alignItems: 'center', paddingVertical: 3 },
  driverRouteDotStart: { width: 9, height: 9, borderRadius: 5, backgroundColor: P.green },
  driverRouteLine: { width: 1, height: 24, backgroundColor: '#D8CFD5' },
  driverRouteDotEnd: { width: 9, height: 9, borderRadius: 5, backgroundColor: P.pink },
  driverRouteCaption: { color: P.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, marginBottom: 3 },
  driverRouteAddress: { color: P.ink, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  driverOrderMeta: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: '#F1EDF0', paddingTop: 11 },
  driverOrderPrice: { color: P.pinkDark, fontSize: 17, fontWeight: '900' },
  driverOrderPayment: { color: P.ink, fontSize: 12, fontWeight: '800' },
  driverActions: { gap: 8 },
  chatCard: { backgroundColor: '#FFFAFC', borderWidth: 1, borderColor: '#F4DCE6', borderRadius: 18, padding: 13, gap: 10 },
  chatHint: { color: P.muted, fontSize: 10, fontWeight: '700' },
  chatMessages: { maxHeight: 230, minHeight: 90 },
  chatEmpty: { color: P.muted, fontSize: 13, textAlign: 'center', padding: 18, lineHeight: 19 },
  chatBubble: { maxWidth: '86%', borderRadius: 15, padding: 10, marginVertical: 4, gap: 3 },
  chatMine: { alignSelf: 'flex-end', backgroundColor: '#FCE5EE', borderBottomRightRadius: 5 },
  chatOther: { alignSelf: 'flex-start', backgroundColor: '#F1EEF0', borderBottomLeftRadius: 5 },
  chatSender: { color: P.pinkDark, fontSize: 10, fontWeight: '900' },
  chatMessage: { color: P.ink, fontSize: 14, lineHeight: 19 },
  chatTime: { color: P.muted, fontSize: 9, textAlign: 'right' },
  chatComposer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  chatInput: { flex: 1, minHeight: 44, maxHeight: 100, borderWidth: 1, borderColor: P.line, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, color: P.ink, backgroundColor: P.white, fontSize: 14 },
  chatSend: { width: 44, height: 44, borderRadius: 14, backgroundColor: P.pink, alignItems: 'center', justifyContent: 'center' },
  chatSendText: { color: P.white, fontSize: 19, fontWeight: '900' },
  avatarText: { color: P.pinkDark, fontWeight: '900', fontSize: 16 },
  map: { height: 280, backgroundColor: '#E9E7E3' },
  mapControls: { position: 'absolute', left: 9, bottom: 12, gap: 6, alignItems: 'flex-start' },
  locateButton: { height: 34, paddingHorizontal: 10, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.97)', justifyContent: 'center', elevation: 3, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  locateButtonText: { color: P.pinkDark, fontSize: 11, fontWeight: '800' },
  mapControlRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  mapControl: { width: 34, height: 34, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.96)', alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  mapControlActive: { backgroundColor: P.pink },
  mapControlText: { color: P.ink, fontSize: 19, fontWeight: '800', lineHeight: 23 },
  mapControlTextActive: { color: P.white },
  locateText: { color: P.pink, fontSize: 22, fontWeight: '800' },
  mapLabel: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: P.white, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, elevation: 2 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: P.green },
  mapLabelText: { color: P.ink, fontSize: 12, fontWeight: '700' },
  sheet: { flex: 1, backgroundColor: P.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -18 },
  sheetContent: { padding: 18, paddingBottom: 26, gap: 12 },
  sheetHandle: { width: 38, height: 4, borderRadius: 3, backgroundColor: '#DDD7DC', alignSelf: 'center', marginBottom: 3 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cityPill: { backgroundColor: P.pale, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20 },
  cityPillText: { color: P.pinkDark, fontSize: 11, fontWeight: '800' },
  field: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#FAF9FA', borderWidth: 1, borderColor: P.line, borderRadius: 16 },
  fieldIcon: { color: P.pink, fontSize: 16, fontWeight: '900' },
  fieldLabel: { color: P.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  fieldInput: { color: P.ink, fontSize: 16, padding: 0, marginTop: 3, minHeight: 25 },
  connector: { height: 7, width: 1, backgroundColor: '#D7CDD3', marginLeft: 23, marginTop: -12, marginBottom: -12, zIndex: 2 },
  locateRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 5 },
  locateRowIcon: { color: P.pink, fontSize: 18 },
  locateRowText: { color: P.pinkDark, fontSize: 13, fontWeight: '700' },
  routeMeta: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F8F6F7', padding: 11, borderRadius: 12 },
  routeMetaText: { color: P.muted, fontSize: 12, fontWeight: '700' },
  sectionTitle: { color: P.ink, fontSize: 15, fontWeight: '800', marginTop: 6 },
  tariffs: { flexDirection: 'row', gap: 8 },
  tariff: { flex: 1, minHeight: 80, borderWidth: 1, borderColor: P.line, borderRadius: 14, alignItems: 'center', justifyContent: 'center', padding: 7, gap: 5, backgroundColor: P.white },
  tariffSelected: { borderColor: P.pink, backgroundColor: P.pale },
  tariffIcon: { color: P.pink, fontSize: 20, fontWeight: '900' },
  tariffName: { color: P.ink, fontSize: 12, fontWeight: '800' },
  tariffPrice: { color: P.pinkDark, fontSize: 11, fontWeight: '800' },
  priceCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAF7F8', borderRadius: 15, padding: 14, gap: 10 },
  priceTitle: { color: P.ink, fontWeight: '800', fontSize: 13 },
  priceHint: { color: P.muted, fontSize: 11, marginTop: 3 },
  priceValue: { color: P.pinkDark, fontWeight: '900', fontSize: 19 },
  payRow: { flexDirection: 'row', gap: 9 },
  payOption: { flex: 1, borderWidth: 1, borderColor: P.line, borderRadius: 13, padding: 12, alignItems: 'center', gap: 4 },
  paySelected: { borderColor: P.pink, backgroundColor: P.pale },
  payIcon: { color: P.pink, fontSize: 18, fontWeight: '900' },
  payText: { color: P.ink, fontSize: 12, fontWeight: '700' },
  phoneInput: { borderWidth: 1, borderColor: P.line, borderRadius: 13, padding: 14, fontSize: 14, color: P.ink },
  disabled: { opacity: 0.45 },
  bottomNav: { height: 62, flexDirection: 'row', borderTopWidth: 1, borderColor: P.line, backgroundColor: P.white, paddingBottom: Platform.OS === 'android' ? 4 : 0 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  navIcon: { color: '#A69EA4', fontSize: 21, fontWeight: '800' },
  navLabel: { color: '#9C949A', fontSize: 10, fontWeight: '700' },
  navActive: { color: P.pinkDark },
  searchScreen: { flex: 1, backgroundColor: P.white },
  searchTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10, minHeight: 60, borderBottomWidth: 1, borderColor: P.line },
  back: { color: P.pink, fontSize: 34, lineHeight: 38 },
  searchInput: { flex: 1, fontSize: 17, color: P.ink, paddingVertical: 12 },
  clear: { color: P.muted, fontSize: 26, paddingHorizontal: 5 },
  suggestion: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 17, paddingVertical: 15, borderBottomWidth: 1, borderColor: '#F3EFF1' },
  suggestionIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: P.pale, alignItems: 'center', justifyContent: 'center' },
  suggestionTitle: { color: P.ink, fontSize: 15, fontWeight: '700' },
  suggestionSub: { color: P.muted, fontSize: 12, marginTop: 3 },
  empty: { color: P.muted, textAlign: 'center', padding: 25, lineHeight: 21 },
  pageContent: { padding: 18, gap: 13, paddingBottom: 28 },
  pageTitle: { color: P.ink, fontSize: 27, fontWeight: '900', marginBottom: 5 },
  emptyCard: { alignItems: 'center', padding: 28, backgroundColor: '#FAF8F9', borderRadius: 20, gap: 10 },
  emptyIcon: { color: P.pink, fontSize: 38 },
  muted: { color: P.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  orderCard: { borderWidth: 1, borderColor: P.line, borderRadius: 17, padding: 15, gap: 10, backgroundColor: P.white },
  orderStatus: { color: P.pinkDark, fontSize: 13, fontWeight: '900' },
  orderDate: { color: P.muted, fontSize: 11 },
  orderAddress: { color: P.ink, fontSize: 13, lineHeight: 19 },
  orderPrice: { color: P.ink, fontSize: 16, fontWeight: '900' },
  cancelText: { color: '#C23F5B', fontSize: 12, fontWeight: '800' },
  profileCard: { alignItems: 'center', backgroundColor: P.pale, borderRadius: 20, padding: 24, gap: 7 },
  profileAvatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: P.white, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  profileAvatarText: { color: P.pink, fontSize: 28, fontWeight: '900' },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 16, borderBottomWidth: 1, borderColor: P.line },
  profileRowIcon: { color: P.pink, fontSize: 19, width: 24 },
  profileRowText: { flex: 1, color: P.ink, fontSize: 14, fontWeight: '700' },
  chevron: { color: P.muted, fontSize: 22 },
  logout: { alignItems: 'center', padding: 16, marginTop: 8 },
  logoutText: { color: '#C23F5B', fontSize: 14, fontWeight: '800' },
  refreshText: { color: P.pinkDark, fontSize: 13, fontWeight: '800', marginBottom: 10 },
  ratingSummary: { color: P.pinkDark, fontSize: 12, fontWeight: '800' },
  rateBox: { backgroundColor: '#FFF5F8', borderWidth: 1, borderColor: '#F5D6E2', borderRadius: 14, padding: 12, gap: 8 },
  rateTitle: { color: P.ink, fontSize: 13, fontWeight: '800' },
  rateStars: { flexDirection: 'row', gap: 10 },
  rateStar: { color: '#D8CFD4', fontSize: 30 },
  rateStarActive: { color: '#F3A72F' },
  rateSubmit: { backgroundColor: P.pink, paddingVertical: 11, borderRadius: 12, alignItems: 'center' },
  rateSubmitText: { color: P.white, fontSize: 13, fontWeight: '900' },
  ratingThanks: { color: P.green, fontSize: 12, fontWeight: '800' },
  ratingDriverCard: { backgroundColor: '#FFF5F8', borderColor: '#F5D6E2', borderWidth: 1, borderRadius: 16, padding: 14, gap: 5 },
  ratingDriverLabel: { color: P.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  ratingDriverValue: { color: P.pinkDark, fontSize: 24, fontWeight: '900' },
  ratingDriverCount: { color: P.muted, fontSize: 12, fontWeight: '700' },
  vehicleEditorCard: { backgroundColor: P.white, borderColor: P.line, borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  vehicleEditorHint: { color: P.muted, fontSize: 10, fontWeight: '700' },
  vehiclePhotoPreview: { width: '100%', height: 170, borderRadius: 14, backgroundColor: P.pale },
  vehiclePhotoPlaceholder: { width: '100%', height: 130, borderRadius: 14, backgroundColor: P.pale, alignItems: 'center', justifyContent: 'center', gap: 8 },
  vehiclePhotoIcon: { fontSize: 36 },
  vehiclePhotoPlaceholderText: { color: P.muted, fontSize: 12, fontWeight: '700' },
  vehiclePhotoButton: { borderWidth: 1, borderColor: P.pink, borderRadius: 12, padding: 12, alignItems: 'center' },
  vehiclePhotoButtonText: { color: P.pinkDark, fontSize: 13, fontWeight: '800' },
  vehicleInputRow: { flexDirection: 'row', gap: 8 },
  vehicleSaveButton: { backgroundColor: P.pink, borderRadius: 13, padding: 14, alignItems: 'center' },
  vehicleSaveText: { color: P.white, fontSize: 13, fontWeight: '900' },
  passengerDriverRow: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 12 },
  passengerDriverPhoto: { width: 62, height: 62, borderRadius: 31, backgroundColor: P.pale },
  passengerDriverPlaceholder: { width: 62, height: 62, borderRadius: 31, backgroundColor: P.pale, alignItems: 'center', justifyContent: 'center' },
  passengerDriverInitial: { color: P.pinkDark, fontSize: 25, fontWeight: '900' },
  passengerDriverRating: { color: '#C17A18', fontSize: 13, fontWeight: '900' },
  driverPhotoEditorRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  driverPhotoPreview: { width: 92, height: 92, borderRadius: 46, backgroundColor: P.pale },
  driverPhotoPlaceholder: { width: 92, height: 92, borderRadius: 46, backgroundColor: P.pale, alignItems: 'center', justifyContent: 'center' },
  driverPhotoPlaceholderText: { fontSize: 34 },
  passengerVehiclePhoto: { width: '100%', height: 180, borderRadius: 14, marginBottom: 10, backgroundColor: P.pale }
});
