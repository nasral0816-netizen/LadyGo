import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, BackHandler, Keyboard, Linking, Platform, SafeAreaView, ScrollView,
  StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View, Image
} from 'react-native';
import { Camera, GeoJSONSource, Layer, Map as MapLibreView } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

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
  if (/invalid login credentials|invalid email or password/.test(message)) return 'Неверная почта или пароль.';
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
  const clean = String(q || '').replace(/\s+/g, ' ').trim();
  if (clean.length < 2) return [];

  const explicitCity = /краснодар|саратов|кисловодск|пятигорск|ессентуки|минеральн|черкесск|невинномысск|ставропол|георгиевск|железноводск|лермонтов|подкумок|карачаевск|домбай/i.test(clean);
  const localSuffix = 'Кисловодск, Ставропольский край, Россия';
  const searches = explicitCity
    ? [...new Set([clean, clean + ', Россия'])]
    : [...new Set([
        clean + ', ' + localSuffix,
        'улица ' + clean + ', ' + localSuffix,
        clean + ', Пятигорск, Ставропольский край, Россия',
        clean + ', Ессентуки, Ставропольский край, Россия',
        clean + ', Черкесск, Карачаево-Черкесия, Россия',
        clean
      ])];

  const found = [];
  const seen = new Set();
  const localityOnly = new Set(['city', 'town', 'village', 'municipality', 'administrative']);
  const addResult = (item, source) => {
    const latitude = Number(item.latitude);
    const longitude = Number(item.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
    const key = item.id || (latitude.toFixed(5) + ':' + longitude.toFixed(5));
    if (seen.has(key)) return;
    seen.add(key);
    const detail = item.detail || 'Россия';
    found.push({
      id: String(key),
      label: item.label || clean,
      detail,
      latitude,
      longitude,
      localRank: /кисловодск/i.test(detail) ? 0 :
        /ставропольский край|карачаево-черкес/i.test(detail) ? 1 : 2,
      source
    });
  };

  // Photon: ищем сразу несколькими формулировками, а не ждём ответа каждой по очереди.
  await Promise.allSettled(searches.map(async search => {
    const url = 'https://photon.komoot.io/api/?lang=ru&limit=15&lat=43.9052&lon=42.7168&q=' + encodeURIComponent(search);
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) return;
    const json = await response.json();
    for (const feature of json.features || []) {
      const p = feature.properties || {};
      const coords = feature.geometry?.coordinates || [];
      const placeKind = String(p.osm_value || '').toLowerCase();
      const isLocality = String(p.osm_key || '').toLowerCase() === 'place' && localityOnly.has(placeKind);
      if (isLocality && !explicitCity) continue;
      if (!explicitCity && p.country && !/россия|russia/i.test(p.country)) continue;
      const name = p.name || p.street || p.locality || p.city || clean;
      const city = p.city || p.town || p.village || p.locality;
      const label = [name, p.housenumber, city && city !== name ? city : null].filter(Boolean).join(', ');
      const detail = [p.district, city, p.state, p.country].filter((v, i, arr) => v && arr.indexOf(v) === i).join(', ');
      addResult({
        id: String(p.osm_type || '') + ':' + String(p.osm_id || '') + ':' + Number(coords[1]).toFixed(5) + ':' + Number(coords[0]).toFixed(5),
        label, detail, latitude: coords[1], longitude: coords[0]
      }, 'photon');
    }
  }));

  // Резервный поиск OpenStreetMap запускается, только если Photon ничего не вернул.
  if (found.length === 0) {
    const fallbackQueries = explicitCity ? [clean] : [clean + ', Кисловодск, Россия', clean + ', Россия'];
    for (const fallbackQuery of fallbackQueries) {
      try {
        const params = [
          'format=jsonv2', 'addressdetails=1', 'limit=12', 'countrycodes=ru',
          'accept-language=ru', 'q=' + encodeURIComponent(fallbackQuery)
        ].join('&');
        const response = await fetch('https://nominatim.openstreetmap.org/search?' + params, {
          headers: { Accept: 'application/json', 'Accept-Language': 'ru' }
        });
        if (!response.ok) continue;
        const rows = await response.json();
        for (const row of rows || []) {
          const a = row.address || {};
          const city = a.city || a.town || a.village || a.municipality || a.hamlet || '';
          const street = a.road || a.pedestrian || a.residential || a.street || '';
          const number = a.house_number || '';
          const label = street
            ? [street, number, city].filter(Boolean).join(', ')
            : String(row.name || row.display_name || clean).split(',').slice(0, 2).join(', ');
          const detail = [a.suburb, city, a.state, a.country].filter(Boolean).join(', ');
          addResult({
            id: 'nominatim:' + String(row.place_id || row.osm_id || row.lat + ':' + row.lon),
            label, detail, latitude: row.lat, longitude: row.lon
          }, 'nominatim');
        }
        if (found.length) break;
      } catch (_) {}
    }
  }

  found.sort((a, b) => a.localRank - b.localRank);
  return found.slice(0, 12).map(({ localRank, source, ...item }) => item);
}

