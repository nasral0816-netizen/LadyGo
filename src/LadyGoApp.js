import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform,
  SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as TaskManager from 'expo-task-manager';
import { supabase, isConfigured } from './supabase';

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });

const DRIVER_LOCATION_TASK = 'ladygo-driver-background-location';

if (!TaskManager.isTaskDefined(DRIVER_LOCATION_TASK)) {
  TaskManager.defineTask(DRIVER_LOCATION_TASK, async ({ data, error }) => {
    if (error || !supabase) return;
    const locations = data?.locations || [];
    const latest = locations[locations.length - 1];
    if (!latest?.coords) return;
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      const currentUser = authData?.user;
      if (authError || !currentUser) return;
      const [{ data: currentProfile }, { data: presence }] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', currentUser.id).maybeSingle(),
        supabase.from('driver_presence').select('is_online').eq('driver_id', currentUser.id).maybeSingle(),
      ]);
      if (currentProfile?.role !== 'driver' || presence?.is_online !== true) return;
      const now = new Date().toISOString();
      const { latitude, longitude, heading } = latest.coords;
      const { error: locationError } = await supabase.from('driver_locations').upsert({
        driver_id: currentUser.id, latitude, longitude,
        heading: Number.isFinite(heading) ? heading : null,
        updated_at: now,
      });
      if (locationError) throw locationError;
      const { error: presenceError } = await supabase.from('driver_presence')
        .update({ updated_at: now }).eq('driver_id', currentUser.id).eq('is_online', true);
      if (presenceError) throw presenceError;
    } catch (taskError) {
      console.warn('LadyGo background location:', taskError?.message || taskError);
    }
  });
}

const C = {
  pink: '#E85D91', pinkDark: '#C94378', pale: '#FFF3F7',
  ink: '#282329', muted: '#8E8289', line: '#F0E5E9',
  white: '#FFFFFF', green: '#26865A', red: '#C34F63',
  blue: '#477FD1', map: '#F6F1ED',
};
const PHONE = '+79911121227';
const SUPPORT = 'ladygosupport@gmail.com';
const TARIFFS = [
  { id: 'economy', name: 'Эконом', detail: 'Для повседневных поездок', factor: 1 },
  { id: 'comfort', name: 'Комфорт', detail: 'Больше пространства', factor: 1.35 },
  { id: 'child', name: 'С детьми', detail: 'Поездка с ребёнком', factor: 1.2 },
];
const ACTIVE = ['new', 'accepted', 'arrived', 'in_progress'];
const STATUS = {
  new: 'Ищем водителя', accepted: 'Водитель назначен', arrived: 'Водитель на месте',
  in_progress: 'Поездка началась', completed: 'Поездка завершена',
  cancelled: 'Заказ отменён', declined: 'Заказ отклонён',
};
const money = value => value == null ? 'Стоимость согласует водитель' : `${value} ₽`;
const errorText = error => {
  const m = String(error?.message || '');
  if (/invalid login credentials/i.test(m)) return 'Неверная почта или пароль.';
  if (/email not confirmed/i.test(m)) return 'Сначала подтверди электронную почту.';
  if (/network request failed|fetch failed/i.test(m)) return 'Проверь подключение к интернету.';
  return m || 'Не удалось выполнить действие. Попробуй ещё раз.';
};

function Button({ title, onPress, secondary, danger, disabled, compact }) {
  return <TouchableOpacity activeOpacity={0.82} disabled={disabled} onPress={onPress}
    style={[s.button, secondary && s.buttonSecondary, danger && s.buttonDanger,
      disabled && { opacity: 0.45 }, compact && { paddingVertical: 10 }]}>
    <Text style={[s.buttonText, secondary && { color: C.pinkDark }, danger && { color: C.red }]}>{title}</Text>
  </TouchableOpacity>;
}
function Input({ label, value, onChangeText, placeholder, keyboardType, secureTextEntry, multiline }) {
  return <View style={s.field}>
    {label ? <Text style={s.label}>{label}</Text> : null}
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder || label}
      placeholderTextColor="#B6AAB0" keyboardType={keyboardType} secureTextEntry={secureTextEntry}
      multiline={multiline} autoCapitalize="none" style={[s.input, multiline && { minHeight: 76, textAlignVertical: 'top' }]} />
  </View>;
}
function Pill({ children, color = C.pink }) {
  return <View style={[s.pill, { borderColor: color }]}><Text style={{ color, fontWeight: '700', fontSize: 12 }}>{children}</Text></View>;
}
function Card({ children, style }) { return <View style={[s.card, style]}>{children}</View>; }

function TripMap({ order }) {
  const [roadRoute, setRoadRoute] = useState([]);
  const [routeSummary, setRouteSummary] = useState(null);
  const hasCoords = order.pickup_lat != null && order.pickup_lng != null && order.destination_lat != null && order.destination_lng != null;
  const start = { latitude: Number(order.pickup_lat || 0), longitude: Number(order.pickup_lng || 0) };
  const end = { latitude: Number(order.destination_lat || 0), longitude: Number(order.destination_lng || 0) };
  const stops = Array.isArray(order.stops) ? order.stops.filter(point =>
    Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude))
  ).map(point => ({ latitude: Number(point.latitude), longitude: Number(point.longitude), address: point.address })) : [];
  const routePoints = [start, ...stops, end];
  const routeKey = routePoints.map(point => point.longitude + ',' + point.latitude).join(';');

  useEffect(() => {
    let active = true;
    if (!hasCoords) {
      setRoadRoute([]);
      setRouteSummary(null);
      return () => { active = false; };
    }
    setRoadRoute([]);
    setRouteSummary(null);
    fetch(`https://router.project-osrm.org/route/v1/driving/${routeKey}?overview=full&geometries=geojson`)
      .then(response => {
        if (!response.ok) throw new Error('Route service unavailable');
        return response.json();
      })
      .then(json => {
        const route = json.routes?.[0];
        if (!route?.geometry?.coordinates?.length) throw new Error('Route not found');
        if (!active) return;
        setRoadRoute(route.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })));
        setRouteSummary({ km: (route.distance / 1000).toFixed(1), minutes: Math.max(1, Math.round(route.duration / 60)) });
      })
      .catch(() => { if (active) { setRoadRoute([]); setRouteSummary(null); } });
    return () => { active = false; };
  }, [hasCoords, routeKey]);

  if (!hasCoords) return null;
  return <View style={{ gap: 7 }}>
    <MapView style={{ height: 190, borderRadius: 15, overflow: 'hidden' }} initialRegion={{ latitude: (start.latitude + end.latitude) / 2, longitude: (start.longitude + end.longitude) / 2, latitudeDelta: Math.max(0.02, Math.abs(start.latitude - end.latitude) * 1.8), longitudeDelta: Math.max(0.02, Math.abs(start.longitude - end.longitude) * 1.8) }}>
      <Marker coordinate={start} title="Подача" pinColor={C.pink} />
      {stops.map((point, index) => <Marker key={'trip-stop-' + index} coordinate={point} title={'Остановка ' + (index + 1)} description={point.address} pinColor="#D69A35" />)}
      <Marker coordinate={end} title="Назначение" pinColor={C.blue} />
      <Polyline coordinates={roadRoute.length > 1 ? roadRoute : routePoints} strokeColor={C.pink} strokeWidth={4} />
    </MapView>
    {routeSummary && <Text style={s.routeInfo}>{routeSummary.km} км · около {routeSummary.minutes} мин по дороге</Text>}
  </View>;
}

