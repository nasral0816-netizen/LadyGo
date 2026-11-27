import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, BackHandler, Dimensions, Keyboard, Linking, Platform, SafeAreaView, ScrollView, PanResponder,
  StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View, Image
} from 'react-native';
import { YandexMapView, Marker, Polyline, geocodeAddress, findDrivingRoutes } from 'expo-yandex-mapkit';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as TaskManager from 'expo-task-manager';
import { supabase } from './supabase';


function LineIcon({ name, size = 24, color = '#176344' }) {
  const scale = size / 24;
  const box = { width: size, height: size, alignItems: 'center', justifyContent: 'center' };
  const stroke = { borderColor: color, borderWidth: Math.max(1.4, 1.8 * scale) };
  const shape = (width, height, extra = {}) => ({ width: width * scale, height: height * scale, ...stroke, ...extra });
  const dot = (diameter, extra = {}) => ({ width: diameter * scale, height: diameter * scale, borderRadius: diameter * scale, ...stroke, ...extra });
  const fill = { backgroundColor: color };
  if (name === 'bell') return <View style={box}><View style={shape(15, 15, { borderTopLeftRadius: 9 * scale, borderTopRightRadius: 9 * scale, borderBottomLeftRadius: 4 * scale, borderBottomRightRadius: 4 * scale, borderBottomWidth: 0, marginTop: 1 * scale })}/><View style={{ width: 19 * scale, height: 2 * scale, backgroundColor: color, marginTop: -1 * scale, borderRadius: 2 }}/><View style={{ width: 5 * scale, height: 3 * scale, backgroundColor: color, borderRadius: 3, marginTop: 2 * scale }}/></View>;
  if (name === 'user') return <View style={box}><View style={dot(8, { marginBottom: 2 * scale })}/><View style={shape(17, 9, { borderTopLeftRadius: 10 * scale, borderTopRightRadius: 10 * scale, borderBottomWidth: 0, marginTop: 1 * scale })}/></View>;
  if (name === 'car') return <View style={box}><View style={shape(17, 8, { borderTopLeftRadius: 7 * scale, borderTopRightRadius: 7 * scale, borderBottomWidth: 0, marginBottom: -1 * scale })}/><View style={shape(21, 8, { borderRadius: 4 * scale })}/><View style={{ flexDirection: 'row', width: 17 * scale, justifyContent: 'space-between', marginTop: -2 * scale }}><View style={{ width: 4 * scale, height: 4 * scale, borderRadius: 3, backgroundColor: color }}/><View style={{ width: 4 * scale, height: 4 * scale, borderRadius: 3, backgroundColor: color }}/></View></View>;
  if (name === 'child') return <View style={box}><View style={dot(12, { marginBottom: 1 * scale })}/><View style={shape(13, 7, { borderTopLeftRadius: 8 * scale, borderTopRightRadius: 8 * scale, borderBottomWidth: 0 })}/></View>;
  if (name === 'parcel') return <View style={box}><View style={shape(17, 17, { borderRadius: 2 * scale })}/><View style={{ position: 'absolute', width: 11 * scale, height: 1.5 * scale, backgroundColor: color, top: 5 * scale, transform: [{ rotate: '25deg' }] }}/><View style={{ position: 'absolute', width: 1.5 * scale, height: 9 * scale, backgroundColor: color, top: 5 * scale }}/></View>;
  if (name === 'pin') return <View style={box}><View style={{ width: 15 * scale, height: 15 * scale, borderRadius: 10 * scale, borderWidth: 2 * scale, borderColor: color, alignItems: 'center', justifyContent: 'center', marginTop: -4 * scale }}><View style={{ width: 4 * scale, height: 4 * scale, borderRadius: 3, backgroundColor: color }}/></View><View style={{ width: 9 * scale, height: 9 * scale, borderRightWidth: 2 * scale, borderBottomWidth: 2 * scale, borderColor: color, transform: [{ rotate: '45deg' }], marginTop: -6 * scale }}/></View>;
  if (name === 'chat') return <View style={box}><View style={shape(19, 14, { borderRadius: 6 * scale, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 * scale })}><View style={dot(2, { backgroundColor: color })}/><View style={dot(2, { backgroundColor: color })}/><View style={dot(2, { backgroundColor: color })}/></View><View style={{ width: 5 * scale, height: 5 * scale, borderLeftWidth: 1.6 * scale, borderBottomWidth: 1.6 * scale, borderColor: color, transform: [{ rotate: '-12deg' }], alignSelf: 'flex-start', marginLeft: 5 * scale, marginTop: -1 * scale }}/></View>;
  if (name === 'cash') return <View style={box}><View style={shape(21, 14, { borderRadius: 2 * scale, alignItems: 'center', justifyContent: 'center' })}><View style={{ width: 6 * scale, height: 6 * scale, borderRadius: 4 * scale, borderWidth: 1.4 * scale, borderColor: color }}/></View><View style={{ position: 'absolute', width: 15 * scale, height: 1.3 * scale, backgroundColor: color, top: 5 * scale }}/></View>;
  if (name === 'female') return <View style={box}><View style={{ width: 13 * scale, height: 13 * scale, borderRadius: 8 * scale, borderWidth: 2 * scale, borderColor: color, marginTop: -4 * scale }}/><View style={{ width: 2 * scale, height: 7 * scale, backgroundColor: color }}/><View style={{ width: 8 * scale, height: 2 * scale, backgroundColor: color, marginTop: -1 * scale }}/></View>;
  if (name === 'support') return <View style={box}><View style={shape(18, 18, { borderRadius: 10 * scale, alignItems: 'center', justifyContent: 'center' })}><View style={{ width: 2 * scale, height: 7 * scale, backgroundColor: color, borderRadius: 2 }}/><View style={{ width: 2 * scale, height: 2 * scale, backgroundColor: color, borderRadius: 2, marginTop: 2 * scale }}/></View></View>;
  if (name === 'gear') return <View style={box}><View style={dot(13, { alignItems: 'center', justifyContent: 'center' })}><View style={dot(5, { borderWidth: 1.4 * scale })}/></View>{[0,45,90,135].map(a=><View key={a} style={{ position: 'absolute', width: 3 * scale, height: 7 * scale, backgroundColor: color, borderRadius: 2, transform: [{ rotate: a + 'deg' }] }}/>)}</View>;
  return <View style={box}><View style={dot(15)}/></View>;
}

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
    const hours = Number(text.match(/(\d+)\s*(?:ч|час)/)?.[1] || 0);
    const minutes = Number(text.match(/(\d+)\s*(?:м|мин)/)?.[1] || 0);
    const compact = text.match(/(\d+)\s*h(?:ours?)?\s*(?:(\d+)\s*m)?/);
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


const LADYGO_DRIVER_LOCATION_TASK = 'LADYGO_DRIVER_LOCATION';

TaskManager.defineTask(LADYGO_DRIVER_LOCATION_TASK, async ({ data, error }) => {
  if (error || !supabase) return;
  const locations = data?.locations || [];
  const latest = locations[locations.length - 1];
  if (!latest?.coords) return;
  try {
    const { data: authData } = await supabase.auth.getSession();
    if (!authData?.session?.user?.id) return;
    await supabase.rpc('ladygo_driver_heartbeat', {
      p_is_online: true,
      p_latitude: latest.coords.latitude,
      p_longitude: latest.coords.longitude,
      p_heading: latest.coords.heading
    });
  } catch (taskError) {
    console.warn('LadyGo background GPS update failed:', taskError?.message);
  }
});

const P = {
  green: '#176344', gold: '#C79A38', pale: '#F6F0E4', ink: '#1F2923',
  muted: '#756F63', line: '#E8DEC9', white: '#FFFCF6',
  map: 'https://tiles.openfreemap.org/styles/liberty'
};
const TARIFFS = [
  // Сохраняем тарифные ID для совместимости с действующим сервисом расчёта цены.
  { id: 'economy', name: 'Женский', sub: 'Поездки для женщин', icon: 'female' },
  { id: 'comfort', name: 'Детский', sub: 'Поездки с детьми', icon: 'child' },
  { id: 'comfort_plus', name: 'Доставка', sub: 'Доставка вещей и заказов', icon: 'parcel' }
];
const STATUS = { draft: 'Маршрут сохранён', saved: 'Тестовая заявка сохранена', new: 'Ищем водителя', accepted: 'Назначен', arrived: 'На месте', in_progress: 'В пути', completed: 'Завершена', cancelled: 'Отменена', declined: 'Отклонена' };
const fmt = n => Number(n || 0).toLocaleString('ru-RU') + ' руб.';

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
  const clean = String(q || '').replace(/\s+/g, ' ').trim();
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

function MapPanel({ pickup, destination, route, onLocate, onPickDestination, pickingDestination, driverLocation, mapHeight, allowPickDestination = true }) {
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

  return <Animated.View collapsable={false} style={[st.map, { height: mapHeight }]}>
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
        <View style={{ backgroundColor: P.green, borderColor: '#FFFFFF', borderWidth: 2, borderRadius: 16, minWidth: 30, height: 30, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Б</Text>
        </View>
      </Marker>}
      {route?.length > 1 && <Polyline points={route} strokeColor={P.green} strokeWidth={5} outlineColor="#FFFFFF" outlineWidth={2} />}
      {driverLocation && <Marker point={{ latitude: Number(driverLocation.latitude), longitude: Number(driverLocation.longitude) }}>
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 2, borderColor: P.green, padding: 5 }}>
          <LineIcon name="car" size={22} />
        </View>
      </Marker>}
    </YandexMapView>
    <View style={st.mapControls}>
      <TouchableOpacity style={st.locateButton} onPress={handleLocate} accessibilityRole="button" accessibilityLabel="Определить местоположение">
        <Text style={st.locateButtonText}>➤</Text>
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
  </Animated.View>;
}