function MapPanel({ pickup, destination, route, onLocate, onPickDestination, pickingDestination, driverLocation, allowPickDestination = true }) {
  const cameraRef = useRef(null);
  const [zoom, setZoom] = useState(17);
  const [is3D, setIs3D] = useState(true);
  const [focusPoint, setFocusPoint] = useState(null);
  useEffect(() => {
    if (pickup && !focusPoint) {
      setFocusPoint([pickup.longitude, pickup.latitude]);
      setZoom(17);
      setIs3D(true);
    }
  }, [pickup, focusPoint]);
  const points = [pickup && { ...pickup, label: 'А', color: P.green }, destination && { ...destination, label: 'Б', color: P.pink }].filter(Boolean);
  const features = points.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] }, properties: { label: p.label, color: p.color } }));
  const line = { type: 'Feature', geometry: { type: 'LineString', coordinates: route.map(p => [p.longitude, p.latitude]) }, properties: {} };
  const carFeature = driverLocation ? { type: 'Feature', geometry: { type: 'Point', coordinates: [driverLocation.longitude, driverLocation.latitude] }, properties: {} } : null;
  const coords = points.map(p => [p.longitude, p.latitude]).concat(route.map(p => [p.longitude, p.latitude]), driverLocation ? [[driverLocation.longitude, driverLocation.latitude]] : []);
  const center = coords.length ? [coords.reduce((s,p)=>s+p[0],0)/coords.length, coords.reduce((s,p)=>s+p[1],0)/coords.length] : [42.7168,43.9052];
  return <View style={st.map}>
    <MapLibreView style={{ flex: 1 }} mapStyle={P.map} androidView="texture" attribution logo={false} compass dragPan touchZoom doubleTapZoom
      onPress={event => {
        if (!pickingDestination || !onPickDestination) return;
        const coordinates = event?.geometry?.coordinates || event?.nativeEvent?.geometry?.coordinates;
        if (Array.isArray(coordinates) && coordinates.length >= 2) {
          onPickDestination({ longitude: coordinates[0], latitude: coordinates[1] });
        }
      }}>
      <Camera ref={cameraRef} center={focusPoint || center} zoom={zoom} pitch={is3D ? 55 : 0} easing="fly" duration={1500} />
      {route.length > 1 && <GeoJSONSource id="route" data={line}>
        <Layer id="route-outline" type="line" paint={{ 'line-color': '#FFFFFF', 'line-width': 9, 'line-cap': 'round', 'line-join': 'round' }} />
        <Layer id="route-main" type="line" paint={{ 'line-color': P.pink, 'line-width': 5, 'line-cap': 'round', 'line-join': 'round' }} />
      </GeoJSONSource>}
      {features.length > 0 && <GeoJSONSource id="markers" data={{ type: 'FeatureCollection', features }}>
        <Layer id="marker-circles" type="circle" paint={{ 'circle-radius': 9, 'circle-color': ['get','color'], 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 }} />
      </GeoJSONSource>}
      {carFeature && <GeoJSONSource id="driver-car" data={{ type: 'FeatureCollection', features: [carFeature] }}>
        <Layer id="driver-car-symbol" type="symbol" layout={{ 'text-field': '🚘', 'text-size': 30, 'text-allow-overlap': true, 'text-ignore-placement': true }} />
      </GeoJSONSource>}
    </MapLibreView>
    <View style={st.mapControls}>
      <TouchableOpacity style={st.locateButton} onPress={async () => {
        const point = await onLocate();
        if (point) {
          setFocusPoint([point.longitude, point.latitude]);
          setZoom(17);
          setIs3D(true);
        }
      }}>
        <Text style={st.locateButtonText}>◎  Определить местоположение</Text>
      </TouchableOpacity>
      <View style={st.mapControlRow}>
        <TouchableOpacity style={[st.mapControl, is3D && st.mapControlActive]} onPress={() => setIs3D(v => !v)}><Text style={[st.mapControlText, is3D && st.mapControlTextActive]}>3D</Text></TouchableOpacity>
        <TouchableOpacity style={st.mapControl} onPress={() => setZoom(v => Math.min(19, v + 1))}><Text style={st.mapControlText}>＋</Text></TouchableOpacity>
        <TouchableOpacity style={st.mapControl} onPress={() => setZoom(v => Math.max(3, v - 1))}><Text style={st.mapControlText}>−</Text></TouchableOpacity>
      </View>
    </View>
    <View style={st.mapLabel}><View style={st.liveDot}/><Text style={st.mapLabelText}>{pickingDestination ? 'Нажми на карту, чтобы выбрать точку' : 'Карта поездки'}</Text></View>
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
      const { data, error } = await supabase.from('orders').select('id,pickup_address,destination_address,status,price_rub,estimated_price_rub,created_at,passenger_id,driver_id').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      setAdminOrders(data || []);
    } catch (e) {
      Alert.alert('Не удалось загрузить заказы', translateError(e));
    } finally {
      setAdminLoading(false);
    }
  }, [profile?.role]);

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
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.82 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setVehicleUploading(true);
    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const mime = asset.mimeType || 'image/jpeg';
      const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
      const path = `${session.user.id}/vehicle-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('ladygo-driver-media').upload(path, blob, { contentType: mime, upsert: false });
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
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.82 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setDriverPhotoUploading(true);
    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const mime = asset.mimeType || 'image/jpeg';
      const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
      const path = `${session.user.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('ladygo-driver-media').upload(path, blob, { contentType: mime, upsert: false });
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
    if (!email.trim() || password.length < 6) return Alert.alert('Проверь данные', 'Введи email и пароль не короче 6 символов.');
    setBusy(true);
    try {
      const result = register
        ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (register && !result.data.session) Alert.alert('Почти готово', 'Подтверди email по письму, затем войди в LadyGo.');
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
        const url = 'https://router.project-osrm.org/route/v1/driving/' + pickup.longitude + ',' + pickup.latitude + ';' + destination.longitude + ',' + destination.latitude + '?overview=full&geometries=geojson';
        const response = await fetch(url);
        const json = await response.json();
        const r = json.routes?.[0];
        if (!r) throw new Error('Маршрут не найден');
        const points = r.geometry.coordinates.map(c => ({ longitude: c[0], latitude: c[1] }));
        if (alive) { setRoute(points); setRouteInfo({ km: (r.distance / 1000).toFixed(1), minutes: Math.max(1, Math.round(r.duration / 60)) }); }
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

  const createOrder = async () => {
    if (!session?.user) return;
    if (!pickup || !destination) return Alert.alert('Укажи маршрут', 'Выбери адрес подачи и назначения из подсказок.');
    if (!quote?.price_token || !quote?.expires_at || new Date(quote.expires_at).getTime() <= Date.now()) return Alert.alert('Обновляем стоимость', 'Подожди расчёт цены и попробуй ещё раз.');
    setBusy(true);
    try {
      // Do not create a second active trip: check the database before insert.
      const { data: existing, error: checkError } = await supabase.from('orders')
        .select('id,status')
        .eq('passenger_id', session.user.id)
        .in('status', ['new', 'accepted', 'arrived', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (checkError) throw checkError;
      if (existing) {
        await loadOrders();
        setTab('orders');
        Alert.alert('У тебя уже есть активный заказ', 'Сначала открой текущий заказ во вкладке «Мои поездки». Второй заказ можно будет оформить после завершения или отмены первого.');
        return;
      }
      const payload = {
        passenger_id: session.user.id, pickup_address: pickupText, destination_address: destinationText,
        requested_for: 'Как можно скорее', passenger_phone: phone.trim() || null,
        notes: 'Услуга: ' + (TARIFFS.find(t => t.id === tariff)?.name || 'Женский') + ' · Оплата: ' + (payment === 'cash' ? 'Наличные' : 'Перевод водителю'),
        status: 'new', payment_method: payment, tariff_id: tariff,
        pickup_lat: pickup.latitude, pickup_lng: pickup.longitude,
        destination_lat: destination.latitude, destination_lng: destination.longitude,
        estimated_price_rub: quote.amount_rub, price_quote_id: quote.price_token
      };
      const { error } = await supabase.from('orders').insert(payload);
      if (error) throw error;
      Alert.alert('Заказ создан', 'LadyGo ищет водителя. Стоимость и детали поездки будут доступны в заказе.');
      setTab('orders'); await loadOrders();
    } catch (e) {
      const message = String(e?.message || '');
      if (e?.code === '23505' || message.includes('orders_one_active_per_passenger_idx')) {
        await loadOrders();
        setTab('orders');
        Alert.alert('У тебя уже есть активный заказ', 'Открой вкладку «Мои поездки»: предыдущий заказ ещё не завершён. Отмени его или дождись завершения, затем оформи новый.');
      } else {
        Alert.alert('Не удалось оформить заказ', translateError(e));
      }
    }
    finally { setBusy(false); }
  };

  const signOut = async () => { await supabase.auth.signOut(); setTab('ride'); };
  const cancelOrder = async order => {
    Alert.alert('Отменить заказ?', 'Водитель ещё не должен был принять поездку.', [
      { text: 'Не отменять', style: 'cancel' },
      { text: 'Отменить', style: 'destructive', onPress: async () => {
        const { error } = await supabase.rpc('cancel_my_order', { order_id: order.id });
        if (error) Alert.alert('Не удалось отменить', translateError(error));
        else loadOrders();
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

  if (boot) return <View style={st.loading}><ActivityIndicator size="large" color={P.pink}/><Text style={st.muted}>Загружаем LadyGo…</Text></View>;
  if (!session) return <SafeAreaView style={st.auth}><StatusBar barStyle="dark-content" backgroundColor={P.white}/>
    <View style={st.authLogo}><Text style={st.logo}>LadyGo</Text><Text style={st.tagline}>Поездки с заботой</Text></View>
    <View style={st.authCard}><Text style={st.heading}>{register ? 'Создать аккаунт' : 'С возвращением'}</Text>
      <TextInput style={st.authInput} value={email} onChangeText={setEmail} placeholder="Электронная почта" autoCapitalize="none" keyboardType="email-address"/>
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
      {profile?.role === 'admin' && <TouchableOpacity style={[st.adminTopButton, tab === 'admin' && st.adminTopButtonActive]} onPress={() => { setTab('admin'); loadAdminOrders(); }}>
        <Text style={[st.adminTopButtonText, tab === 'admin' && st.adminTopButtonTextActive]}>⚙ Админ</Text>
      </TouchableOpacity>}
      <TouchableOpacity style={st.avatar} onPress={() => setTab('profile')}><Text style={st.avatarText}>{(profile?.email || 'L').slice(0,1).toUpperCase()}</Text></TouchableOpacity>
    </View>
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
          <Text style={st.tariffIcon}>{t.icon}</Text><Text style={st.tariffName}>{t.name}</Text>{quote?.amount_rub && tariff === t.id ? <Text style={st.tariffPrice}>{fmt(quote.amount_rub)}</Text> : null}
        </TouchableOpacity>)}</View>
        <View style={st.priceCard}><View style={{ flex: 1 }}><Text style={st.priceTitle}>{quote?.amount_rub ? 'Предварительная стоимость' : 'Стоимость поездки'}</Text><Text style={st.priceHint}>{quote?.amount_rub ? 'Цена рассчитана по маршруту' : 'Укажи оба адреса для расчёта'}</Text></View><Text style={st.priceValue}>{quote?.amount_rub ? fmt(quote.amount_rub) : '—'}</Text></View>
        <Text style={st.sectionTitle}>Способ оплаты</Text>
        <View style={st.payRow}><TouchableOpacity onPress={() => setPayment('cash')} style={[st.payOption, payment === 'cash' && st.paySelected]}><Text style={st.payIcon}>₽</Text><Text style={st.payText}>Наличные</Text></TouchableOpacity><TouchableOpacity onPress={() => setPayment('transfer_to_driver')} style={[st.payOption, payment === 'transfer_to_driver' && st.paySelected]}><Text style={st.payIcon}>↗</Text><Text style={st.payText}>Перевод водителю</Text></TouchableOpacity></View>
        <TextInput style={st.phoneInput} value={phone} onChangeText={setPhone} placeholder="Телефон для связи (необязательно)" keyboardType="phone-pad"/>
        <TouchableOpacity style={[st.primaryBtn, (!pickup || !destination || !quote?.price_token || busy) && st.disabled]} onPress={createOrder} disabled={!pickup || !destination || !quote?.price_token || busy}>
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
      {orders.length === 0 ? <View style={st.emptyCard}><Text style={st.emptyIcon}>⌁</Text><Text style={st.heading}>Пока нет поездок</Text><Text style={st.muted}>Оформленные заказы появятся здесь.</Text><TouchableOpacity style={st.primaryBtn} onPress={() => setTab('ride')}><Text style={st.primaryText}>Заказать поездку</Text></TouchableOpacity></View> :
        orders.map(o => {
          const driverStats = o.driver_id ? driverRatingStats[o.driver_id] : null;
          const canRate = o.status === 'completed' && o.driver_id && !ratedOrderIds.includes(o.id);
          return <View key={o.id} style={st.orderCard}>
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
      <View style={st.rowBetween}>
        <View><Text style={st.pageTitle}>Панель администратора</Text><Text style={st.muted}>Управление и контроль LadyGo</Text></View>
        <TouchableOpacity style={st.adminRefresh} onPress={loadAdminOrders}><Text style={st.adminRefreshText}>↻</Text></TouchableOpacity>
      </View>
      <View style={st.adminStats}>
        <View style={st.adminStat}><Text style={st.adminStatValue}>{adminOrders.length}</Text><Text style={st.adminStatLabel}>Всего заказов</Text></View>
        <View style={st.adminStat}><Text style={st.adminStatValue}>{adminOrders.filter(o => ['new','accepted','arrived','in_progress'].includes(o.status)).length}</Text><Text style={st.adminStatLabel}>Активные</Text></View>
        <View style={st.adminStat}><Text style={st.adminStatValue}>{adminOrders.filter(o => o.status === 'completed').length}</Text><Text style={st.adminStatLabel}>Завершено</Text></View>
      </View>
      <View style={st.rowBetween}><Text style={st.heading}>Последние заказы</Text>{adminLoading && <ActivityIndicator color={P.pink}/>}</View>
      {adminOrders.length === 0 && !adminLoading ? <View style={st.emptyCard}><Text style={st.emptyIcon}>⚙</Text><Text style={st.heading}>Заказов пока нет</Text><Text style={st.muted}>Новые заказы появятся здесь.</Text></View> :
        adminOrders.map(o => <View key={o.id} style={st.orderCard}>
          <View style={st.rowBetween}><Text style={st.orderStatus}>{STATUS[o.status] || o.status}</Text><Text style={st.orderDate}>{new Date(o.created_at).toLocaleString('ru-RU')}</Text></View>
          <Text style={st.orderAddress}>●  {o.pickup_address || 'Место подачи не указано'}</Text>
          <Text style={st.orderAddress}>●  {o.destination_address || 'Назначение не указано'}</Text>
          <View style={st.rowBetween}><Text style={st.orderPrice}>{o.price_rub ? fmt(o.price_rub) : o.estimated_price_rub ? fmt(o.estimated_price_rub) : 'Цена не указана'}</Text><Text style={st.muted}>{o.driver_id ? 'Водитель назначен' : 'Без водителя'}</Text></View>
        </View>)}
      <Text style={st.footnote}>Доступ к панели предоставляется только аккаунтам с ролью администратора.</Text>
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
    {tab === 'profile' && <ScrollView contentContainerStyle={st.pageContent}><Text style={st.pageTitle}>Профиль</Text>
      <View style={st.profileCard}><View style={st.profileAvatar}><Text style={st.profileAvatarText}>{(profile?.email || 'L').slice(0,1).toUpperCase()}</Text></View><Text style={st.heading}>{profile?.email || session.user.email}</Text><Text style={st.muted}>{profile?.role === 'driver' ? 'Водитель' : profile?.role === 'admin' ? 'Администратор' : 'Пассажир'}</Text></View>
      <TouchableOpacity style={st.profileRow} onPress={() => setTab('orders')}><Text style={st.profileRowIcon}>◷</Text><Text style={st.profileRowText}>История поездок</Text><Text style={st.chevron}>›</Text></TouchableOpacity>
      {profile?.role === 'admin' && <TouchableOpacity style={st.profileRow} onPress={() => { setTab('admin'); loadAdminOrders(); }}><Text style={st.profileRowIcon}>⚙</Text><Text style={st.profileRowText}>Панель администратора</Text><Text style={st.chevron}>›</Text></TouchableOpacity>}
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