const openDriverNavigation = async order => {
  const stops = Array.isArray(order.stops) ? order.stops : [];
  const waypoints = stops.slice(0, 3).map(stop => stop.address).filter(Boolean).join('|');
  const query = [
    'api=1',
    'destination=' + encodeURIComponent(order.destination_address || ''),
    'travelmode=driving',
    waypoints ? 'waypoints=' + encodeURIComponent(waypoints) : '',
  ].filter(Boolean).join('&');
  const url = 'https://www.google.com/maps/dir/?' + query;
  try {
    await Linking.openURL(url);
  } catch (_) {
    Alert.alert('Навигация', 'Не удалось открыть карты на этом устройстве.');
  }
};

async function getPositionWithFallback() {
  const enabled = await Location.hasServicesEnabledAsync();
  if (!enabled) throw new Error('На телефоне выключена геолокация. Включи «Местоположение» и повтори.');
  const cached = await Location.getLastKnownPositionAsync({ maxAge: 120000, requiredAccuracy: 1500 }).catch(() => null);
  let timer;
  try {
    const current = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: true }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Телефон не смог определить координаты за 15 секунд. Проверь GPS и попробуй на улице.')), 15000); }),
    ]);
    return current;
  } catch (error) {
    if (cached) return cached;
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default function LadyGoApp() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('passenger');
  const [tab, setTab] = useState('ride');
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [requestedFor, setRequestedFor] = useState('Как можно скорее');
  const [stopsText, setStopsText] = useState('');
  const [tariff, setTariff] = useState('economy');
  const [savedPlaces, setSavedPlaces] = useState([]);
  const [savedLabel, setSavedLabel] = useState('Дом');
  const [savedAddress, setSavedAddress] = useState('');
  const [clock, setClock] = useState(Date.now());
  const [coords, setCoords] = useState(null);
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [stopCoords, setStopCoords] = useState([]);
  const [driverLocation, setDriverLocation] = useState(null);
  const [assignedDriver, setAssignedDriver] = useState(null);
  const [route, setRoute] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [orders, setOrders] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [applications, setApplications] = useState([]);
  const [driverOnline, setDriverOnline] = useState(false);
  const [driverGpsError, setDriverGpsError] = useState('');
  const [driverGpsUpdatedAt, setDriverGpsUpdatedAt] = useState(null);
  const [fare, setFare] = useState({});
  const [offerTimes, setOfferTimes] = useState({});
  const [applicationName, setApplicationName] = useState('');
  const [applicationPhone, setApplicationPhone] = useState('');
  const [applicationCar, setApplicationCar] = useState('');
  const [applicationNote, setApplicationNote] = useState('');
  const locationWatch = useRef(null);
  const mapRef = useRef(null);

  const user = session?.user;
  const role = profile?.role || 'passenger';
  const isAdmin = role === 'admin';
  const isDriver = role === 'driver';
  const activeOrder = useMemo(() => orders.find(o => ACTIVE.includes(o.status)), [orders]);

  const loadProfile = useCallback(async currentUser => {
    if (!currentUser || !supabase) return null;
    const { data, error } = await supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
    if (error) throw error;
    setProfile(data || null);
    return data || null;
  }, []);

  const loadOrders = useCallback(async () => {
    if (!user || !profile || !supabase) return;
    let query = supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(40);
    if (role === 'driver') query = query.or('driver_id.eq.' + user.id + ',and(status.eq.new,driver_id.is.null)');
    else if (!isAdmin) query = query.eq('passenger_id', user.id);
    const { data, error } = await query;
    if (error) throw error;
    setOrders(data || []);
    if (role === 'driver') {
      const { data: offers, error: offerError } = await supabase.from('order_offers').select('order_id, created_at').eq('driver_id', user.id).eq('status', 'pending');
      if (!offerError) setOfferTimes(Object.fromEntries((offers || []).map(x => [x.order_id, x.created_at])));
    }
  }, [user, profile, role, isAdmin]);

  const loadNotifications = useCallback(async () => {
    if (!user || !supabase) return;
    const { data, error } = await supabase.from('notifications').select('*')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(60);
    if (error) throw error;
    setNotifications(data || []);
  }, [user]);

  const loadApplications = useCallback(async () => {
    if (!user || !profile || !supabase) return;
    let query = supabase.from('driver_applications').select('*').order('created_at', { ascending: false });
    if (!isAdmin) query = query.eq('user_id', user.id);
    const { data, error } = await query;
    if (error) throw error;
    setApplications(data || []);
  }, [user, profile, isAdmin]);

  const loadSavedPlaces = useCallback(async () => {
    if (!user || isDriver || isAdmin || !supabase) return;
    const { data, error } = await supabase.from('saved_places').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (!error) setSavedPlaces(data || []);
  }, [user, isDriver, isAdmin]);

  const refreshAll = useCallback(async () => {
    try {
      await Promise.all([loadOrders(), loadApplications(), loadSavedPlaces(), loadNotifications()]);
    } catch (e) { Alert.alert('Не удалось обновить данные', errorText(e)); }
  }, [loadOrders, loadApplications, loadSavedPlaces, loadNotifications]);

  useEffect(() => {
    const handleAuthUrl = async url => {
      if (!supabase || !url || !url.startsWith('ladygo://')) return;
      try {
        const parsed = new URL(url);
        const code = parsed.searchParams.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) Alert.alert('Подтверждение почты', errorText(error));
          else Alert.alert('LadyGo', 'Почта подтверждена.');
        }
      } catch (e) { Alert.alert('Ссылка авторизации', errorText(e)); }
    };
    Linking.getInitialURL().then(handleAuthUrl);
    const urlListener = Linking.addEventListener('url', ({ url }) => handleAuthUrl(url));
    return () => urlListener.remove();
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!supabase) { setBooting(false); return; }
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) throw error;
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user);
      setBooting(false);
    }).catch(e => { if (mounted) { setBooting(false); Alert.alert('Ошибка запуска', errorText(e)); } });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) { setProfile(null); setOrders([]); }
      else loadProfile(nextSession.user).catch(e => Alert.alert('Профиль', errorText(e)));
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [loadProfile]);

  useEffect(() => { if (user && profile) refreshAll(); }, [user, profile, refreshAll]);
  useEffect(() => { const id = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { if (isDriver) setMode('driver'); else if (isAdmin) setMode('admin'); else setMode('passenger'); }, [isDriver, isAdmin]);

  const registerDriverPush = useCallback(async () => {
    if (!isDriver || !user || !Device.isDevice) return;
    try {
      if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('driver-orders', { name: 'Заказы LadyGo', importance: Notifications.AndroidImportance.MAX, sound: 'default', vibrationPattern: [0, 250, 150, 250] });
      const permission = await Notifications.getPermissionsAsync();
      let status = permission.status;
      if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
      if (status !== 'granted') return;
      const projectId = '95ac82ec-010d-4770-9aba-9f52878e1b3b';
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      const { error } = await supabase.from('driver_push_tokens').upsert({
        driver_id: user.id, expo_push_token: token, device_platform: platform, updated_at: new Date().toISOString(),
      }, { onConflict: 'driver_id,expo_push_token' });
      if (error) console.warn('Push token registration:', error.message);
    } catch (e) { console.warn('Push registration:', e?.message || e); }
  }, [isDriver, user]);

  useEffect(() => { registerDriverPush(); }, [registerDriverPush]);

  useEffect(() => {
    if (!isDriver || !user) return;
    supabase.from('driver_presence').select('is_online').eq('driver_id', user.id).maybeSingle()
      .then(({ data }) => { if (data) setDriverOnline(Boolean(data.is_online)); });
  }, [isDriver, user]);

  useEffect(() => {
    if (!isDriver || !user || !driverOnline) {
      if (locationWatch.current) { locationWatch.current.remove(); locationWatch.current = null; }
      return;
    }
    let active = true;
    (async () => {
      try {
        const foreground = await Location.getForegroundPermissionsAsync();
        if (foreground.status !== 'granted') throw new Error('Разреши LadyGo доступ к геолокации.');
        const background = await Location.getBackgroundPermissionsAsync();
        if (background.status !== 'granted') {
          setDriverGpsError('Для работы при свёрнутом приложении разреши постоянный доступ к местоположению в настройках.');
        } else {
          const registered = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK);
          if (!registered) {
            await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 12000,
              distanceInterval: 20,
              deferredUpdatesInterval: 30000,
              deferredUpdatesDistance: 40,
              pausesUpdatesAutomatically: false,
              showsBackgroundLocationIndicator: true,
              ...(Platform.OS === 'android' ? {
                foregroundService: {
                  notificationTitle: 'LadyGo — водитель на линии',
                  notificationBody: 'Геолокация обновляется, пока вы принимаете заказы.',
                  notificationColor: C.pink,
                  killServiceOnDestroy: false,
                },
              } : {}),
            });
          }
        }
        const initial = await getPositionWithFallback();
        if (!active) return;
        const now = new Date().toISOString();
        const { latitude, longitude, heading } = initial.coords;
        const { error } = await supabase.from('driver_locations').upsert({
          driver_id: user.id, latitude, longitude, heading, updated_at: now,
        });
        if (error) throw error;
        setDriverGpsError('');
        setDriverGpsUpdatedAt(now);
        locationWatch.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 15000, distanceInterval: 25 },
          location => {
            if (active) setDriverGpsUpdatedAt(new Date(location.timestamp || Date.now()).toISOString());
          },
          reason => { if (active) setDriverGpsError(errorText(reason)); }
        );
      } catch (e) {
        if (active) { setDriverGpsError(errorText(e)); Alert.alert('Геолокация водителя', errorText(e)); }
      }
    })();
    return () => {
      active = false;
      if (locationWatch.current) { locationWatch.current.remove(); locationWatch.current = null; }
    };
  }, [isDriver, user, driverOnline]);

  useEffect(() => {
    if (mode !== 'passenger' || !activeOrder?.driver_id || !['accepted', 'arrived', 'in_progress'].includes(activeOrder.status)) {
      setAssignedDriver(null);
      return;
    }
    let alive = true;
    const driverId = activeOrder.driver_id;
    Promise.all([
      supabase.from('profiles').select('phone').eq('id', driverId).maybeSingle(),
      supabase.from('driver_applications').select('full_name, experience, phone')
        .eq('user_id', driverId).eq('status', 'approved')
        .order('reviewed_at', { ascending: false }).limit(1).maybeSingle(),
    ]).then(([profileResult, applicationResult]) => {
      if (!alive) return;
      setAssignedDriver({
        name: applicationResult.data?.full_name || 'Водитель LadyGo',
        experience: applicationResult.data?.experience || '',
        phone: applicationResult.data?.phone || profileResult.data?.phone || null,
      });
    }).catch(() => { if (alive) setAssignedDriver(null); });
    return () => { alive = false; };
  }, [mode, activeOrder?.driver_id, activeOrder?.status]);

  useEffect(() => {
    if (mode !== 'passenger' || !activeOrder?.driver_id) { setDriverLocation(null); return; }
    let alive = true;
    const driverId = activeOrder.driver_id;
    supabase.from('driver_locations').select('*').eq('driver_id', driverId).maybeSingle()
      .then(({ data }) => { if (alive && data) setDriverLocation({ latitude: data.latitude, longitude: data.longitude, updated_at: data.updated_at }); });
    const channel = supabase.channel('ladygo-driver-location-' + driverId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations', filter: 'driver_id=eq.' + driverId }, payload => {
        const row = payload.new;
        if (alive && row?.latitude != null && row?.longitude != null) setDriverLocation({ latitude: row.latitude, longitude: row.longitude, updated_at: row.updated_at });
      }).subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [mode, activeOrder?.driver_id]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel('ladygo-applications-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_applications', filter: 'user_id=eq.' + user.id }, async () => {
        await loadApplications();
        await loadProfile(user);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadApplications, loadProfile]);

  useEffect(() => {
    if (!isDriver || !user) return;
    const channel = supabase.channel('ladygo-offers-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_offers', filter: 'driver_id=eq.' + user.id }, () => loadOrders().catch(() => {}))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isDriver, user, loadOrders]);
  useEffect(() => {
    if (!user || !supabase) return;
    const channel = supabase.channel('ladygo-orders-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadOrders().catch(() => {}))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadOrders]);

  useEffect(() => {
    if (!user || !supabase) return;
    const channel = supabase.channel('ladygo-notifications-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + user.id }, () => loadNotifications().catch(() => {}))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadNotifications]);

  const markNotificationRead = async notification => {
    if (notification.read_at) return;
    const readAt = new Date().toISOString();
    const { error } = await supabase.from('notifications').update({ read_at: readAt })
      .eq('id', notification.id).eq('user_id', user.id);
    if (error) return Alert.alert('Уведомления', errorText(error));
    setNotifications(current => current.map(item => item.id === notification.id ? { ...item, read_at: readAt } : item));
  };

  const signIn = async () => {
    if (!email.trim() || !password) return Alert.alert('Заполни поля', 'Укажи почту и пароль.');
    setBusy(true);
    const result = authMode === 'signup'
      ? await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: 'ladygo://auth/callback' } })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (result.error) return Alert.alert('Авторизация', errorText(result.error));
    if (authMode === 'signup' && !result.data.session) Alert.alert('Проверь почту', 'Отправили письмо для подтверждения аккаунта.');
  };

  const getCurrentLocation = async () => {
    if (locationBusy) return;
    setLocationBusy(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        const message = permission.canAskAgain
          ? 'Разреши LadyGo доступ к местоположению при использовании приложения.'
          : 'Доступ запрещён. Открой настройки Android → Приложения → LadyGo → Разрешения → Местоположение.';
        throw new Error(message);
      }
      const loc = await getPositionWithFallback();
      const point = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setCoords(point);
      mapRef.current?.animateToRegion({ ...point, latitudeDelta: 0.012, longitudeDelta: 0.012 }, 650);
      try {
        const addresses = await Location.reverseGeocodeAsync(point);
        const a = addresses?.[0];
        const address = [a?.street, a?.streetNumber, a?.district, a?.city].filter(Boolean).join(', ');
        setPickup(address || 'Моё местоположение');
      } catch (_) {
        setPickup('Моё местоположение');
      }
    } catch (e) {
      Alert.alert('Не удалось определить местоположение', errorText(e));
    } finally {
      setLocationBusy(false);
    }
  };

  const buildRoute = async () => {
    if (!pickup.trim() || !destination.trim()) return Alert.alert('Маршрут', 'Укажи адрес подачи и назначения.');
    setLocationBusy(true);
    try {
      const addresses = [pickup.trim(), ...stopsText.split(/\n+/).map(x => x.trim()).filter(Boolean), destination.trim()];
      if (addresses.length > 22) throw new Error('Можно добавить не больше 20 промежуточных точек.');
      const points = [];
      for (let i = 0; i < addresses.length; i++) {
        let result;
        if (i === 0 && coords) result = coords;
        else if (i === addresses.length - 1 && destinationCoords) result = destinationCoords;
        else result = (await Location.geocodeAsync(addresses[i]))[0];
        if (!result || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) {
          throw new Error('Не удалось найти адрес: ' + addresses[i]);
        }
        points.push({ latitude: result.latitude, longitude: result.longitude });
      }
      const start = points[0], end = points[points.length - 1];
      const coordinates = points.map(p => p.longitude + ',' + p.latitude).join(';');
      const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Сервис маршрутов временно недоступен.');
      const json = await response.json();
      const r = json.routes?.[0];
      if (!r || !r.geometry?.coordinates?.length) throw new Error('Не удалось построить автомобильный маршрут по этим адресам.');
      setCoords(start); setDestinationCoords(end); setStopCoords(points.slice(1, -1));
      setRoute(r.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })));
      setRouteInfo({ km: (r.distance / 1000).toFixed(1), minutes: Math.max(1, Math.round(r.duration / 60)) });
    } catch (e) {
      setRoute([]); setRouteInfo(null); setStopCoords([]);
      Alert.alert('Не удалось построить маршрут', errorText(e));
    } finally {
      setLocationBusy(false);
    }
  };

  const savePlace = async () => {
    if (!savedLabel.trim() || !savedAddress.trim()) return Alert.alert('Сохранённый адрес', 'Укажи название и адрес.');
    const { error } = await supabase.from('saved_places').insert({ user_id: user.id, label: savedLabel.trim(), address: savedAddress.trim() });
    if (error) return Alert.alert('Не удалось сохранить адрес', errorText(error));
    setSavedAddress(''); await loadSavedPlaces();
  };

  const createOrder = async () => {
    if (!pickup.trim() || !destination.trim()) return Alert.alert('Маршрут не заполнен', 'Укажи адрес подачи и назначения.');
    if (activeOrder) return Alert.alert('У тебя уже есть активный заказ', 'Заверши или отмени текущую поездку перед новым заказом.');
    setBusy(true);
    try {
      let start = coords, end = destinationCoords;
      if (!start) { const x = (await Location.geocodeAsync(pickup))[0]; if (x) start = { latitude: x.latitude, longitude: x.longitude }; }
      if (!end) { const x = (await Location.geocodeAsync(destination))[0]; if (x) end = { latitude: x.latitude, longitude: x.longitude }; }
      const stopAddresses = stopsText.split(/\n+/).map(x => x.trim()).filter(Boolean);
      if (stopAddresses.length > 20) throw new Error('Можно добавить не больше 20 промежуточных точек.');
      const structuredStops = [];
      for (let i = 0; i < stopAddresses.length; i++) {
        let point = stopCoords.length === stopAddresses.length ? stopCoords[i] : null;
        if (!point) {
          const found = (await Location.geocodeAsync(stopAddresses[i]))[0];
          if (!found) throw new Error('Не удалось найти промежуточную точку: ' + stopAddresses[i]);
          point = { latitude: found.latitude, longitude: found.longitude };
        }
        structuredStops.push({ sequence: i + 1, address: stopAddresses[i], latitude: point.latitude, longitude: point.longitude });
      }
      const selected = TARIFFS.find(t => t.id === tariff);
      const payload = {
        passenger_id: user.id, pickup_address: pickup.trim(), destination_address: destination.trim(),
        requested_for: requestedFor.trim() || 'Как можно скорее', passenger_phone: phone.trim() || null,
        notes: [comment.trim(), 'Тариф: ' + (selected?.name || 'Эконом'), routeInfo ? `Маршрут: ${routeInfo.km} км, около ${routeInfo.minutes} мин` : ''].filter(Boolean).join(' | '),
        stops: structuredStops,
        status: 'new',
        ...(start ? { pickup_lat: start.latitude, pickup_lng: start.longitude } : {}),
        ...(end ? { destination_lat: end.latitude, destination_lng: end.longitude } : {}),
      };
      const { error } = await supabase.from('orders').insert(payload);
      if (error) throw error;
      Alert.alert('Заказ отправлен', 'Ищем свободного водителя. Стоимость подтвердит водитель.');
      setTab('trips');
      await loadOrders();
    } catch (e) { Alert.alert('Не удалось заказать поездку', errorText(e)); }
    setBusy(false);
  };

  const updateOrder = async (order, status) => {
    setBusy(true);
    const { data, error } = await supabase.rpc('ladygo_update_trip_status', { p_order_id: order.id, p_status: status });
    setBusy(false);
    if (error) return Alert.alert('Ошибка заказа', errorText(error));
    if (!data) return Alert.alert('Статус не изменён', 'Обнови список заказов.');
    await loadOrders();
  };

  const setDriverAvailability = async nextOnline => {
    if (!nextOnline && orders.some(order => order.driver_id === user.id && ['accepted', 'arrived', 'in_progress'].includes(order.status))) {
      return Alert.alert('Поездка ещё не завершена', 'Сначала заверши активную поездку, затем можно закончить смену.');
    }
    setBusy(true);
    try {
      if (nextOnline) {
        if (!(await TaskManager.isAvailableAsync())) throw new Error('Фоновая геолокация недоступна в Expo Go. Нужна установленная Android-сборка LadyGo.');
        const foreground = await Location.requestForegroundPermissionsAsync();
        if (foreground.status !== 'granted') throw new Error('Без доступа к геолокации нельзя выйти на линию.');
        const background = await Location.requestBackgroundPermissionsAsync();
        if (background.status !== 'granted') throw new Error('Не выдан постоянный доступ к местоположению. В настройках Android выбери «Разрешить всегда», чтобы получать заказы при свёрнутом приложении.');
        const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK);
        if (!alreadyStarted) {
          await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 12000,
            distanceInterval: 20,
            deferredUpdatesInterval: 30000,
            deferredUpdatesDistance: 40,
            pausesUpdatesAutomatically: false,
            showsBackgroundLocationIndicator: true,
            ...(Platform.OS === 'android' ? {
              foregroundService: {
                notificationTitle: 'LadyGo — водитель на линии',
                notificationBody: 'Геолокация обновляется, пока вы принимаете заказы.',
                notificationColor: C.pink,
                killServiceOnDestroy: false,
              },
            } : {}),
          });
        }
        const initial = await getPositionWithFallback();
        const now = new Date().toISOString();
        const { latitude, longitude, heading } = initial.coords;
        const { error: locationError } = await supabase.from('driver_locations').upsert({
          driver_id: user.id, latitude, longitude, heading, updated_at: now,
        });
        if (locationError) throw locationError;
        const { error } = await supabase.from('driver_presence').upsert({ driver_id: user.id, is_online: true, updated_at: now });
        if (error) throw error;
        setDriverGpsError('');
        setDriverGpsUpdatedAt(now);
        setDriverOnline(true);
      } else {
        const now = new Date().toISOString();
        const { error } = await supabase.from('driver_presence').upsert({ driver_id: user.id, is_online: false, updated_at: now });
        if (error) throw error;
        setDriverOnline(false);
        if (locationWatch.current) { locationWatch.current.remove(); locationWatch.current = null; }
        const registered = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => false);
        if (registered) await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
      }
    } catch (e) {
      if (nextOnline) {
        const registered = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => false);
        if (registered) await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => {});
      }
      Alert.alert('Статус водителя', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const acceptOfferedOrder = async (order) => {
    const value = Number(String(fare[order.id] || '').replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0 || value > 1000000) return Alert.alert('Стоимость', 'Введи стоимость от 1 до 1 000 000 ₽.');
    setBusy(true);
    const { error } = await supabase.rpc('ladygo_accept_order', { p_order_id: order.id, p_price: value });
    setBusy(false);
    if (error) return Alert.alert('Не удалось принять заказ', errorText(error));
    setFare(p => ({ ...p, [order.id]: '' }));
    await loadOrders();
    Alert.alert('Заказ принят', 'Стоимость: ' + value + ' ₽');
  };

  const skipOfferedOrder = async order => {
    setBusy(true);
    const { data, error } = await supabase.rpc('ladygo_skip_order_offer', { p_order_id: order.id });
    setBusy(false);
    if (error) Alert.alert('Не удалось пропустить заказ', errorText(error));
    else { await loadOrders(); }
  };

  const cancelOrder = order => Alert.alert('Отменить заказ?', 'Водитель больше не будет выполнять эту поездку.', [
    { text: 'Не отменять', style: 'cancel' },
    { text: 'Отменить', style: 'destructive', onPress: async () => {
      const { error } = await supabase.rpc('cancel_my_order', { order_id: order.id });
      if (error) Alert.alert('Не удалось отменить', errorText(error));
      else await loadOrders();
    } },
  ]);

  const submitApplication = async () => {
    if (!applicationName.trim() || !applicationPhone.trim()) return Alert.alert('Заполни данные', 'Нужны имя и телефон для связи.');
    setBusy(true);
    const { error } = await supabase.from('driver_applications').insert({
      user_id: user.id, full_name: applicationName.trim(), phone: applicationPhone.trim(),
      experience: [applicationCar.trim() ? 'Автомобиль: ' + applicationCar.trim() : '', applicationNote.trim()].filter(Boolean).join(' | '),
      license_info: 'Готов предоставить документы для проверки', status: 'pending',
    });
    setBusy(false);
    if (error) return Alert.alert('Заявка', errorText(error));
    Alert.alert('Заявка отправлена', 'Администратор рассмотрит её.');
    loadApplications();
  };

  const reviewApplication = async (app, approved) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('driver_applications')
        .update({ status: approved ? 'approved' : 'rejected' }).eq('id', app.id);
      if (error) throw error;
      await loadApplications();
    } catch (e) { Alert.alert('Не удалось обработать заявку', errorText(e)); }
    setBusy(false);
  };

  const resetPassword = async () => {
    if (!email.trim()) return Alert.alert('Восстановление пароля', 'Сначала введи свою почту.');
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: 'ladygo://auth/callback' });
    setBusy(false);
    if (error) Alert.alert('Не удалось отправить письмо', errorText(error));
    else Alert.alert('Письмо отправлено', 'Проверь почту и перейди по ссылке для восстановления пароля.');
  };

  const logout = async () => {
    if (isDriver && user) {
      await supabase.from('driver_presence').upsert({
        driver_id: user.id, is_online: false, updated_at: new Date().toISOString(),
      });
      const registered = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => false);
      if (registered) await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => {});
    }
    await supabase.auth.signOut();
  };

  if (booting) return <View style={s.center}><ActivityIndicator color={C.pink} size="large" /><Text style={s.muted}>Загружаем LadyGo…</Text></View>;
  if (!isConfigured) return <View style={s.center}><Text style={s.brand}>LadyGo</Text><Text style={s.heading}>Нужно подключить сервер</Text><Text style={s.muted}>Добавь EXPO_PUBLIC_SUPABASE_URL и EXPO_PUBLIC_SUPABASE_ANON_KEY в переменные окружения Expo.</Text></View>;
  if (!session) return <SafeAreaView style={s.safe}><StatusBar barStyle="dark-content" backgroundColor={C.pale} /><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.auth}>
    <Text style={s.brand}>LadyGo</Text><Text style={s.tagline}>Поездки с заботой</Text>
    <Card><Text style={s.title}>{authMode === 'login' ? 'С возвращением' : 'Создать аккаунт'}</Text>
      <Input label="Электронная почта" value={email} onChangeText={setEmail} keyboardType="email-address" />
      <Input label="Пароль" value={password} onChangeText={setPassword} secureTextEntry />
      {authMode === 'login' && <TouchableOpacity onPress={resetPassword} disabled={busy}><Text style={{ color: C.pinkDark, fontWeight: '700', textAlign: 'right', paddingVertical: 8 }}>Забыли пароль?</Text></TouchableOpacity>}
      <Button title={busy ? 'Подождите…' : authMode === 'login' ? 'Войти' : 'Зарегистрироваться'} onPress={signIn} disabled={busy} />
      <Button title={authMode === 'login' ? 'Создать аккаунт' : 'У меня уже есть аккаунт'} secondary onPress={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} />
    </Card><Text style={s.muted}>LadyGo • Комфортные поездки</Text>
  </KeyboardAvoidingView></SafeAreaView>;

  const mapRegion = coords ? { ...coords, latitudeDelta: 0.045, longitudeDelta: 0.045 } : {
    latitude: 43.905, longitude: 42.716, latitudeDelta: 0.12, longitudeDelta: 0.12,
  };

  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle="dark-content" backgroundColor={C.white} />
    <View style={s.topbar}>
      <View><Text style={s.brandSmall}>LadyGo</Text><Text style={s.topSub}>Поездки с заботой</Text></View>
      <TouchableOpacity style={s.avatar} onPress={() => setTab('profile')}><Text style={s.avatarText}>{(profile?.email || 'L')[0].toUpperCase()}</Text></TouchableOpacity>
    </View>
    <View style={s.rolebar}>
      <TouchableOpacity onPress={() => { setMode('passenger'); setTab('ride'); }} style={[s.roleButton, mode === 'passenger' && s.roleActive]}><Text style={[s.roleText, mode === 'passenger' && s.roleTextActive]}>Пассажир</Text></TouchableOpacity>
      {isDriver && <TouchableOpacity onPress={() => { setMode('driver'); setTab('ride'); }} style={[s.roleButton, mode === 'driver' && s.roleActive]}><Text style={[s.roleText, mode === 'driver' && s.roleTextActive]}>Водитель</Text></TouchableOpacity>}
      {isAdmin && <TouchableOpacity onPress={() => { setMode('admin'); setTab('ride'); }} style={[s.roleButton, mode === 'admin' && s.roleActive]}><Text style={[s.roleText, mode === 'admin' && s.roleTextActive]}>Администратор</Text></TouchableOpacity>}
    </View>

    {mode === 'passenger' && tab === 'ride' && <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      {activeOrder && <Card><View style={s.rowBetween}><Pill>{STATUS[activeOrder.status] || activeOrder.status}</Pill><Text style={s.price}>{money(activeOrder.price_rub)}</Text></View><Text style={s.address}>Откуда: {activeOrder.pickup_address}</Text><Text style={s.address}>Куда: {activeOrder.destination_address}</Text><TripMap order={activeOrder} />{activeOrder.status === 'new' && <Text style={s.muted}>Ожидаем подтверждения водителя.</Text>}{assignedDriver && <View style={{ gap: 6 }}><Text style={s.tariffName}>{assignedDriver.name}</Text>{assignedDriver.experience ? <Text style={s.muted}>{assignedDriver.experience}</Text> : null}{assignedDriver.phone ? <Button title="Позвонить водителю" secondary compact onPress={() => Linking.openURL('tel:' + assignedDriver.phone)} /> : null}</View>}</Card>}
      <View style={s.mapWrap}><MapView ref={mapRef} style={s.map} region={driverLocation ? { ...driverLocation, latitudeDelta: 0.025, longitudeDelta: 0.025 } : mapRegion} showsUserLocation showsMyLocationButton={false}>
        {coords && <Marker coordinate={coords} title="Подача" pinColor={C.pink} />}
        {stopCoords.map((point, index) => <Marker key={'stop-' + index} coordinate={point} title={'Остановка ' + (index + 1)} pinColor="#D69A35" />)}
        {destinationCoords && <Marker coordinate={destinationCoords} title="Назначение" pinColor={C.blue} />}
        {driverLocation && <Marker coordinate={driverLocation} title="Автомобиль LadyGo" pinColor="#26865A" />}
        {route.length > 1 && <Polyline coordinates={route} strokeColor={C.pink} strokeWidth={5} />}
      </MapView><TouchableOpacity style={s.locButton} onPress={getCurrentLocation}><Text style={s.locText}>{locationBusy ? 'Определяем…' : '◎ Моё местоположение'}</Text></TouchableOpacity></View>
      <Card>
        <Text style={s.title}>Куда едем?</Text>
        <Input label="Откуда" value={pickup} onChangeText={v => { setPickup(v); setCoords(null); setStopCoords([]); setRoute([]); setRouteInfo(null); }} placeholder="Адрес подачи" />
        <Button title="Определить моё местоположение" secondary compact onPress={getCurrentLocation} />
        <Input label="Куда" value={destination} onChangeText={v => { setDestination(v); setDestinationCoords(null); setStopCoords([]); setRoute([]); setRouteInfo(null); }} placeholder="Адрес назначения" />
        <Input label="Промежуточные точки (по одной на строку)" value={stopsText} onChangeText={v => { setStopsText(v); setStopCoords([]); setRoute([]); setRouteInfo(null); }} multiline placeholder="Можно оставить пустым" />
        <Input label="Когда подать машину" value={requestedFor} onChangeText={setRequestedFor} placeholder="Как можно скорее или дата и время" />
        {savedPlaces.length > 0 && <View style={{ gap: 6 }}><Text style={s.label}>Сохранённые адреса</Text><View style={s.row}>{savedPlaces.slice(0, 3).map(p => <TouchableOpacity key={p.id} style={s.savedChip} onPress={() => { setPickup(p.address); setCoords(null); setStopCoords([]); setRoute([]); setRouteInfo(null); }}><Text style={s.savedChipText}>{p.label}</Text></TouchableOpacity>)}</View></View>}
        <Button title="Построить маршрут" secondary compact onPress={buildRoute} />
        {routeInfo && <Text style={s.routeInfo}>{routeInfo.km} км · около {routeInfo.minutes} мин в пути</Text>}
      </Card>
      <Text style={s.section}>Выберите тариф</Text>
      {TARIFFS.map(t => <TouchableOpacity key={t.id} onPress={() => setTariff(t.id)} style={[s.tariff, tariff === t.id && s.tariffSelected]}>
        <View style={s.tariffIcon}><Text style={s.tariffEmoji}>{t.id === 'child' ? '♡' : t.id === 'comfort' ? '✦' : '↗'}</Text></View>
        <View style={{ flex: 1 }}><Text style={s.tariffName}>{t.name}</Text><Text style={s.muted}>{t.detail}</Text></View>
        <View style={[s.radio, tariff === t.id && s.radioOn]} />
      </TouchableOpacity>)}
      <Card><Text style={s.section}>Пожелания к поездке</Text>
        <Input label="Телефон для связи (необязательно)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+7…" />
        <Input label="Комментарий водителю" value={comment} onChangeText={setComment} multiline placeholder="Например, подъехать к главному входу" />
        <Button title={busy ? 'Отправляем…' : 'Заказать поездку'} onPress={createOrder} disabled={busy} />
        <Text style={s.disclaimer}>Стоимость поездки подтвердит водитель до начала поездки. Оплата — по договорённости.</Text>
      </Card>
    </ScrollView>}

    {mode === 'passenger' && tab === 'trips' && <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>Мои поездки</Text>
      {orders.length === 0 && <Card><Text style={s.muted}>Здесь появятся твои заказы.</Text></Card>}
      {orders.map(o => <Card key={o.id}>
        <View style={s.rowBetween}><Pill color={o.status === 'completed' ? C.green : o.status === 'cancelled' ? C.red : C.pink}>{STATUS[o.status] || o.status}</Pill><Text style={s.price}>{money(o.price_rub)}</Text></View>
        <Text style={s.address}>● {o.pickup_address}</Text><Text style={s.address}>● {o.destination_address}</Text>
        {o.driver_id && <Text style={s.muted}>Водитель назначен</Text>}
        {o.status === 'new' && !o.driver_id && <Button title="Отменить заказ" danger secondary onPress={() => cancelOrder(o)} />}
      </Card>)}
    </ScrollView>}

    {mode === 'driver' && <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>Рабочий экран</Text>
      <Card><Text style={s.muted}>Статус водителя</Text><Text style={s.heading}>{driverOnline ? 'На линии' : 'Не на линии'}</Text>
        <Button title={busy ? 'Сохраняем…' : driverOnline ? 'Завершить смену' : 'Выйти на линию'} onPress={() => driverOnline ? setDriverAvailability(false) : Alert.alert('Фоновая геолокация', 'Во время смены LadyGo будет передавать местоположение, даже когда приложение свёрнуто. На Android появится постоянное системное уведомление. Разрешение нужно только водителю на линии.', [{ text: 'Отмена', style: 'cancel' }, { text: 'Продолжить', onPress: () => setDriverAvailability(true) }])} disabled={busy} secondary={!driverOnline} />
        <Text style={s.disclaimer}>При выходе на линию LadyGo обновляет геопозицию и статус доступности даже при свёрнутом приложении. На Android отображается системное уведомление о работе геолокации.</Text>
        {driverGpsError ? <Text style={{ color: C.red, fontSize: 12, marginTop: 8 }}>Геолокация: {driverGpsError}</Text> : driverOnline && <Text style={{ color: C.green, fontSize: 12, marginTop: 8 }}>Геопозиция отправлена{driverGpsUpdatedAt ? ' · ' + new Date(driverGpsUpdatedAt).toLocaleTimeString() : ''}</Text>}
      </Card>
      <Text style={s.section}>Доступные заказы</Text>
      {orders.filter(o => o.status === 'new' && !o.driver_id).map(o => <Card key={o.id}>
        <View style={s.rowBetween}><Pill>Новый заказ</Pill><Text style={s.price}>{Math.max(0, 30 - Math.floor((clock - new Date(offerTimes[o.id] || o.created_at).getTime()) / 1000))} сек.</Text></View><Text style={s.address}>Забрать: {o.pickup_address}</Text><Text style={s.address}>Доставить: {o.destination_address}</Text>
        <Input label="Предложить стоимость, ₽" value={String(fare[o.id] || '')} onChangeText={v => setFare(p => ({ ...p, [o.id]: v }))} keyboardType="numeric" placeholder="Например, 450" />
        <Button title="Принять заказ" disabled={busy} onPress={() => acceptOfferedOrder(o)} />
        <Button title="Пропустить" secondary onPress={() => skipOfferedOrder(o)} disabled={busy} compact />
      </Card>)}
      <Text style={s.section}>Мои активные поездки</Text>
      {orders.filter(o => ACTIVE.includes(o.status) && o.driver_id === user.id).map(o => <Card key={o.id}>
        <Pill>{STATUS[o.status] || o.status}</Pill><TripMap order={o} /><Text style={s.address}>Забрать: {o.pickup_address}</Text><Text style={s.address}>Доставить: {o.destination_address}</Text><Button title="Открыть навигацию" secondary onPress={() => openDriverNavigation(o)} />
        {Array.isArray(o.stops) && o.stops.length > 0 ? <View style={{ gap: 4 }}><Text style={s.label}>Промежуточные остановки</Text>{o.stops.map((stop, index) => <Text key={'order-stop-' + index} style={s.muted}>{index + 1}. {stop.address}</Text>)}</View> : null}
        {o.notes ? <Text style={s.muted}>{o.notes}</Text> : null}
        {o.passenger_phone ? <Button title="Позвонить пассажиру" secondary compact onPress={() => Linking.openURL('tel:' + o.passenger_phone)} /> : null}
        {o.status === 'accepted' && <Button title="Я на месте" onPress={() => updateOrder(o, 'arrived')} />}
        {o.status === 'arrived' && <Button title="Начать поездку" onPress={() => updateOrder(o, 'in_progress')} />}
        {o.status === 'in_progress' && <Button title="Завершить поездку" onPress={() => updateOrder(o, 'completed')} />}
      </Card>)}
      {orders.filter(o => ACTIVE.includes(o.status) && o.driver_id === user.id).length === 0 && <Card><Text style={s.muted}>Активных назначенных заказов пока нет.</Text></Card>}
    </ScrollView>}

    {tab === 'notifications' && <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>Уведомления</Text>
      {notifications.length === 0 && <Card><Text style={s.muted}>Пока новых уведомлений нет.</Text></Card>}
      {notifications.map(item => <TouchableOpacity key={item.id} activeOpacity={0.85} onPress={() => markNotificationRead(item)}>
        <Card style={!item.read_at ? { borderColor: C.pink, borderWidth: 1 } : null}>
          <View style={s.rowBetween}><Text style={s.heading}>{item.title}</Text>{!item.read_at && <Pill>Новое</Pill>}</View>
          <Text style={s.address}>{item.body}</Text>
          <Text style={s.muted}>{new Date(item.created_at).toLocaleString()}</Text>
        </Card>
      </TouchableOpacity>)}
    </ScrollView>}

    {mode === 'admin' && <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>Панель администратора</Text>
      <View style={s.stats}><Card style={s.stat}><Text style={s.statNum}>{orders.length}</Text><Text style={s.muted}>Заказов</Text></Card><Card style={s.stat}><Text style={s.statNum}>{applications.filter(a => a.status === 'pending').length}</Text><Text style={s.muted}>Заявок</Text></Card></View>
      <Text style={s.section}>Заявки водителей</Text>
      {applications.map(a => <Card key={a.id}><Text style={s.tariffName}>{a.full_name || 'Водитель'}</Text><Text style={s.muted}>{a.phone}</Text><Text style={s.muted}>{a.experience}</Text><Pill color={a.status === 'approved' ? C.green : a.status === 'rejected' ? C.red : C.pink}>{a.status}</Pill>
        {a.status === 'pending' && <View style={s.row}><View style={{ flex: 1 }}><Button title="Одобрить" onPress={() => reviewApplication(a, true)} /></View><View style={{ flex: 1 }}><Button title="Отклонить" secondary danger onPress={() => reviewApplication(a, false)} /></View></View>}
      </Card>)}
      <Text style={s.section}>Последние заказы</Text>
      {orders.slice(0, 12).map(o => <Card key={o.id}><Pill>{STATUS[o.status] || o.status}</Pill><Text style={s.address}>{o.pickup_address} → {o.destination_address}</Text></Card>)}
    </ScrollView>}

    {tab === 'profile' && <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>Профиль</Text><Card><Text style={s.tariffName}>{profile?.email}</Text><Text style={s.muted}>Роль: {role}</Text></Card>
      {!isDriver && !isAdmin && applications[0] && <Card><Text style={s.section}>Заявка водителя</Text><Pill color={applications[0].status === 'approved' ? C.green : applications[0].status === 'rejected' ? C.red : C.pink}>{applications[0].status === 'approved' ? 'Одобрена' : applications[0].status === 'rejected' ? 'Отклонена' : 'На рассмотрении'}</Pill></Card>}
      {!isDriver && !isAdmin && <Card><Text style={s.section}>Сохранённые адреса</Text><Input label="Название" value={savedLabel} onChangeText={setSavedLabel} placeholder="Дом, работа…" /><Input label="Адрес" value={savedAddress} onChangeText={setSavedAddress} placeholder="Введите адрес" /><Button title="Сохранить адрес" onPress={savePlace} compact />{savedPlaces.map(p => <TouchableOpacity key={p.id} onPress={() => { setPickup(p.address); setCoords(null); setRoute([]); setRouteInfo(null); setTab('ride'); }}><Text style={s.address}>{p.label}: {p.address}</Text></TouchableOpacity>)}</Card>}
      {!isDriver && !isAdmin && <Card><Text style={s.section}>Стать водителем</Text><Input label="ФИО" value={applicationName} onChangeText={setApplicationName} /><Input label="Телефон" value={applicationPhone} onChangeText={setApplicationPhone} keyboardType="phone-pad" /><Input label="Автомобиль" value={applicationCar} onChangeText={setApplicationCar} /><Input label="Опыт и комментарий" value={applicationNote} onChangeText={setApplicationNote} multiline /><Button title="Отправить заявку" onPress={submitApplication} disabled={busy} /></Card>}
      <Button title="Связаться с поддержкой" secondary onPress={() => Linking.openURL('mailto:' + SUPPORT)} />
      <Button title="Позвонить водителю" secondary onPress={() => Linking.openURL('tel:' + PHONE)} />
      <Button title="Выйти из аккаунта" danger secondary onPress={logout} />
    </ScrollView>}

    <View style={s.bottomNav}>
      {(mode === 'passenger' ? [{ id: 'ride', label: 'Заказать', icon: '⌖' }, { id: 'trips', label: 'Поездки', icon: '▤' }, { id: 'notifications', label: 'События', icon: '♧' }, { id: 'profile', label: 'Профиль', icon: '◯' }] : [{ id: 'ride', label: mode === 'admin' ? 'Обзор' : 'Работа', icon: '⌖' }, { id: 'notifications', label: 'События', icon: '♧' }, { id: 'profile', label: 'Профиль', icon: '◯' }]).map(item =>
        <TouchableOpacity key={item.id} onPress={() => setTab(item.id)} style={s.navItem}>
          <Text style={[s.navIcon, tab === item.id && { color: C.pink }]}>{item.icon}</Text>
          <Text style={[s.navLabel, tab === item.id && { color: C.pink, fontWeight: '800' }]}>{item.label}</Text>
        </TouchableOpacity>)}
    </View>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: C.pale },
  auth: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: C.pale },
  brand: { color: C.pink, fontSize: 42, fontWeight: '900', textAlign: 'center', letterSpacing: -1 },
  brandSmall: { color: C.pink, fontSize: 26, fontWeight: '900', letterSpacing: -0.7 },
  tagline: { textAlign: 'center', color: C.muted, marginBottom: 28, marginTop: 4 },
  topSub: { color: C.muted, fontSize: 11, marginTop: -2 },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.pale, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.pinkDark, fontSize: 17, fontWeight: '800' },
  rolebar: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: C.pale, borderRadius: 15, padding: 4, marginBottom: 4 },
  roleButton: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  roleActive: { backgroundColor: C.white, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 5, elevation: 2 },
  roleText: { color: C.muted, fontWeight: '700', fontSize: 12 },
  roleTextActive: { color: C.pinkDark },
  content: { padding: 16, paddingBottom: 30, gap: 12 },
  mapWrap: { height: 245, borderRadius: 20, overflow: 'hidden', position: 'relative', backgroundColor: C.map },
  map: { flex: 1 },
  locButton: { position: 'absolute', bottom: 12, right: 12, backgroundColor: C.white, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, elevation: 3 },
  locText: { color: C.ink, fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: C.white, borderRadius: 19, borderWidth: 1, borderColor: C.line, padding: 16, gap: 10 },
  title: { fontSize: 23, fontWeight: '900', color: C.ink, letterSpacing: -0.4 },
  heading: { fontSize: 19, fontWeight: '800', color: C.ink },
  section: { color: C.ink, fontSize: 16, fontWeight: '800', marginTop: 4 },
  field: { gap: 6, marginTop: 4 },
  label: { color: C.muted, fontSize: 12, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 12, color: C.ink, backgroundColor: '#FFFCFD', fontSize: 15 },
  button: { backgroundColor: C.pink, paddingVertical: 15, paddingHorizontal: 15, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonSecondary: { backgroundColor: C.pale, borderWidth: 1, borderColor: '#F5D8E3' },
  buttonDanger: { backgroundColor: '#FFF5F6', borderColor: '#F1D6DC' },
  buttonText: { color: C.white, fontWeight: '800', fontSize: 14 },
  muted: { color: C.muted, fontSize: 12, lineHeight: 18 },
  routeInfo: { color: C.pinkDark, fontWeight: '800', fontSize: 13, paddingTop: 4 },
  tariff: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.white },
  tariffSelected: { borderColor: C.pink, backgroundColor: C.pale },
  tariffIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: C.pale, alignItems: 'center', justifyContent: 'center' },
  tariffEmoji: { color: C.pink, fontSize: 22, fontWeight: '900' },
  tariffName: { color: C.ink, fontWeight: '800', fontSize: 15 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#D8CBD1' },
  radioOn: { borderColor: C.pink, backgroundColor: C.pink, shadowColor: C.pink, shadowOpacity: 0.2, shadowRadius: 3 },
  disclaimer: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  pill: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: C.white },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', gap: 8 },
  price: { color: C.ink, fontWeight: '900', fontSize: 14 },
  address: { color: C.ink, fontSize: 14, lineHeight: 21 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 26, color: C.pink, fontWeight: '900' },
  bottomNav: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8, paddingBottom: Platform.OS === 'android' ? 8 : 4, backgroundColor: C.white },
  navItem: { flex: 1, alignItems: 'center', gap: 2 },
  navIcon: { color: C.muted, fontSize: 20, fontWeight: '700' },
  navLabel: { color: C.muted, fontSize: 10, fontWeight: '600' },
  savedChip: { backgroundColor: C.pale, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  savedChipText: { color: C.pinkDark, fontWeight: '700', fontSize: 12 },
});