function formatRussianPhone(value) {
  const raw = String(value || '');
  if (raw.includes('@')) return raw;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('7') || digits.startsWith('8')) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (!digits) return raw.trim().startsWith('+') ? '+7' : '';
  let result = '+7-(' + digits.slice(0, 3);
  if (digits.length >= 3) result += ')';
  if (digits.length > 3) result += '-' + digits.slice(3, 6);
  if (digits.length > 6) result += '-' + digits.slice(6, 8);
  if (digits.length > 8) result += '-' + digits.slice(8, 10);
  return result;
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
  const expandedMapHeight = Math.round(Math.min(440, Math.max(300, Dimensions.get('window').height * 0.47)));
  const mapHeight = useRef(new Animated.Value(expandedMapHeight)).current;
  const animateMapHeight = useCallback((collapsed) => {
    Animated.spring(mapHeight, { toValue: collapsed ? 176 : expandedMapHeight, useNativeDriver: false, speed: 16, bounciness: 2 }).start();
  }, [mapHeight, expandedMapHeight]);
  const mapPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.15,
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy < -22 || gesture.vy < -0.45) animateMapHeight(true);
      else if (gesture.dy > 22 || gesture.vy > 0.45) animateMapHeight(false);
    }
  }), [animateMapHeight]);
  const [payment, setPayment] = useState('cash');
  const [quote, setQuote] = useState(null);
  const [orders, setOrders] = useState([]);
  const [presentationOrders, setPresentationOrders] = useState([]);
  const [demoOrders, setDemoOrders] = useState([]);
  const [adminDemoOrders, setAdminDemoOrders] = useState([]);
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
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [supportSending, setSupportSending] = useState(false);
  const [myTickets, setMyTickets] = useState([]);
  const [adminTickets, setAdminTickets] = useState([]);
  const [adminReplyDrafts, setAdminReplyDrafts] = useState({});
  const [adminAccounts, setAdminAccounts] = useState([]);
  const [adminEmailDraft, setAdminEmailDraft] = useState('');
  const [adminAccountsLoading, setAdminAccountsLoading] = useState(false);
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

  const loadDemoOrders = useCallback(async () => {
    if (!session?.user || !supabase) return;
    const { data, error } = await supabase.from('demo_orders')
      .select('id,user_id,pickup_address,destination_address,estimated_price_rub,payment_method,tariff_id,status,created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false }).limit(100);
    if (!error) setDemoOrders((data || []).map(item => ({
      ...item, localPresentation: true, price_rub: item.estimated_price_rub
    })));
  }, [session?.user?.id]);

  const loadOrders = useCallback(async () => {
    if (!session?.user?.id || !supabase) return;
    const { data, error } = await supabase.from('orders')
      .select('*').eq('passenger_id', session.user.id)
      .order('created_at', { ascending: false }).limit(50);
    if (error) {
      console.warn('LadyGo orders load failed:', error.message);
      return;
    }
    const rows = data || [];
    setOrders(rows.filter(o => ['completed','cancelled','declined'].includes(o.status)));
    const active = rows.find(o => ['new','accepted','arrived','in_progress'].includes(o.status)) || null;
    setActiveOrder(active);

    const { data: ownRatings } = await supabase.from('order_ratings')
      .select('order_id').eq('passenger_id', session.user.id);
    setRatedOrderIds((ownRatings || []).map(r => r.order_id));

    const driverIds = [...new Set(rows.map(o => o.driver_id).filter(Boolean))];
    if (driverIds.length) {
      const { data: stats } = await supabase.from('driver_rating_stats')
        .select('driver_id,average_rating,rating_count').in('driver_id', driverIds);
      if (stats) setDriverRatingStats(current => ({
        ...current, ...Object.fromEntries(stats.map(s => [s.driver_id, s]))
      }));
    }

    if (active?.driver_id && ['accepted','arrived','in_progress'].includes(active.status)) {
      const [vehicleResult, locationResult] = await Promise.all([
        supabase.from('driver_profiles')
          .select('display_name,phone,avatar_url,vehicle_make,vehicle_model,vehicle_color,vehicle_plate,vehicle_year,vehicle_photo_url')
          .eq('driver_id', active.driver_id).maybeSingle(),
        supabase.from('driver_locations')
          .select('latitude,longitude,heading,updated_at')
          .eq('driver_id', active.driver_id).maybeSingle()
      ]);
      const vehicle = vehicleResult.data;
      const [vehicleSigned, driverSigned] = await Promise.all([
        vehicle?.vehicle_photo_url ? supabase.storage.from('ladygo-driver-media').createSignedUrl(vehicle.vehicle_photo_url, 3600) : Promise.resolve({ data: null }),
        vehicle?.avatar_url ? supabase.storage.from('ladygo-driver-media').createSignedUrl(vehicle.avatar_url, 3600) : Promise.resolve({ data: null })
      ]);
      setDriverVehicle(vehicle ? {
        ...vehicle,
        vehicle_photo_signed_url: vehicleSigned.data?.signedUrl || null,
        driver_photo_signed_url: driverSigned.data?.signedUrl || null
      } : null);
      setDriverLocation(locationResult.data ? {
        latitude: Number(locationResult.data.latitude),
        longitude: Number(locationResult.data.longitude),
        heading: locationResult.data.heading
      } : null);
    } else {
      setDriverVehicle(null);
      setDriverLocation(null);
    }
  }, [session?.user?.id]);

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

  useEffect(() => {
    if (!session?.user?.id || profile?.role !== 'passenger' || !supabase) return;
    const channel = supabase.channel('ladygo-passenger-orders-' + session.user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders',
        filter: 'passenger_id=eq.' + session.user.id }, () => loadOrders())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id, profile?.role, loadOrders]);

  useEffect(() => {
    if (!activeOrder?.id || activeOrder.status !== 'new' || !supabase) return;
    let running = false;
    const dispatch = async () => {
      if (running) return;
      running = true;
      try {
        await supabase.rpc('ladygo_dispatch_next_driver', { p_order_id: activeOrder.id });
        await loadOrders();
      } catch (_) {
        // Server owns matching; next poll retries safely.
      } finally { running = false; }
    };
    dispatch();
    const timer = setInterval(dispatch, 12000);
    return () => clearInterval(timer);
  }, [activeOrder?.id, activeOrder?.status, loadOrders]);

  useEffect(() => {
    if (!activeOrder?.driver_id || !['accepted','arrived','in_progress'].includes(activeOrder.status) || !supabase) return;
    const channel = supabase.channel('ladygo-driver-location-' + activeOrder.driver_id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations',
        filter: 'driver_id=eq.' + activeOrder.driver_id }, payload => {
        const row = payload.new;
        if (row?.latitude != null && row?.longitude != null) setDriverLocation({
          latitude: Number(row.latitude), longitude: Number(row.longitude), heading: row.heading
        });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeOrder?.driver_id, activeOrder?.status]);

  useEffect(() => {
    if (profile?.role !== 'driver' || !session?.user?.id || !driverOnline || !supabase) return;
    let alive = true;
    let watch = null;
    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        await supabase.rpc('ladygo_driver_heartbeat', {
          p_is_online: false, p_latitude: null, p_longitude: null, p_heading: null
        });
        if (alive) setDriverOnline(false);
        return;
      }
      let backgroundGranted = false;
      try {
        const background = await Location.requestBackgroundPermissionsAsync();
        backgroundGranted = background.status === 'granted';
      } catch (_) {}
      if (backgroundGranted) {
        const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(LADYGO_DRIVER_LOCATION_TASK);
        if (!alreadyStarted) {
          await Location.startLocationUpdatesAsync(LADYGO_DRIVER_LOCATION_TASK, {
            accuracy: Location.Accuracy.High,
            timeInterval: 6000,
            distanceInterval: 20,
            pausesUpdatesAutomatically: false,
            foregroundService: {
              notificationTitle: 'LadyGo — вы на линии',
              notificationBody: 'Обновляем местоположение, чтобы получать заказы рядом.',
              notificationColor: '#176344'
            }
          });
        }
      } else {
        // Foreground fallback: the driver can receive orders while the app remains open.
        watch = await Location.watchPositionAsync({
          accuracy: Location.Accuracy.High, timeInterval: 6000, distanceInterval: 20
        }, async position => {
          if (!alive) return;
          const { error } = await supabase.rpc('ladygo_driver_heartbeat', {
            p_is_online: true,
            p_latitude: position.coords.latitude,
            p_longitude: position.coords.longitude,
            p_heading: position.coords.heading
          });
          if (error) console.warn('LadyGo GPS heartbeat failed:', error.message);
        });
      }
    })().catch(error => console.warn('LadyGo GPS watcher failed:', error?.message));
    return () => {
      alive = false;
      watch?.remove?.();
      Location.hasStartedLocationUpdatesAsync(LADYGO_DRIVER_LOCATION_TASK)
        .then(started => started ? Location.stopLocationUpdatesAsync(LADYGO_DRIVER_LOCATION_TASK) : null)
        .catch(() => {});
      supabase.rpc('ladygo_driver_heartbeat', {
        p_is_online: false, p_latitude: null, p_longitude: null, p_heading: null
      }).catch(() => {});
    };
  }, [profile?.role, session?.user?.id, driverOnline]);

  useEffect(() => {
    if (profile?.role !== 'driver' || !session?.user?.id || !supabase) return;
    loadDriverOrders();
    const channel = supabase.channel('ladygo-driver-dispatch-' + session.user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_offers',
        filter: 'driver_id=eq.' + session.user.id }, () => loadDriverOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders',
        filter: 'driver_id=eq.' + session.user.id }, () => loadDriverOrders())
      .subscribe();
    const refresh = setInterval(loadDriverOrders, 15000);
    return () => { clearInterval(refresh); supabase.removeChannel(channel); };
  }, [profile?.role, session?.user?.id, loadDriverOrders]);

  useEffect(() => {
    if (profile?.role !== 'driver' || !session?.user?.id || !supabase || !Device.isDevice) return;
    let alive = true;
    (async () => {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('driver-orders', {
            name: 'Заказы LadyGo',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 150, 250],
            sound: 'default'
          });
        }
        let permission = await Notifications.getPermissionsAsync();
        if (permission.status !== 'granted') permission = await Notifications.requestPermissionsAsync();
        if (!alive || permission.status !== 'granted') return;
        const tokenResult = await Notifications.getExpoPushTokenAsync({
          projectId: '95ac82ec-010d-4770-9aba-9f52878e1b3b'
        });
        if (!alive || !tokenResult?.data) return;
        const { error } = await supabase.from('driver_push_tokens').upsert({
          driver_id: session.user.id,
          expo_push_token: tokenResult.data,
          device_platform: Platform.OS === 'ios' ? 'ios' : 'android',
          updated_at: new Date().toISOString()
        }, { onConflict: 'driver_id,expo_push_token' });
        if (error) console.warn('LadyGo push token registration failed:', error.message);
      } catch (error) {
        console.warn('LadyGo push registration unavailable:', error?.message);
      }
    })();
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(() => {
      setTab('driver');
      loadDriverOrders();
    });
    return () => {
      alive = false;
      responseSubscription.remove();
    };
  }, [profile?.role, session?.user?.id, loadDriverOrders]);

  useEffect(() => { if (session?.user) { loadOrders(); loadDemoOrders(); } }, [session, loadOrders, loadDemoOrders]);


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
          .select('id,pickup_address,destination_address,status,price_rub,estimated_price_rub,created_at,driver_id,requested_for,notes')
          .order('created_at', { ascending: false }).range(from, from + pageSize - 1);
        if (error) throw error;
        allOrders.push(...(data || []));
        if (!data || data.length < pageSize) break;
      }

      const { data: demoRows, error: demoError } = await supabase.from('demo_orders')
        .select('id,user_id,pickup_address,destination_address,estimated_price_rub,payment_method,tariff_id,status,created_at')
        .order('created_at', { ascending: false }).limit(500);
      if (demoError) throw demoError;
      setAdminDemoOrders(demoRows || []);

      const driverIds = [...new Set(allOrders.map(o => o.driver_id).filter(Boolean))];
      let profiles = [];
      let applications = [];
      if (driverIds.length) {
        const [profileResult, applicationResult] = await Promise.all([
          supabase.from('driver_profiles')
            .select('driver_id,display_name,vehicle_make,vehicle_model,vehicle_color,vehicle_plate,vehicle_year')
            .in('driver_id', driverIds),
          supabase.from('driver_applications')
            .select('user_id,full_name,vehicle_make,vehicle_model,vehicle_plate,vehicle_color,vehicle_year,status')
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

  useEffect(() => {
    if (!session?.user?.id || !supabase) return;
    const isAdmin = profile?.role === 'admin';
    const channel = supabase.channel('ladygo-demo-orders-' + session.user.id)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'demo_orders',
        ...(isAdmin ? {} : { filter: 'user_id=eq.' + session.user.id })
      }, () => {
        loadDemoOrders();
        if (isAdmin) loadAdminOrders();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id, profile?.role, loadDemoOrders, loadAdminOrders]);

  const loadAdminApplications = useCallback(async () => {
    if (profile?.role !== 'admin' || !supabase) return;
    setAdminLoading(true);
    try {
      const { data, error } = await supabase.from('driver_applications').select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      const withSignedPhotos = await Promise.all((data || []).map(async item => {
        const [avatarResult, vehicleResult] = await Promise.all([
          item.avatar_url ? supabase.storage.from('ladygo-driver-media').createSignedUrl(item.avatar_url, 3600) : Promise.resolve({ data: null }),
          item.vehicle_photo_url ? supabase.storage.from('ladygo-driver-media').createSignedUrl(item.vehicle_photo_url, 3600) : Promise.resolve({ data: null })
        ]);
        return {
          ...item,
          avatar_signed_url: avatarResult.data?.signedUrl || null,
          vehicle_photo_signed_url: vehicleResult.data?.signedUrl || null
        };
      }));
      setAdminApplications(withSignedPhotos);
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

  const loadAdminAccounts = useCallback(async () => {
    if (!profile?.is_super_admin || !supabase) return;
    setAdminAccountsLoading(true);
    try {
      const { data, error } = await supabase.rpc('ladygo_list_admins');
      if (error) throw error;
      setAdminAccounts(data || []);
    } catch (e) {
      Alert.alert('Не удалось загрузить администраторов', translateError(e));
    } finally {
      setAdminAccountsLoading(false);
    }
  }, [profile?.is_super_admin]);

  const changeAdminAccess = async (email, grantAccess) => {
    if (!profile?.is_super_admin || !supabase) return;
    try {
      const { error } = await supabase.rpc('ladygo_set_admin_by_email', {
        target_email: email,
        grant_access: grantAccess
      });
      if (error) throw error;
      await loadAdminAccounts();
      setAdminEmailDraft('');
      Alert.alert(grantAccess ? 'Администратор назначен' : 'Права сняты', grantAccess ? 'Пользователь получил права администратора.' : 'Пользователь больше не администратор.');
    } catch (e) {
      Alert.alert('Не удалось изменить права', translateError(e));
    }
  };

  const loadMyTickets = useCallback(async () => {
    if (!session?.user?.id || !supabase) return;
    const { data, error } = await supabase.from('support_tickets').select('id,subject,message,status,admin_reply,created_at,updated_at').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(50);
    if (!error) setMyTickets(data || []);
  }, [session?.user?.id]);

  const loadAdminTickets = useCallback(async () => {
    if (profile?.role !== 'admin' || !supabase) return;
    const { data, error } = await supabase.from('support_tickets').select('id,user_id,subject,message,status,admin_reply,created_at,updated_at').order('created_at', { ascending: false }).limit(100);
    if (error) Alert.alert('Не удалось загрузить обращения', translateError(error));
    else setAdminTickets(data || []);
  }, [profile?.role]);

  const submitSupportTicket = async () => {
    const subject = supportSubject.trim();
    const message = supportMessage.trim();
    if (!session?.user?.id || supportSending) return;
    if (subject.length < 3 || message.length < 10) {
      Alert.alert('Заполни обращение', 'Тема — минимум 3 символа, сообщение — минимум 10.');
      return;
    }
    setSupportSending(true);
    try {
      const { error } = await supabase.from('support_tickets').insert({ user_id: session.user.id, subject, message });
      if (error) throw error;
      setSupportSubject('');
      setSupportMessage('');
      await loadMyTickets();
      Alert.alert('Обращение отправлено', 'Оно сохранено в системе поддержки LadyGo.');
    } catch (e) { Alert.alert('Не удалось отправить обращение', translateError(e)); }
    finally { setSupportSending(false); }
  };

  const setSupportTicketStatus = async (ticket, status) => {
    try {
      const { error } = await supabase.from('support_tickets').update({ status, updated_at: new Date().toISOString() }).eq('id', ticket.id);
      if (error) throw error;
      await loadAdminTickets();
    } catch (e) { Alert.alert('Не удалось обновить обращение', translateError(e)); }
  };

  const saveSupportReply = async ticket => {
    const reply = String(adminReplyDrafts[ticket.id] || '').trim();
    if (reply.length < 3) {
      Alert.alert('Добавь ответ', 'Ответ должен содержать не менее 3 символов.');
      return;
    }
    try {
      const { error } = await supabase.from('support_tickets').update({
        admin_reply: reply,
        status: 'closed',
        updated_at: new Date().toISOString()
      }).eq('id', ticket.id);
      if (error) throw error;
      setAdminReplyDrafts(current => ({ ...current, [ticket.id]: '' }));
      await loadAdminTickets();
      Alert.alert('Ответ сохранён', 'Обращение закрыто после ответа.');
    } catch (e) { Alert.alert('Не удалось сохранить ответ', translateError(e)); }
  };

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
      if (bytes.length > 5 * 1024 * 1024) throw new Error('Файл больше 5 МБ. Выбери изображение меньшего размера.');
      const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
      const path = `${session.user.id}/application-${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('ladygo-driver-media').upload(path, bytes, { contentType: mime, upsert: false });
      if (error) throw error;
      // Bucket is private: save the object path, never a public URL.
      if (kind === 'avatar') setApplicationAvatar(path); else setApplicationVehiclePhoto(path);
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
      if (bytes.length > 5 * 1024 * 1024) throw new Error('Файл больше 5 МБ. Выбери изображение меньшего размера.');
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
      if (bytes.length > 5 * 1024 * 1024) throw new Error('Файл больше 5 МБ. Выбери изображение меньшего размера.');
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
    if (!session?.user?.id || profile?.role !== 'driver' || !supabase) return;
    setDriverLoading(true);
    try {
      const [presenceResult, offersResult, mineResult] = await Promise.all([
        supabase.from('driver_presence').select('is_online,updated_at').eq('driver_id', session.user.id).maybeSingle(),
        supabase.from('order_offers').select('id,order_id,expires_at')
          .eq('driver_id', session.user.id).eq('status', 'pending')
          .gt('expires_at', new Date().toISOString()).order('offered_at', { ascending: false }),
        supabase.from('orders').select('*').eq('driver_id', session.user.id)
          .order('created_at', { ascending: false }).limit(50)
      ]);
      if (presenceResult.error && presenceResult.error.code !== 'PGRST116') throw presenceResult.error;
      if (offersResult.error) throw offersResult.error;
      if (mineResult.error) throw mineResult.error;
      const offers = offersResult.data || [];
      const ids = offers.map(o => o.order_id);
      let offered = [];
      if (ids.length) {
        const { data, error } = await supabase.from('orders').select('*').in('id', ids);
        if (error) throw error;
        offered = (data || []).map(order => {
          const offer = offers.find(item => item.order_id === order.id);
          return { ...order, offer_id: offer?.id, offer_expires_at: offer?.expires_at };
        });
      }
      const assigned = mineResult.data || [];
      setDriverOrders([...offered, ...assigned.filter(o => !offered.some(x => x.id === o.id))]);
      const presenceFresh = presenceResult.data?.updated_at &&
        Date.now() - new Date(presenceResult.data.updated_at).getTime() < 90000;
      setDriverOnline(Boolean(presenceResult.data?.is_online && presenceFresh));
      if (presenceResult.data?.is_online && !presenceFresh) {
        await supabase.rpc('ladygo_driver_heartbeat', {
          p_is_online: false, p_latitude: null, p_longitude: null, p_heading: null
        });
      }
    } catch (e) {
      Alert.alert('Не удалось загрузить заказы', translateError(e));
    } finally { setDriverLoading(false); }
  }, [session?.user?.id, profile?.role]);

  const toggleDriverShift = async () => {
    if (!session?.user?.id || driverPresenceLoading) return;
    setDriverPresenceLoading(true);
    try {
      if (driverOnline) {
        const { error } = await supabase.rpc('ladygo_driver_heartbeat', {
          p_is_online: false, p_latitude: null, p_longitude: null, p_heading: null
        });
        if (error) throw error;
        setDriverOnline(false);
        Alert.alert('Вы не на линии', 'Новые заказы больше не будут поступать.');
      } else {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          Alert.alert('Нужна геолокация', 'Разреши доступ к местоположению, чтобы получать заказы поблизости.');
          return;
        }
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const { error } = await supabase.rpc('ladygo_driver_heartbeat', {
          p_is_online: true,
          p_latitude: position.coords.latitude,
          p_longitude: position.coords.longitude,
          p_heading: position.coords.heading
        });
        if (error) throw error;
        setDriverOnline(true);
        Alert.alert('Вы на линии', 'LadyGo ищет заказы рядом с вами.');
        await loadDriverOrders();
      }
    } catch (e) {
      Alert.alert('Не удалось изменить статус', translateError(e));
    } finally { setDriverPresenceLoading(false); }
  };

  const acceptDriverOrder = async order => {
    if (!order?.id || !order?.offer_id || busy) return;
    const price = Number(order.estimated_price_rub || order.price_rub || driverPrices[order.id]);
    if (!Number.isFinite(price) || price <= 0) {
      Alert.alert('Цена не рассчитана', 'Заказ нельзя принять: отсутствует подтверждённая стоимость.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc('ladygo_accept_order', {
        p_order_id: order.id, p_price_rub: price
      });
      if (error) throw error;
      await loadDriverOrders();
      Alert.alert('Заказ назначен вам', 'Пассажир увидит ваши данные и статус поездки.');
    } catch (e) {
      Alert.alert('Не удалось принять заказ', translateError(e));
      await loadDriverOrders();
    } finally { setBusy(false); }
  };

  const declineDriverOrder = async order => {
    if (!order?.id) return;
    try {
      const { error } = await supabase.rpc('ladygo_decline_order', { p_order_id: order.id });
      if (error) throw error;
      await loadDriverOrders();
    } catch (e) { Alert.alert('Не удалось отклонить заказ', translateError(e)); }
  };

  const updateDriverStatus = async (order, status) => {
    if (!order?.id) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('ladygo_update_trip_status', {
        p_order_id: order.id, p_status: status
      });
      if (error) throw error;
      await loadDriverOrders();
    } catch (e) {
      Alert.alert('Не удалось обновить поездку', translateError(e));
    } finally { setBusy(false); }
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
    // Для двух существующих аккаунтов телефон служит новым логином:
    // авторизация идёт в прежний Supabase Auth аккаунт, поэтому пароль и ID сохраняются.
    // Остальные телефонные аккаунты используют технический email; SMS-кода здесь нет.
    const legacyPhoneLogins = {
      '79911124353': 'nasral08.16@gmail.com',
      '79911116922': 'ladygoadmin@gmail.com',
    };
    const authEmail = isEmail && !register
      ? identifier.toLowerCase()
      : (!register && legacyPhoneLogins[phoneDigits]
        ? legacyPhoneLogins[phoneDigits]
        : 'phone-' + phoneDigits + '@auth.ladygo.app');
    setBusy(true);
    try {
      const result = register
        ? await supabase.auth.signUp({ email: authEmail, password, options: { data: { phone: phoneDigits } } })
        : await supabase.auth.signInWithPassword({ email: authEmail, password });
      if (result.error) throw result.error;
      // public.handle_new_user() creates the passenger profile transactionally.
      // Do not upsert profiles from the client: profiles has no client INSERT/UPDATE policy.
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

  const createOrder = async () => {
    if (!session?.user?.id || !supabase) return;
    if (!pickup || !destination || !routeInfo) {
      return Alert.alert('Укажи маршрут', 'Выбери оба адреса и дождись построения маршрута.');
    }
    if (activeOrder && ['new','accepted','arrived','in_progress'].includes(activeOrder.status)) {
      setTab('orders');
      return Alert.alert('У тебя уже есть активный заказ', 'Сначала заверши или отмени текущую поездку.');
    }
    const amount = Number(quote?.amount_rub || quote?.price_rub || previewFare);
    if (!Number.isFinite(amount) || amount <= 0) {
      return Alert.alert('Не удалось рассчитать стоимость', 'Проверь маршрут и тариф. Заказ без рассчитанной стоимости не будет отправлен.');
    }
    setBusy(true);
    try {
      const payload = {
        passenger_id: session.user.id,
        driver_id: null,
        pickup_address: pickupText,
        destination_address: destinationText,
        pickup_lat: Number(pickup.latitude),
        pickup_lng: Number(pickup.longitude),
        destination_lat: Number(destination.latitude),
        destination_lng: Number(destination.longitude),
        passenger_phone: phone.trim() || profile?.phone || null,
        requested_for: 'Как можно скорее',
        notes: null,
        tariff_id: tariff,
        estimated_price_rub: amount,
        payment_method: payment,
        price_rub: null,
        status: 'new'
      };
      const { data, error } = await supabase.from('orders').insert(payload).select('*').single();
      if (error) throw error;
      setActiveOrder(data);
      setTab('orders');
      await loadOrders();
      Alert.alert('Заказ отправлен', 'LadyGo ищет ближайшего свободного водителя. Когда водитель примет заказ, его имя, автомобиль и геопозиция появятся здесь.');
    } catch (error) {
      const message = String(error?.message || '');
      if (/orders_one_active_per_passenger|duplicate key|unique constraint/i.test(message)) {
        await loadOrders();
        setTab('orders');
        Alert.alert('У тебя уже есть активный заказ', 'Открой «Мои поездки», чтобы посмотреть его статус.');
      } else {
        Alert.alert('Не удалось отправить заказ', translateError(error));
      }
    } finally { setBusy(false); }
  };

  const signOut = async () => { await supabase.auth.signOut(); setTab('ride'); };
  const cancelOrder = async order => {
    if (!order?.id || !session?.user?.id) return;
    Alert.alert('Отменить поездку?', 'Заказ будет отменён. Если водитель уже назначен, он получит обновлённый статус.', [
      { text: 'Назад', style: 'cancel' },
      { text: 'Отменить поездку', style: 'destructive', onPress: async () => {
        try {
          const { error } = await supabase.rpc('ladygo_cancel_my_order', { p_order_id: order.id });
          if (error) throw error;
          await loadOrders();
        } catch (e) { Alert.alert('Не удалось отменить поездку', translateError(e)); }
      }}
    ]);
  };

  const chatOrder = null;
  const renderTripChat = () => null;

  const previewFare = routeInfo
    ? Math.round((55 + (Number(routeInfo.km) || 0) * 14 + (Number(routeInfo.minutes) || 0) * 1.5) * (tariff === 'comfort' ? 1.25 : tariff === 'comfort_plus' ? 1.15 : 1) / 5) * 5
    : null;

  if (boot) return <View style={st.loading}><ActivityIndicator size="large" color={P.green}/><Text style={st.muted}>Загружаем LadyGo…</Text></View>;
  if (!session) return <SafeAreaView style={st.auth}><StatusBar barStyle="dark-content" backgroundColor={P.white}/>
    <View style={st.authLogo}><Text style={st.logo}>LadyGo</Text><Text style={st.tagline}>Поездки с заботой</Text></View>
    <View style={st.authCard}><Text style={st.heading}>{register ? 'Создать аккаунт' : 'С возвращением'}</Text>
      <TextInput style={st.authInput} value={email} onChangeText={(value) => setEmail(value.includes("@") ? value : formatRussianPhone(value))} placeholder={register ? "+7-(999)-999-99-99" : "Номер телефона или email"} autoCapitalize="none" keyboardType={register || !email.includes("@") ? "phone-pad" : "email-address"} textContentType="telephoneNumber"/>
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
    {searching && <ActivityIndicator color={P.green} style={{ marginTop: 20 }}/>}
    <ScrollView keyboardShouldPersistTaps="handled">
      {suggestions.map(item => <TouchableOpacity key={item.id} style={st.suggestion} onPress={() => chooseSuggestion(item)}>
        <View style={st.suggestionIcon}><Text>⌖</Text></View><View style={{ flex: 1 }}><Text style={st.suggestionTitle}>{item.label}</Text><Text style={st.suggestionSub}>{item.detail || 'Кисловодск'}</Text></View>
      </TouchableOpacity>)}
      {!searching && query.length > 1 && suggestions.length === 0 && <Text style={st.empty}>Не получилось найти адрес. Проверь написание или попробуй указать улицу и номер дома.</Text>}
    </ScrollView>
  </SafeAreaView>;

  return <SafeAreaView style={st.screen}><StatusBar barStyle="dark-content" backgroundColor={P.white}/>
    <View style={st.topbar}><View style={st.brandBlock}><Image source={require('../icon.png')} style={st.topLogo} resizeMode="contain"/><View><Text style={st.logoSmall}>LadyGo</Text><Text style={st.topSub}>Поездки с заботой</Text></View></View>
      {profile?.role === 'driver' && <View style={st.modeSwitch}>
        <TouchableOpacity onPress={() => setTab('ride')} style={[st.modeOption, tab !== 'driver' && st.modeOptionActive]}><Text style={[st.modeText, tab !== 'driver' && st.modeTextActive]}>⌖  Пассажир</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => { setTab('driver'); loadDriverOrders(); }} style={[st.modeOption, tab === 'driver' && st.modeOptionActive]}><Text style={[st.modeText, tab === 'driver' && st.modeTextActive]}><LineIcon name="car" size={18}/>  Водитель</Text></TouchableOpacity>
      </View>}
      {profile?.role === 'admin' && <TouchableOpacity style={[st.adminTopButton, tab === 'admin' && st.adminTopButtonActive]} onPress={() => { setTab('admin'); loadAdminOrders(); loadAdminApplications(); loadAdminDrivers(); loadAdminTickets(); loadAdminAccounts(); }}>
        <Text style={[st.adminTopButtonText, tab === 'admin' && st.adminTopButtonTextActive]}>⚙ Админ</Text>
      </TouchableOpacity>}
      <View style={st.headerActions}><TouchableOpacity style={st.headerAction} onPress={() => setTab('orders')} accessibilityRole="button" accessibilityLabel="Уведомления и поездки"><LineIcon name="bell" size={23}/>{activeOrder ? <View style={st.notificationDot}/> : null}</TouchableOpacity><TouchableOpacity style={st.headerAction} onPress={() => setTab('profile')} accessibilityRole="button" accessibilityLabel="Профиль"><LineIcon name="user" size={23}/></TouchableOpacity></View>
    </View>
    {tab === 'ride' && <View style={{ flex: 1 }}>
      <MapPanel pickup={pickup} destination={destination} route={route} onLocate={locate} onPickDestination={pickDestinationOnMap} pickingDestination={pickingDestination} mapHeight={mapHeight}/>
      <ScrollView style={st.sheet} contentContainerStyle={st.sheetContent} keyboardShouldPersistTaps="handled">
        <View {...mapPanResponder.panHandlers} accessibilityRole="button" accessibilityLabel="Потяните вверх, чтобы уменьшить карту, вниз — чтобы увеличить" style={st.sheetHandleWrap}><View style={st.sheetHandle}/><Text style={st.sheetHandleHint}>Потяните вверх или вниз, чтобы изменить размер карты</Text></View>
        <View style={st.rowBetween}><Text style={st.heading}>Куда едем?</Text><View style={st.cityPill}><Text style={st.cityPillText}>Кисловодск · КМВ</Text></View></View>
        <TouchableOpacity activeOpacity={0.8} onPress={() => { setSearchField('pickup'); setQuery(''); }}><Field label="ОТКУДА" value={pickupText} placeholder="Выберите место подачи" icon="●"/></TouchableOpacity>
        <View style={st.connector}/>
        <TouchableOpacity activeOpacity={0.8} onPress={() => { setSearchField('destination'); setQuery(''); }}><Field label="КУДА" value={destinationText} placeholder="Введите адрес назначения" icon="●"/></TouchableOpacity>
        <TouchableOpacity style={st.locateRow} onPress={locate}><Text style={st.locateRowIcon}>◎</Text><Text style={st.locateRowText}>Определить моё местоположение</Text></TouchableOpacity>
        {routeInfo && <View style={st.routeMeta}><Text style={st.routeMetaText}>Маршрут {routeInfo.km} км</Text><Text style={st.routeMetaText}>Около {routeInfo.minutes} мин</Text></View>}
        <Text style={st.sectionTitle}>Выберите услугу</Text>
        <View style={st.tariffs}>{TARIFFS.map(t => <TouchableOpacity key={t.id} onPress={() => setTariff(t.id)} style={[st.tariff, tariff === t.id && st.tariffSelected]}>
          <View style={st.tariffIcon}><LineIcon name={t.icon} size={27} color={tariff === t.id ? P.gold : P.green}/></View><Text style={st.tariffName}>{t.name}</Text><Text style={st.tariffSub}>{t.sub}</Text>{(previewFare) && tariff === t.id ? <Text style={st.tariffPrice}>{fmt(previewFare)}</Text> : null}
        </TouchableOpacity>)}</View>
        <View style={st.networkHint}><Text style={st.networkHintIcon}>ⓘ</Text><Text style={st.networkHintText}>Если карта или другие сервисы не загружаются, проверь интернет. В сетях с ограничениями попробуй включить VPN.</Text></View>
        <View style={st.priceCard}><View style={{ flex: 1 }}><Text style={st.priceTitle}>{(previewFare) ? 'Предварительная стоимость' : 'Стоимость поездки'}</Text><Text style={st.priceHint}>{(previewFare) ? 'Расчёт по длине и времени маршрута' : 'Укажи оба адреса для расчёта'}</Text></View><Text style={st.priceValue}>{previewFare ? fmt(previewFare) : '—'}</Text></View>
        <Text style={st.sectionTitle}>Способ оплаты</Text>
        <View style={st.payRow}><TouchableOpacity onPress={() => setPayment('cash')} style={[st.payOption, payment === 'cash' && st.paySelected]}><View style={st.payIcon}><LineIcon name="cash" size={22}/></View><Text style={st.payText}>Наличные</Text></TouchableOpacity><TouchableOpacity onPress={() => setPayment('transfer_to_driver')} style={[st.payOption, payment === 'transfer_to_driver' && st.paySelected]}><Text style={st.payIcon}>↗</Text><Text style={st.payText}>Перевод водителю</Text></TouchableOpacity></View>
        <TextInput style={st.phoneInput} value={phone} onChangeText={setPhone} placeholder="Телефон для связи (необязательно)" keyboardType="phone-pad"/>
        <TouchableOpacity style={[st.primaryBtn, (!pickup || !destination || !routeInfo || busy) && st.disabled]} onPress={createOrder} disabled={!pickup || !destination || !routeInfo || busy}>
          {busy ? <ActivityIndicator color="#fff"/> : <Text style={st.primaryText}>Заказать поездку</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={st.phoneOrderBtn} onPress={() => Linking.openURL('mailto:ladygosupport@gmail.com?subject=Поддержка%20LadyGo')}>
          <Text style={st.phoneOrderText}>✉  Написать в поддержку</Text>
        </TouchableOpacity>
        <Text style={st.footnote}>Создано независимым автором @acyma</Text>
      </ScrollView>
    </View>}
    {tab === 'orders' && <ScrollView contentContainerStyle={st.pageContent}>
      <Text style={st.pageTitle}>Мои поездки</Text>
      {activeOrder && <View style={[st.orderCard,{borderColor:P.green,borderWidth:1}]}>
        <View style={st.rowBetween}>
          <Text style={st.orderStatus}>{STATUS[activeOrder.status]||activeOrder.status}</Text>
          <Text style={st.orderDate}>{activeOrder.created_at?new Date(activeOrder.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):''}</Text>
        </View>
        <Text style={st.orderAddress}>● {activeOrder.pickup_address}</Text>
        <Text style={st.orderAddress}>● {activeOrder.destination_address}</Text>
        <View style={st.rowBetween}>
          <Text style={st.orderPrice}>{fmt(activeOrder.price_rub||activeOrder.estimated_price_rub||0)}</Text>
          {activeOrder.status==='new' ? <Text style={{color:P.green,fontWeight:'800'}}>Ищем водителя…</Text> : null}
        </View>
        {['new','accepted','arrived','in_progress'].includes(activeOrder.status) && <TouchableOpacity onPress={()=>cancelOrder(activeOrder)}><Text style={st.cancelText}>Отменить поездку</Text></TouchableOpacity>}
      </View>}
      {activeOrder?.driver_id && ['accepted','arrived','in_progress'].includes(activeOrder.status) && <>
        <Text style={st.heading}>{activeOrder.status==='arrived'?'Водитель на месте':activeOrder.status==='in_progress'?'Вы в пути':'Водитель едет к вам'}</Text>
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
          {driverVehicle?.phone ? <TouchableOpacity onPress={() => Linking.openURL('tel:' + String(driverVehicle.phone).replace(/[^+0-9]/g,''))} style={st.primaryBtn}><Text style={st.primaryText}>Позвонить водителю</Text></TouchableOpacity> : null}
        </View>
        {renderTripChat()}
      </>}
      {!activeOrder && orders.length + demoOrders.length + presentationOrders.length === 0 ? <View style={st.emptyCard}><Text style={st.emptyIcon}>⌁</Text><Text style={st.heading}>Нет сохранённых маршрутов</Text><Text style={st.muted}>Сохранённые маршруты появятся здесь.</Text><TouchableOpacity style={st.primaryBtn} onPress={() => setTab('ride')}><Text style={st.primaryText}>Сохранить маршрут</Text></TouchableOpacity></View> :
        [...demoOrders, ...presentationOrders, ...orders].map(o => {
          const driverStats = o.driver_id ? driverRatingStats[o.driver_id] : null;
          const canRate = o.status === 'completed' && o.driver_id && !ratedOrderIds.includes(o.id);
          return <View key={o.id} style={st.orderCard}>
            {o.localPresentation && <Text style={st.footnote}>Тестовая запись — не отправлена водителям</Text>}
            <View style={st.rowBetween}><Text style={st.orderStatus}>{STATUS[o.status] || o.status}</Text><Text style={st.orderDate}>{new Date(o.created_at).toLocaleDateString('ru-RU')}</Text></View>
            <Text style={st.orderAddress}>●  {o.pickup_address}</Text>
            <Text style={st.orderAddress}>●  {o.destination_address}</Text>
            {o.localPresentation && o.virtual_driver && <>
              <View style={{ marginTop: 12, padding: 13, borderRadius: 14, backgroundColor: '#F6F0E4', borderWidth: 1, borderColor: '#E8DEC9', gap: 8 }}>
                <Text style={{ color: P.green, fontSize: 11, fontWeight: '900' }}>ТЕСТОВАЯ КАРТОЧКА ВОДИТЕЛЯ</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#E8DEC9', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: P.green, fontSize: 20, fontWeight: '900' }}>В</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: P.ink, fontSize: 16, fontWeight: '900' }}>{o.virtual_driver}</Text>
                    <Text style={{ color: P.muted, fontSize: 12 }}>Условный профиль · не реальный водитель</Text>
                  </View>
                </View>
                <Text style={{ color: P.ink, fontWeight: '800' }}>Lada Granta · белая</Text>
                <Text style={{ color: P.muted, fontSize: 12 }}>А000АА 26 · условный номер</Text>
                <View style={{ height: 1, backgroundColor: '#E8DEC9', marginVertical: 3 }} />
                <Text style={{ color: P.ink, fontWeight: '800' }}>Состояние поездки</Text>
                {[
                  ['accepted', 'Водитель принял заказ'],
                  ['arrived', 'Водитель на месте'],
                  ['in_progress', 'Поездка началась'],
                  ['completed', 'Поездка завершена']
                ].map(([status, label], index) => {
                  const sequence = ['accepted', 'arrived', 'in_progress', 'completed'];
                  const currentIndex = sequence.indexOf(o.status);
                  const done = currentIndex >= index;
                  return <View key={status} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: done ? P.green : '#B8AEB4', fontSize: 16 }}>{done ? '●' : '○'}</Text>
                    <Text style={{ color: done ? P.ink : P.muted, fontSize: 12, fontWeight: done ? '800' : '500' }}>{label}</Text>
                  </View>;
                })}
                <Text style={{ color: P.muted, fontSize: 11 }}>Этапы переключаются вручную только в локальной тестовой записи.</Text>
                {o.status !== 'completed' && o.status !== 'cancelled' && <TouchableOpacity
                  onPress={() => setPresentationOrders(rows => rows.map(item => {
                    if (item.id !== o.id) return item;
                    const sequence = ['accepted', 'arrived', 'in_progress', 'completed'];
                    const index = sequence.indexOf(item.status);
                    return { ...item, status: sequence[Math.min(index + 1, sequence.length - 1)] };
                  }))}
                  style={{ backgroundColor: P.green, borderRadius: 11, padding: 11, alignItems: 'center', marginTop: 4 }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>Следующий этап (тест)</Text>
                </TouchableOpacity>}
                <View style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: 10, gap: 4 }}>
                  <Text style={{ color: P.ink, fontWeight: '800', fontSize: 12 }}>Данные тестовой поездки</Text>
                  <Text style={{ color: P.muted, fontSize: 11 }}>Тариф: {o.tariff_id === 'comfort' ? 'Детский' : o.tariff_id === 'comfort_plus' ? 'Доставка' : 'Женский'}</Text>
                  <Text style={{ color: P.muted, fontSize: 11 }}>Оплата: {o.payment_method === 'cash' ? 'Наличные' : o.payment_method === 'card' ? 'Карта (симуляция)' : (o.payment_method || 'Не выбрана')}</Text>
                  <Text style={{ color: P.muted, fontSize: 11 }}>Расчётная стоимость: {fmt(o.estimated_price_rub || o.price_rub || 0)}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={() => Alert.alert('Тест звонка водителю', 'Проверка интерфейса завершена. Реальный вызов и передача номера не выполняются в локальном тестовом режиме.')} style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#E8DEC9', padding: 10, alignItems: 'center' }}>
                    <Text style={{ color: P.ink, fontWeight: '800', fontSize: 12 }}>☎ Тест звонка водителю</Text>
                    <Text style={{ color: P.muted, fontSize: 10 }}>Без реального вызова</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => Alert.alert('Тест звонка пассажиру', 'Проверка интерфейса завершена. Реальный вызов и передача номера не выполняются в локальном тестовом режиме.')} style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#E8DEC9', padding: 10, alignItems: 'center' }}>
                    <Text style={{ color: P.ink, fontWeight: '800', fontSize: 12 }}>☎ Тест звонка пассажиру</Text>
                    <Text style={{ color: P.muted, fontSize: 10 }}>Без реального вызова</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>}
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
        <TouchableOpacity style={st.adminRefresh} onPress={() => { loadAdminOrders(); loadAdminApplications(); loadAdminDrivers(); loadAdminTickets(); }}>
          {adminLoading ? <ActivityIndicator color={P.green}/> : <Text style={st.adminRefreshText}>↻</Text>}
        </TouchableOpacity>
      </View>
      <View style={st.adminStats}>
        <View style={st.adminStat}><Text style={st.adminStatValue}>{adminApplications.filter(x=>x.status==='pending').length}</Text><Text style={st.adminStatLabel}>Заявки на проверке</Text></View>
        <View style={st.adminStat}><Text style={st.adminStatValue}>{adminDrivers.length}</Text><Text style={st.adminStatLabel}>Профили водителей</Text></View>
        <View style={st.adminStat}><Text style={st.adminStatValue}>{adminDemoOrders.length}</Text><Text style={st.adminStatLabel}>Тестовые заявки</Text></View>
      </View>
      <View style={st.adminTabs}>
        {[
          ['applications','Заявки',adminApplications.filter(x=>x.status==='pending').length],
          ['drivers','Водители',adminDrivers.length],
          ['orders','Заказы',adminOrders.length],
          ['support','Поддержка',adminTickets.filter(x=>x.status==='open').length],
          ...(profile?.is_super_admin ? [['admins','Администраторы',adminAccounts.length]] : [])
        ].map(([id,label,count])=><TouchableOpacity key={id} onPress={()=>setAdminSection(id)} style={[st.adminTab,adminSection===id&&st.adminTabActive]}>
          <Text style={[st.adminTabText,adminSection===id&&st.adminTabTextActive]}>{label} · {count}</Text>
        </TouchableOpacity>)}
      </View>
      {adminSection==='admins' && profile?.is_super_admin && <>
        <View style={st.rowBetween}><Text style={st.heading}>Управление администраторами</Text>{adminAccountsLoading&&<ActivityIndicator color={P.green}/>}</View>
        <Text style={st.muted}>Главный администратор назначает и снимает права. Максимум — 15 обычных администраторов. Пользователь должен сначала зарегистрироваться в LadyGo.</Text>
        <TextInput style={st.phoneInput} value={adminEmailDraft} onChangeText={setAdminEmailDraft} placeholder="Email зарегистрированного пользователя" autoCapitalize="none" keyboardType="email-address" maxLength={254}/>
        <TouchableOpacity style={st.adminApprove} onPress={()=>changeAdminAccess(adminEmailDraft.trim(),true)}><Text style={st.adminActionText}>Назначить администратором</Text></TouchableOpacity>
        {adminAccounts.map(item=><View key={item.user_id} style={st.adminApplicationCard}>
          <View style={st.rowBetween}><Text style={st.adminApplicantName}>{item.email || 'Аккаунт без email'}</Text><Text style={st.adminStatus}>{item.is_super_admin?'Главный':'Обычный'}</Text></View>
          {item.is_super_admin ? <Text style={st.muted}>Полные права управления. Снять их через панель нельзя.</Text> : <TouchableOpacity style={st.adminReject} onPress={()=>changeAdminAccess(item.email,false)}><Text style={st.adminRejectText}>Снять права администратора</Text></TouchableOpacity>}
        </View>)}
      </>}
      {adminSection==='applications' && <>
        <View style={st.rowBetween}><Text style={st.heading}>Заявки на подключение</Text>{adminLoading&&<ActivityIndicator color={P.green}/>}</View>
        {adminApplications.length===0 ? <View style={st.emptyCard}><Text style={st.emptyIcon}>▤</Text><Text style={st.heading}>Заявок пока нет</Text><Text style={st.muted}>Новые анкеты кандидатов появятся здесь.</Text></View> :
          adminApplications.map(item=><View key={item.id} style={st.adminApplicationCard}>
            <View style={st.rowBetween}><Text style={st.adminApplicantName}>{item.full_name||'Без имени'}</Text><Text style={[st.adminStatus,item.status==='pending'?st.adminStatusPending:item.status==='approved'?st.adminStatusApproved:st.adminStatusRejected]}>{item.status==='pending'?'На проверке':item.status==='approved'?'Одобрена':'Отклонена'}</Text></View>
            <Text style={st.adminDetail}>Стаж: {item.experience||'Не указан'}</Text>
            <Text style={st.adminDetail}>Автомобиль: {[item.vehicle_make,item.vehicle_model,item.vehicle_color].filter(Boolean).join(' ')||'Не указан'}</Text>
            <Text style={st.adminDetail}>Номер: {item.vehicle_plate||'Не указан'} {item.vehicle_year||''}</Text>
            {item.license_info ? <Text style={st.adminDetail}>Документы: {item.license_info}</Text>:null}
            <Text style={st.adminDate}>Подана: {new Date(item.created_at).toLocaleString('ru-RU')}</Text>
            <View style={st.adminPhotoRow}>
              {item.avatar_signed_url?<Image source={{uri:item.avatar_signed_url}} style={st.adminPhoto}/>:null}
              {item.vehicle_photo_signed_url?<Image source={{uri:item.vehicle_photo_signed_url}} style={st.adminCarPhoto}/>:null}
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
              <Text style={st.adminDetail}>{[d.vehicle_color,d.vehicle_make,d.vehicle_model].filter(Boolean).join(' ')||'Автомобиль не заполнен'}</Text>
              <Text style={st.adminDetail}>{d.vehicle_plate||'Номер не указан'} {d.vehicle_year||''}</Text>
              <Text style={[st.adminDetail,{marginTop:6,fontWeight:'700',color:P.green}]}>Поездок: {driverTrips.length} · Нажмите, чтобы открыть историю</Text>
            </TouchableOpacity>
            {expanded && <View style={{marginTop:12,gap:10}}>
              {driverTrips.length===0 ? <Text style={st.muted}>У этого водителя пока нет назначенных поездок.</Text> : driverTrips.map(o=><View key={o.id} style={{backgroundColor:P.pale,borderRadius:12,padding:11,gap:5}}>
                <View style={st.rowBetween}>
                  <Text style={st.orderStatus}>{STATUS[o.status]||o.status}</Text>
                  <Text style={st.orderDate}>{o.created_at ? new Date(o.created_at).toLocaleString('ru-RU') : 'Дата не указана'}</Text>
                </View>
                <Text style={st.orderAddress}>● {o.pickup_address||'Место подачи не указано'}</Text>
                <Text style={st.orderAddress}>● {o.destination_address||'Назначение не указано'}</Text>
                <View style={st.rowBetween}>
                  <Text style={st.orderPrice}>{o.price_rub?fmt(o.price_rub):o.estimated_price_rub?fmt(o.estimated_price_rub):'Цена не указана'}</Text>
                  <Text style={st.muted}>ID: {String(o.id).slice(0,8)}</Text>
                </View>
              </View>)}
            </View>}
          </View>;
        })}
      </>}
      {adminSection==='support' && <>
        <View style={st.rowBetween}><Text style={st.heading}>Обращения пользователей</Text><TouchableOpacity onPress={loadAdminTickets}><Text style={st.refreshText}>Обновить</Text></TouchableOpacity></View>
        {adminTickets.length===0 ? <View style={st.emptyCard}><Text style={st.heading}>Обращений пока нет</Text></View> : adminTickets.map(ticket=><View key={ticket.id} style={st.adminApplicationCard}>
          <View style={st.rowBetween}><Text style={st.adminApplicantName}>{ticket.subject}</Text><Text style={[st.adminStatus,ticket.status==='open'?st.adminStatusPending:st.adminStatusApproved]}>{ticket.status==='open'?'Открыто':'Закрыто'}</Text></View>
          <Text style={st.adminDate}>{new Date(ticket.created_at).toLocaleString('ru-RU')} · ID {String(ticket.user_id).slice(0,8)}</Text>
          <Text style={st.adminDetail}>{ticket.message}</Text>
          <TextInput style={[st.phoneInput,{minHeight:72,textAlignVertical:'top'}]} value={adminReplyDrafts[ticket.id] ?? ticket.admin_reply ?? ''} onChangeText={value=>setAdminReplyDrafts(current=>({...current,[ticket.id]:value}))} placeholder="Ответ пользователю…" multiline maxLength={2000}/>
          <TouchableOpacity style={st.adminApprove} onPress={()=>saveSupportReply(ticket)}><Text style={st.adminActionText}>Сохранить ответ и закрыть</Text></TouchableOpacity>
          <TouchableOpacity style={ticket.status==='open'?st.adminReject:st.adminApprove} onPress={()=>setSupportTicketStatus(ticket,ticket.status==='open'?'closed':'open')}><Text style={ticket.status==='open'?st.adminRejectText:st.adminActionText}>{ticket.status==='open'?'Закрыть без ответа':'Открыть снова'}</Text></TouchableOpacity>
        </View>)}
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
          </View>
          <View style={st.rowBetween}><Text style={st.orderPrice}>{o.price_rub?fmt(o.price_rub):o.estimated_price_rub?fmt(o.estimated_price_rub):'Цена не указана'}</Text><Text style={st.muted}>ID: {String(o.id).slice(0,8)}</Text></View>
        </View>)}
      </>}
      {adminDemoOrders.length > 0 && <>
        <View style={[st.rowBetween,{marginTop:18}]}>
          <Text style={st.heading}>Сохранённые тестовые заявки</Text>
          <Text style={st.muted}>{adminDemoOrders.length}</Text>
        </View>
        {adminDemoOrders.map(o=><View key={'demo-'+o.id} style={st.orderCard}>
          <View style={st.rowBetween}>
            <Text style={st.orderStatus}>{STATUS[o.status]||o.status}</Text>
            <Text style={st.orderDate}>{new Date(o.created_at).toLocaleString('ru-RU')}</Text>
          </View>
          <Text style={st.orderAddress}>● {o.pickup_address}</Text>
          <Text style={st.orderAddress}>● {o.destination_address}</Text>
          <View style={st.rowBetween}>
            <Text style={st.orderPrice}>{fmt(o.estimated_price_rub)}</Text>
            <Text style={st.muted}>Аккаунт: {String(o.user_id).slice(0,8)} · ID: {String(o.id).slice(0,8)}</Text>
          </View>
          <Text style={st.footnote}>Тестовая запись · не передана водителю</Text>
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
            <Text style={st.driverSubtitle}>Профиль водителя и данные автомобиля</Text>
          </View>
          <TouchableOpacity style={st.driverRefresh} onPress={loadDriverOrders} disabled={driverLoading}>
            {driverLoading ? <ActivityIndicator color={P.green}/> : <Text style={st.driverRefreshText}>↻</Text>}
          </TouchableOpacity>
        </View>
        <View style={[st.driverModeHint, { backgroundColor: driverOnline ? '#EAF8F1' : '#F6F0E4', borderColor: driverOnline ? '#B9E5D0' : P.line }]}>
          <View style={st.driverModeIcon}><LineIcon name="car" size={25}/></View>
          <View style={{flex:1}}>
            <Text style={st.driverModeTitle}>{driverOnline ? 'Вы на линии' : 'Вы не на линии'}</Text>
            <Text style={st.driverModeSub}>{driverOnline ? 'Получаем предложения ближайших поездок' : 'Включите режим, чтобы получать заказы'}</Text>
          </View>
          <TouchableOpacity onPress={toggleDriverShift} disabled={driverPresenceLoading}
            style={{backgroundColor:driverOnline?'#FFFFFF':P.green,borderRadius:12,paddingHorizontal:14,paddingVertical:11}}>
            {driverPresenceLoading ? <ActivityIndicator color={driverOnline?P.green:P.white}/> :
              <Text style={{color:driverOnline?P.green:P.white,fontWeight:'900'}}>{driverOnline?'Завершить смену':'Выйти на линию'}</Text>}
          </TouchableOpacity>
        </View>
        <View style={st.adminStats}>
          <View style={st.adminStat}><Text style={st.adminStatValue}>{driverOrders.filter(o=>o.offer_id).length}</Text><Text style={st.adminStatLabel}>Предложения</Text></View>
          <View style={st.adminStat}><Text style={st.adminStatValue}>{driverOrders.filter(o=>['accepted','arrived','in_progress'].includes(o.status)).length}</Text><Text style={st.adminStatLabel}>Активные</Text></View>
          <View style={st.adminStat}><Text style={st.adminStatValue}>{fmt(driverOrders.filter(o=>o.status==='completed').reduce((sum,o)=>sum+Number(o.price_rub||0),0))}</Text><Text style={st.adminStatLabel}>Заработано</Text></View>
        </View>
        <View style={st.adminTabs}>
          {tabs.map(([id,label])=><TouchableOpacity key={id} onPress={()=>setDriverSection(id)} style={[st.adminTab,driverSection===id&&st.adminTabActive]}>
            <Text style={[st.adminTabText,driverSection===id&&st.adminTabTextActive]}>{label}</Text>
          </TouchableOpacity>)}
        </View>
        {shown.length===0 ? <View style={st.emptyCard}>
          <Text style={st.heading}>{driverSection==='available'?'Пока нет предложений':driverSection==='active'?'Нет активных поездок':driverSection==='history'?'История пока пуста':'Ожидаем заказы'}</Text>
          <Text style={st.muted}>{driverOnline?'Когда рядом появится заказ, предложение отобразится здесь.':'Выйдите на линию, чтобы начать получать заказы.'}</Text>
        </View> : shown.map(order=><View key={order.id} style={st.orderCard}>
          <View style={st.rowBetween}>
            <Text style={st.orderStatus}>{order.offer_id?'Новый заказ':STATUS[order.status]||order.status}</Text>
            <Text style={st.orderDate}>{order.created_at?new Date(order.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):''}</Text>
          </View>
          <Text style={st.orderAddress}>● {order.pickup_address}</Text>
          <Text style={st.orderAddress}>● {order.destination_address}</Text>
          <View style={st.rowBetween}>
            <Text style={st.orderPrice}>{fmt(order.price_rub||order.estimated_price_rub||0)}</Text>
            <Text style={st.muted}>{order.offer_expires_at?'Предложение до '+new Date(order.offer_expires_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'ID '+String(order.id).slice(0,8)}</Text>
          </View>
          {order.offer_id && <View style={{flexDirection:'row',gap:8,marginTop:10}}>
            <TouchableOpacity onPress={()=>acceptDriverOrder(order)} disabled={busy} style={{flex:1,backgroundColor:P.green,borderRadius:12,padding:13,alignItems:'center'}}>
              <Text style={{color:P.white,fontWeight:'900'}}>Принять заказ</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>declineDriverOrder(order)} style={{borderWidth:1,borderColor:P.line,borderRadius:12,padding:13,alignItems:'center'}}>
              <Text style={{color:P.ink,fontWeight:'800'}}>Отказаться</Text>
            </TouchableOpacity>
          </View>}
          {order.status==='accepted' && <TouchableOpacity onPress={()=>updateDriverStatus(order,'arrived')} style={st.primaryBtn}><Text style={st.primaryText}>Я на месте</Text></TouchableOpacity>}
          {order.status==='arrived' && <TouchableOpacity onPress={()=>updateDriverStatus(order,'in_progress')} style={st.primaryBtn}><Text style={st.primaryText}>Начать поездку</Text></TouchableOpacity>}
          {order.status==='in_progress' && <TouchableOpacity onPress={()=>updateDriverStatus(order,'completed')} style={st.primaryBtn}><Text style={st.primaryText}>Завершить поездку</Text></TouchableOpacity>}
        </View>)}
        <View style={st.vehicleEditorCard}>
          <View style={st.rowBetween}><Text style={st.heading}>Фото водителя</Text><Text style={st.vehicleEditorHint}>Для карточки поездки</Text></View>
          <View style={st.driverPhotoEditorRow}>
            {driverPhotoPreview ? <Image source={{ uri: driverPhotoPreview }} style={st.driverPhotoPreview} /> : <View style={st.driverPhotoPlaceholder}><LineIcon name="user" size={30}/></View>}
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={st.vehicleEditorHint}>Пассажир увидит это фото вместе с именем и рейтингом водителя</Text>
              <TouchableOpacity style={st.vehiclePhotoButton} onPress={chooseDriverPhoto} disabled={driverPhotoUploading}>
                {driverPhotoUploading ? <ActivityIndicator color={P.green}/> : <Text style={st.vehiclePhotoButtonText}>{driverPhotoPreview ? 'Изменить фото водителя' : 'Добавить фото водителя'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <View style={st.vehicleEditorCard}>
          <View style={st.rowBetween}><Text style={st.heading}>Мой автомобиль</Text><Text style={st.vehicleEditorHint}>Данные для пассажира</Text></View>
          {vehiclePhotoPreview ? <Image source={{ uri: vehiclePhotoPreview }} style={st.vehiclePhotoPreview} resizeMode="cover" /> : <View style={st.vehiclePhotoPlaceholder}><LineIcon name="car" size={30}/><Text style={st.vehiclePhotoPlaceholderText}>Добавь фото своего автомобиля</Text></View>}
          <TouchableOpacity style={st.vehiclePhotoButton} onPress={chooseVehiclePhoto} disabled={vehicleUploading}>
            {vehicleUploading ? <ActivityIndicator color={P.green}/> : <Text style={st.vehiclePhotoButtonText}>{vehiclePhotoPreview ? 'Изменить фото машины' : 'Добавить фото машины'}</Text>}
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
        <Text style={st.footnote}>Заказы поступают только одобренным водителям, находящимся на линии и передающим актуальную геопозицию.</Text>
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
    {tab === 'support' && <ScrollView contentContainerStyle={st.pageContent} keyboardShouldPersistTaps="handled">
      <Text style={st.pageTitle}>Поддержка LadyGo</Text>
      <Text style={st.muted}>Опиши вопрос или проблему. Обращение сохранится в системе и будет доступно администратору.</Text>
      <TextInput style={st.authInput} value={supportSubject} onChangeText={setSupportSubject} placeholder="Тема обращения" maxLength={120}/>
      <TextInput style={[st.authInput,{minHeight:130,textAlignVertical:'top'}]} value={supportMessage} onChangeText={setSupportMessage} placeholder="Подробно опиши проблему…" multiline maxLength={4000}/>
      <TouchableOpacity style={[st.primaryBtn, supportSending&&st.disabled]} onPress={submitSupportTicket} disabled={supportSending}>{supportSending?<ActivityIndicator color={P.white}/>:<Text style={st.primaryText}>Отправить обращение</Text>}</TouchableOpacity>
      <View style={st.rowBetween}><Text style={st.heading}>Мои обращения</Text><TouchableOpacity onPress={loadMyTickets}><Text style={st.refreshText}>Обновить</Text></TouchableOpacity></View>
      {myTickets.map(ticket=><View key={ticket.id} style={st.adminApplicationCard}>
        <View style={st.rowBetween}><Text style={st.adminApplicantName}>{ticket.subject}</Text><Text style={[st.adminStatus,ticket.status==='open'?st.adminStatusPending:st.adminStatusApproved]}>{ticket.status==='open'?'Открыто':'Закрыто'}</Text></View>
        <Text style={st.adminDate}>{new Date(ticket.created_at).toLocaleString('ru-RU')}</Text>
        <Text style={st.adminDetail}>{ticket.message}</Text>
        {ticket.admin_reply ? <Text style={st.adminDetail}>Ответ поддержки: {ticket.admin_reply}</Text> : <Text style={st.muted}>Ожидает ответа</Text>}
      </View>)}
    </ScrollView>}
    {tab === 'profile' && <ScrollView contentContainerStyle={st.pageContent}><Text style={st.pageTitle}>Профиль</Text>
      <View style={st.profileCard}><View style={st.profileAvatar}><Text style={st.profileAvatarText}>{(profile?.phone || profile?.email || 'L').slice(0,1).toUpperCase()}</Text></View><Text style={st.heading}>{profile?.phone || profile?.email || 'Аккаунт LadyGo'}</Text><Text style={st.muted}>{profile?.role === 'driver' ? 'Водитель' : profile?.role === 'admin' ? 'Администратор' : 'Пассажир'}</Text></View>
      <TouchableOpacity style={st.profileRow} onPress={() => setTab('orders')}><Text style={st.profileRowIcon}>◷</Text><Text style={st.profileRowText}>История поездок</Text><Text style={st.chevron}>›</Text></TouchableOpacity>
      {profile?.role === 'admin' && <TouchableOpacity style={st.profileRow} onPress={() => { setTab('admin'); loadAdminOrders(); loadAdminApplications(); loadAdminDrivers(); loadAdminTickets(); loadAdminAccounts(); }}><View style={st.profileRowIcon}><LineIcon name="gear" size={22}/></View><Text style={st.profileRowText}>Панель администратора</Text><Text style={st.chevron}>›</Text></TouchableOpacity>}
      {profile?.role === 'passenger' && (myApplication?.status === 'pending' ? <View style={st.applicationStatusCard}><Text style={st.applicationStatusTitle}>Заявка водителя на проверке</Text><Text style={st.muted}>Мы сообщим результат после рассмотрения администратором.</Text></View> : myApplication?.status === 'rejected' ? <View style={st.applicationStatusCard}><Text style={st.applicationStatusTitle}>Заявка отклонена</Text><Text style={st.muted}>{myApplication.review_note || myApplication.admin_note || 'Можно обратиться в поддержку.'}</Text></View> : <TouchableOpacity style={st.profileRow} onPress={() => setTab('apply')}><View style={st.profileRowIcon}><LineIcon name="car" size={22}/></View><Text style={st.profileRowText}>Стать водителем LadyGo</Text><Text style={st.chevron}>›</Text></TouchableOpacity>)}

      <TouchableOpacity style={st.profileRow} onPress={() => { setTab('support'); loadMyTickets(); }}><Text style={st.profileRowIcon}>?</Text><Text style={st.profileRowText}>Поддержка и обращения</Text><Text style={st.chevron}>›</Text></TouchableOpacity>
      <TouchableOpacity style={st.logout} onPress={signOut}><Text style={st.logoutText}>Выйти из аккаунта</Text></TouchableOpacity>
      <Text style={st.footnote}>LadyGo · 6.9.2 · Создано независимым автором @acyma</Text>
    </ScrollView>}
    <View style={st.bottomNav}>
      {([['ride','pin','Поездки',() => setTab('ride')],['driver','car','Водитель',() => { if (profile?.role === 'driver') { setTab('driver'); loadDriverOrders(); } else setTab('apply'); }],['support','chat','Чат',() => { setTab('support'); loadMyTickets(); }],['profile','user','Профиль',() => setTab('profile')]]).map(([id,icon,label,action]) => <TouchableOpacity key={id} style={st.navItem} onPress={action}><View style={st.navIcon}><LineIcon name={icon} size={23} color={(tab === id || (id === 'driver' && tab === 'apply')) ? P.green : '#87938A'}/></View><Text style={[st.navLabel, (tab === id || (id === 'driver' && tab === 'apply')) && st.navActive]}>{label}</Text></TouchableOpacity>)}
    </View>
  </SafeAreaView>;
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.white },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: P.white },
  auth: { flex: 1, backgroundColor: P.white, padding: 24, justifyContent: 'center' },
  authLogo: { alignItems: 'center', marginBottom: 38 },
  logo: { color: P.green, fontSize: 42, fontWeight: '900', letterSpacing: -2 },
  tagline: { color: P.muted, fontSize: 15, marginTop: 4 },
  authCard: { gap: 14 },
  heading: { color: P.ink, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  authInput: { borderWidth: 1, borderColor: P.line, borderRadius: 16, padding: 17, fontSize: 16, color: P.ink, backgroundColor: '#FFFCF6' },
  primaryBtn: { backgroundColor: P.green, minHeight: 56, borderRadius: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 8 },
  primaryText: { color: P.white, fontSize: 16, fontWeight: '800' },
  phoneOrderBtn: { minHeight: 52, borderRadius: 16, borderWidth: 1.5, borderColor: P.green, backgroundColor: P.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  phoneOrderText: { color: P.green, fontSize: 15, fontWeight: '800' },
  switchText: { color: P.green, textAlign: 'center', fontWeight: '700', padding: 12 },
  footnote: { color: P.muted, fontSize: 11, textAlign: 'center', marginTop: 20 },
  topbar: { height: 76, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: P.white, borderBottomWidth: 1, borderColor: P.line, zIndex: 12, elevation: 3 },
  brandBlock: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  topLogo: { width: 54, height: 54, borderRadius: 27, borderWidth: 1, borderColor: P.gold, backgroundColor: P.pale },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAction: { width: 44, height: 44, borderRadius: 22, backgroundColor: P.pale, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: P.line },
  headerActionIcon: { color: P.green, fontSize: 23, fontWeight: '700' },
  notificationDot: { position: 'absolute', top: 7, right: 7, width: 8, height: 8, borderRadius: 4, backgroundColor: P.gold, borderWidth: 1, borderColor: P.white },
  logoSmall: { color: P.green, fontSize: 25, fontWeight: '900', letterSpacing: -1 },
  topSub: { color: P.muted, fontSize: 10, marginTop: -2 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: P.pale, alignItems: 'center', justifyContent: 'center' },
  modeSwitch: { flexDirection: 'row', backgroundColor: P.pale, borderRadius: 16, padding: 4, gap: 3, borderWidth: 1, borderColor: P.line, flexShrink: 1 },
  modeOption: { paddingHorizontal: 9, paddingVertical: 9, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modeOptionActive: { backgroundColor: P.green, elevation: 2, shadowColor: P.green, shadowOpacity: 0.2, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  modeText: { color: P.muted, fontSize: 10, fontWeight: '900' },
  modeTextActive: { color: P.white },
  adminTopButton: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 13, backgroundColor: P.pale, borderWidth: 1, borderColor: '#E8DEC9' },
  adminTopButtonActive: { backgroundColor: P.green, borderColor: P.green },
  adminTopButtonText: { color: P.green, fontSize: 12, fontWeight: '900' },
  adminTopButtonTextActive: { color: P.white },
  adminRefresh: { width: 42, height: 42, borderRadius: 14, backgroundColor: P.pale, alignItems: 'center', justifyContent: 'center' },
  adminRefreshText: { color: P.green, fontSize: 25, fontWeight: '900' },
  adminStats: { flexDirection: 'row', gap: 9 },
  adminStat: { flex: 1, backgroundColor: '#F6F0E4', borderWidth: 1, borderColor: P.line, borderRadius: 16, padding: 13, gap: 5 },
  adminStatValue: { color: P.green, fontSize: 24, fontWeight: '900' },
  adminStatLabel: { color: P.muted, fontSize: 10, fontWeight: '800' },
  adminHero: { flexDirection:'row', alignItems:'center', gap:12, backgroundColor:'#F6F0E4', borderWidth:1, borderColor:'#E8DEC9', borderRadius:20, padding:16 },
  adminEyebrow: { color:P.green, fontSize:9, fontWeight:'900', letterSpacing:1.2, marginBottom:5 },
  adminTabs: { flexDirection:'row', gap:7, flexWrap:'wrap' },
  adminTab: { paddingHorizontal:12, paddingVertical:11, borderRadius:13, backgroundColor:'#F6F0E4', borderWidth:1, borderColor:P.line },
  adminTabActive: { backgroundColor:P.green, borderColor:P.green },
  adminTabText: { color:P.muted, fontSize:11, fontWeight:'800' },
  adminTabTextActive: { color:P.white },
  adminApplicationCard: { backgroundColor:P.white, borderWidth:1, borderColor:P.line, borderRadius:18, padding:15, gap:8 },
  adminApplicantName: { color:P.ink, fontSize:16, fontWeight:'900', flexShrink:1 },
  adminDetail: { color:P.ink, fontSize:12, lineHeight:17 },
  adminDate: { color:P.muted, fontSize:10 },
  adminStatus: { overflow:'hidden', borderRadius:20, paddingHorizontal:9, paddingVertical:6, fontSize:10, fontWeight:'900' },
  adminStatusPending: { backgroundColor:'#FFF0D7', color:'#8A5A00' },
  adminStatusApproved: { backgroundColor:'#E5F6EC', color:'#247448' },
  adminStatusRejected: { backgroundColor:'#F6F0E4', color:'#176344' },
  adminPhotoRow: { flexDirection:'row', gap:10, flexWrap:'wrap', alignItems:'center' },
  adminPhoto: { width:64, height:64, borderRadius:15, backgroundColor:P.pale },
  adminCarPhoto: { width:132, height:82, borderRadius:13, backgroundColor:P.pale },
  adminActionRow: { flexDirection:'row', gap:9, marginTop:4 },
  adminApprove: { flex:1, minHeight:44, borderRadius:13, backgroundColor:'#218653', alignItems:'center', justifyContent:'center' },
  adminReject: { flex:1, minHeight:44, borderRadius:13, backgroundColor:'#F6F0E4', borderWidth:1, borderColor:'#E8DEC9', alignItems:'center', justifyContent:'center' },
  adminActionText: { color:'#FFFFFF', fontWeight:'900', fontSize:12 },
  adminRejectText: { color:'#10432F', fontWeight:'900', fontSize:12 },
  applicationStatusCard: { backgroundColor:'#F6F0E4', borderRadius:16, padding:15, gap:6, borderWidth:1, borderColor:'#E8DEC9' },
  applicationStatusTitle: { color:P.green, fontWeight:'900', fontSize:14 },
  applicationPhotoButton: { flex:1, minHeight:52, padding:10, borderRadius:13, backgroundColor:P.pale, alignItems:'center', justifyContent:'center' },
  applicationPhotoText: { color:P.green, fontSize:11, fontWeight:'900', textAlign:'center' },
  adultConfirm: { padding:14, borderRadius:14, backgroundColor:'#F6F0E4', borderWidth:1, borderColor:P.line },
  adultConfirmText: { color:P.ink, fontSize:13, fontWeight:'800' },
  driverHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  driverEyebrow: { color: P.green, fontSize: 9, fontWeight: '900', letterSpacing: 1.3, marginBottom: 5 },
  driverSubtitle: { color: P.muted, fontSize: 12, lineHeight: 17, marginTop: -2 },
  driverRefresh: { width: 44, height: 44, borderRadius: 15, backgroundColor: P.pale, alignItems: 'center', justifyContent: 'center' },
  driverRefreshText: { color: P.green, fontSize: 26, fontWeight: '900' },
  driverModeHint: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderRadius: 17, backgroundColor: '#F6F0E4', borderWidth: 1, borderColor: '#E8DEC9' },
  driverModeIcon: { fontSize: 24 },
  driverModeTitle: { color: P.ink, fontSize: 13, fontWeight: '900' },
  driverModeSub: { color: P.muted, fontSize: 10, marginTop: 3 },
  driverOnlineDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: P.green },
  shiftButton: { minHeight: 52, borderRadius: 16, backgroundColor: P.green, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  shiftButtonOff: { backgroundColor: P.green },
  shiftButtonText: { color: P.white, fontSize: 15, fontWeight: '900' },
  driverStatsGrid: { flexDirection: 'row', gap: 8 },
  driverStatCard: { flex: 1, backgroundColor: '#FFFCF6', borderWidth: 1, borderColor: P.line, borderRadius: 15, padding: 12, gap: 7 },
  driverStatValue: { color: P.green, fontSize: 24, fontWeight: '900' },
  driverStatLabel: { color: P.muted, fontSize: 9, fontWeight: '800', lineHeight: 13 },
  driverEarningsCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2923', borderRadius: 18, padding: 16 },
  driverEarningsLabel: { color: '#E8DEC9', fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  driverEarningsValue: { color: P.white, fontSize: 25, fontWeight: '900', marginTop: 5 },
  driverEarningsNote: { color: '#756F63', fontSize: 10, marginTop: 2 },
  driverEarningsIcon: { color: '#C79A38', fontSize: 36, fontWeight: '900', paddingHorizontal: 8 },
  driverTabs: { gap: 7, paddingVertical: 2 },
  driverTab: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 13, backgroundColor: '#F6F0E4', borderWidth: 1, borderColor: '#F6F0E4' },
  driverTabActive: { backgroundColor: P.green, borderColor: P.green },
  driverTabText: { color: P.muted, fontSize: 11, fontWeight: '800' },
  driverTabTextActive: { color: P.white },
  driverSecondaryBtn: { paddingHorizontal: 17, paddingVertical: 11, borderRadius: 13, backgroundColor: P.pale, marginTop: 5 },
  driverSecondaryText: { color: P.green, fontSize: 12, fontWeight: '900' },
  driverOrderCard: { borderWidth: 1, borderColor: P.line, borderRadius: 19, padding: 15, gap: 13, backgroundColor: P.white },
  driverStatusPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  driverStatusNew: { backgroundColor: '#F6F0E4' },
  driverStatusActive: { backgroundColor: '#F0E8D8' },
  driverStatusDone: { backgroundColor: '#E6F5EE' },
  driverStatusText: { color: P.ink, fontSize: 10, fontWeight: '900' },
  driverRouteBlock: { flexDirection: 'row', gap: 12, paddingVertical: 3 },
  driverRouteRail: { width: 12, alignItems: 'center', paddingVertical: 3 },
  driverRouteDotStart: { width: 9, height: 9, borderRadius: 5, backgroundColor: P.green },
  driverRouteLine: { width: 1, height: 24, backgroundColor: '#D8E6D6' },
  driverRouteDotEnd: { width: 9, height: 9, borderRadius: 5, backgroundColor: P.green },
  driverRouteCaption: { color: P.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, marginBottom: 3 },
  driverRouteAddress: { color: P.ink, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  driverOrderMeta: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: '#F6F0E4', paddingTop: 11 },
  driverOrderPrice: { color: P.green, fontSize: 17, fontWeight: '900' },
  driverOrderPayment: { color: P.ink, fontSize: 12, fontWeight: '800' },
  driverActions: { gap: 8 },
  chatCard: { backgroundColor: '#FFFCF6', borderWidth: 1, borderColor: '#E8DEC9', borderRadius: 18, padding: 13, gap: 10 },
  chatHint: { color: P.muted, fontSize: 10, fontWeight: '700' },
  chatMessages: { maxHeight: 230, minHeight: 90 },
  chatEmpty: { color: P.muted, fontSize: 13, textAlign: 'center', padding: 18, lineHeight: 19 },
  chatBubble: { maxWidth: '86%', borderRadius: 15, padding: 10, marginVertical: 4, gap: 3 },
  chatMine: { alignSelf: 'flex-end', backgroundColor: '#F0E8D8', borderBottomRightRadius: 5 },
  chatOther: { alignSelf: 'flex-start', backgroundColor: '#F6F0E4', borderBottomLeftRadius: 5 },
  chatSender: { color: P.green, fontSize: 10, fontWeight: '900' },
  chatMessage: { color: P.ink, fontSize: 14, lineHeight: 19 },
  chatTime: { color: P.muted, fontSize: 9, textAlign: 'right' },
  chatComposer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  chatInput: { flex: 1, minHeight: 44, maxHeight: 100, borderWidth: 1, borderColor: P.line, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, color: P.ink, backgroundColor: P.white, fontSize: 14 },
  chatSend: { width: 44, height: 44, borderRadius: 14, backgroundColor: P.green, alignItems: 'center', justifyContent: 'center' },
  chatSendText: { color: P.white, fontSize: 19, fontWeight: '900' },
  avatarText: { color: P.green, fontWeight: '900', fontSize: 16 },
  map: { flexShrink: 0, backgroundColor: '#E7EDE5', zIndex: 0, elevation: 0, overflow: 'hidden' },
  mapControls: { position: 'absolute', right: 12, bottom: 14, gap: 7, alignItems: 'flex-end' },
  locateButton: { width: 46, height: 46, borderRadius: 16, backgroundColor: P.white, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  locateButtonText: { color: P.green, fontSize: 22, fontWeight: '900' },
  mapControlRow: { flexDirection: 'column', gap: 6, alignItems: 'center' },
  mapControl: { width: 34, height: 34, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.96)', alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  mapControlActive: { backgroundColor: P.green },
  mapControlText: { color: P.ink, fontSize: 19, fontWeight: '800', lineHeight: 23 },
  mapControlTextActive: { color: P.white },
  locateText: { color: P.green, fontSize: 22, fontWeight: '800' },
  mapLabel: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: P.white, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, elevation: 2 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: P.green },
  mapLabelText: { color: P.ink, fontSize: 12, fontWeight: '700' },
  sheet: { flex: 1, minHeight: 180, backgroundColor: P.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -22, zIndex: 20, elevation: 18, overflow: 'hidden' },
  sheetContent: { padding: 17, paddingBottom: 28, gap: 13 },
  sheetHandleWrap: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingBottom: 4, zIndex: 21, elevation: 2 },
  sheetHandleHint: { color: P.muted, fontSize: 9, fontWeight: '700', marginTop: 4 },
  sheetHandle: { width: 38, height: 4, borderRadius: 3, backgroundColor: '#D8E6D6', alignSelf: 'center', marginBottom: 3 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cityPill: { backgroundColor: P.pale, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20 },
  cityPillText: { color: P.green, fontSize: 11, fontWeight: '800' },
  field: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#FFFCF6', borderWidth: 1, borderColor: P.line, borderRadius: 16 },
  fieldIcon: { color: P.green, fontSize: 16, fontWeight: '900' },
  fieldLabel: { color: P.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  fieldInput: { color: P.ink, fontSize: 16, padding: 0, marginTop: 3, minHeight: 25 },
  connector: { height: 7, width: 1, backgroundColor: '#D8E6D6', marginLeft: 23, marginTop: -12, marginBottom: -12, zIndex: 2 },
  locateRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 5 },
  locateRowIcon: { color: P.green, fontSize: 18 },
  locateRowText: { color: P.green, fontSize: 13, fontWeight: '700' },
  routeMeta: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F6F0E4', padding: 11, borderRadius: 12 },
  routeMetaText: { color: P.muted, fontSize: 12, fontWeight: '700' },
  sectionTitle: { color: P.ink, fontSize: 15, fontWeight: '800', marginTop: 6 },
  tariffs: { flexDirection: 'row', gap: 8 },
  tariff: { flex: 1, minHeight: 96, borderWidth: 1, borderColor: P.line, borderRadius: 19, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, paddingVertical: 9, gap: 5, backgroundColor: P.white },
  tariffSelected: { borderColor: P.gold, backgroundColor: '#F4EBD5', borderWidth: 2, shadowColor: P.gold, shadowOpacity: 0.16, shadowRadius: 7, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  tariffIcon: { color: P.green, fontSize: 22, fontWeight: '900' },
  tariffName: { color: P.ink, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  tariffSub: { color: P.muted, fontSize: 9, lineHeight: 12, textAlign: 'center' },
  tariffPrice: { color: P.green, fontSize: 11, fontWeight: '800' },
  networkHint: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#EEF4EA', borderWidth: 1, borderColor: '#D9E5D2', borderRadius: 18, padding: 14 },
  networkHintIcon: { color: P.green, fontSize: 22, fontWeight: '900' },
  networkHintText: { flex: 1, color: P.ink, fontSize: 12, lineHeight: 18 },
  priceCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F6F0E4', borderRadius: 17, padding: 14, gap: 10 },
  priceTitle: { color: P.ink, fontWeight: '800', fontSize: 13 },
  priceHint: { color: P.muted, fontSize: 11, marginTop: 3 },
  priceValue: { color: P.green, fontWeight: '900', fontSize: 19 },
  payRow: { flexDirection: 'row', gap: 9 },
  payOption: { flex: 1, borderWidth: 1, borderColor: P.line, borderRadius: 13, padding: 12, alignItems: 'center', gap: 4 },
  paySelected: { borderColor: P.green, backgroundColor: P.pale },
  payIcon: { color: P.green, fontSize: 18, fontWeight: '900' },
  payText: { color: P.ink, fontSize: 12, fontWeight: '700' },
  phoneInput: { borderWidth: 1, borderColor: P.line, borderRadius: 13, padding: 14, fontSize: 14, color: P.ink },
  disabled: { opacity: 0.45 },
  bottomNav: { height: 68, flexDirection: 'row', borderTopWidth: 1, borderColor: P.line, backgroundColor: P.white, paddingBottom: Platform.OS === 'android' ? 4 : 0, zIndex: 30, elevation: 12 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  navIcon: { color: '#87938A', fontSize: 21, fontWeight: '800' },
  navLabel: { color: '#87938A', fontSize: 10, fontWeight: '700' },
  navActive: { color: P.green },
  searchScreen: { flex: 1, backgroundColor: P.white },
  searchTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10, minHeight: 60, borderBottomWidth: 1, borderColor: P.line },
  back: { color: P.green, fontSize: 34, lineHeight: 38 },
  searchInput: { flex: 1, fontSize: 17, color: P.ink, paddingVertical: 12 },
  clear: { color: P.muted, fontSize: 26, paddingHorizontal: 5 },
  suggestion: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 17, paddingVertical: 15, borderBottomWidth: 1, borderColor: '#F6F0E4' },
  suggestionIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: P.pale, alignItems: 'center', justifyContent: 'center' },
  suggestionTitle: { color: P.ink, fontSize: 15, fontWeight: '700' },
  suggestionSub: { color: P.muted, fontSize: 12, marginTop: 3 },
  empty: { color: P.muted, textAlign: 'center', padding: 25, lineHeight: 21 },
  pageContent: { padding: 18, gap: 13, paddingBottom: 28 },
  pageTitle: { color: P.ink, fontSize: 27, fontWeight: '900', marginBottom: 5 },
  emptyCard: { alignItems: 'center', padding: 28, backgroundColor: '#FFFCF6', borderRadius: 20, gap: 10 },
  emptyIcon: { color: P.green, fontSize: 38 },
  muted: { color: P.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  orderCard: { borderWidth: 1, borderColor: P.line, borderRadius: 17, padding: 15, gap: 10, backgroundColor: P.white },
  orderStatus: { color: P.green, fontSize: 13, fontWeight: '900' },
  orderDate: { color: P.muted, fontSize: 11 },
  orderAddress: { color: P.ink, fontSize: 13, lineHeight: 19 },
  orderPrice: { color: P.ink, fontSize: 16, fontWeight: '900' },
  cancelText: { color: P.green, fontSize: 12, fontWeight: '800' },
  profileCard: { alignItems: 'center', backgroundColor: P.pale, borderRadius: 20, padding: 24, gap: 7 },
  profileAvatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: P.white, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  profileAvatarText: { color: P.green, fontSize: 28, fontWeight: '900' },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 16, borderBottomWidth: 1, borderColor: P.line },
  profileRowIcon: { color: P.green, fontSize: 19, width: 24 },
  profileRowText: { flex: 1, color: P.ink, fontSize: 14, fontWeight: '700' },
  chevron: { color: P.muted, fontSize: 22 },
  logout: { alignItems: 'center', padding: 16, marginTop: 8 },
  logoutText: { color: P.green, fontSize: 14, fontWeight: '800' },
  refreshText: { color: P.green, fontSize: 13, fontWeight: '800', marginBottom: 10 },
  ratingSummary: { color: P.green, fontSize: 12, fontWeight: '800' },
  rateBox: { backgroundColor: '#F6F0E4', borderWidth: 1, borderColor: '#E8DEC9', borderRadius: 14, padding: 12, gap: 8 },
  rateTitle: { color: P.ink, fontSize: 13, fontWeight: '800' },
  rateStars: { flexDirection: 'row', gap: 10 },
  rateStar: { color: '#D8E6D6', fontSize: 30 },
  rateStarActive: { color: P.gold },
  rateSubmit: { backgroundColor: P.green, paddingVertical: 11, borderRadius: 12, alignItems: 'center' },
  rateSubmitText: { color: P.white, fontSize: 13, fontWeight: '900' },
  ratingThanks: { color: P.green, fontSize: 12, fontWeight: '800' },
  ratingDriverCard: { backgroundColor: '#F6F0E4', borderColor: '#E8DEC9', borderWidth: 1, borderRadius: 16, padding: 14, gap: 5 },
  ratingDriverLabel: { color: P.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  ratingDriverValue: { color: P.green, fontSize: 24, fontWeight: '900' },
  ratingDriverCount: { color: P.muted, fontSize: 12, fontWeight: '700' },
  vehicleEditorCard: { backgroundColor: P.white, borderColor: P.line, borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  vehicleEditorHint: { color: P.muted, fontSize: 10, fontWeight: '700' },
  vehiclePhotoPreview: { width: '100%', height: 170, borderRadius: 14, backgroundColor: P.pale },
  vehiclePhotoPlaceholder: { width: '100%', height: 130, borderRadius: 14, backgroundColor: P.pale, alignItems: 'center', justifyContent: 'center', gap: 8 },
  vehiclePhotoIcon: { fontSize: 36 },
  vehiclePhotoPlaceholderText: { color: P.muted, fontSize: 12, fontWeight: '700' },
  vehiclePhotoButton: { borderWidth: 1, borderColor: P.green, borderRadius: 12, padding: 12, alignItems: 'center' },
  vehiclePhotoButtonText: { color: P.green, fontSize: 13, fontWeight: '800' },
  vehicleInputRow: { flexDirection: 'row', gap: 8 },
  vehicleSaveButton: { backgroundColor: P.green, borderRadius: 13, padding: 14, alignItems: 'center' },
  vehicleSaveText: { color: P.white, fontSize: 13, fontWeight: '900' },
  passengerDriverRow: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 12 },
  passengerDriverPhoto: { width: 62, height: 62, borderRadius: 31, backgroundColor: P.pale },
  passengerDriverPlaceholder: { width: 62, height: 62, borderRadius: 31, backgroundColor: P.pale, alignItems: 'center', justifyContent: 'center' },
  passengerDriverInitial: { color: P.green, fontSize: 25, fontWeight: '900' },
  passengerDriverRating: { color: P.gold, fontSize: 13, fontWeight: '900' },
  driverPhotoEditorRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  driverPhotoPreview: { width: 92, height: 92, borderRadius: 46, backgroundColor: P.pale },
  driverPhotoPlaceholder: { width: 92, height: 92, borderRadius: 46, backgroundColor: P.pale, alignItems: 'center', justifyContent: 'center' },
  driverPhotoPlaceholderText: { fontSize: 34 },
  passengerVehiclePhoto: { width: '100%', height: 180, borderRadius: 14, marginBottom: 10, backgroundColor: P.pale }
});
